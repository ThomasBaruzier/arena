import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import createApp from '../src/app.js';
import { close as closeDb } from '../src/db.js';
import sse from '../src/sse.js';

const API_KEY = 'test-key';

const runStart = {
  type: 'run_start',
  run_id: 'recoverable',
  status: 'live',
  total_games: 2,
  board_size: 20,
  slots: [
    {
      slot: 1,
      name: 'Alpha',
      version: '1.0'
    },
    {
      slot: 2,
      name: 'Beta',
      version: '2.0'
    }
  ]
};

const gameStart = {
  type: 'start',
  external_id: 'recoverable_1_0',
  run_id: 'recoverable',
  black_slot: 1,
  white_slot: 2
};

const result = {
  type: 'result',
  external_id: 'recoverable_1_0',
  run_id: 'recoverable',
  winner: 1,
  moves: '10,10,1'
};

const update = {
  type: 'run_update',
  run_id: 'recoverable',
  status: 'live',
  games_played: 1,
  wins: 1,
  losses: 0,
  draws: 0
};

describe('viewer generation recovery', () => {
  let app;
  let directory;
  let databasePath;
  let consoleError;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.API_KEY = API_KEY;

    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-generation-'));

    databasePath = path.join(directory, 'games.db');

    app = createApp(databasePath);
  });

  afterEach(() => {
    const errors = consoleError?.mock.calls ?? [];

    consoleError?.mockRestore();
    closeDb();

    if (directory) {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }

    expect(errors).toEqual([]);
  });

  const post = (target, events) =>
    request(target).post('/api/batch').set('x-api-key', API_KEY).send(events).expect(200);

  it('changes generation when the API database is recreated', async () => {
    const first = await post(app, [runStart]);

    const firstGeneration = first.headers['x-arena-generation'];

    expect(firstGeneration).toBeTruthy();

    closeDb();

    app = createApp(databasePath);

    const second = await request(app).get('/api/runs').expect(200);

    const secondGeneration = second.headers['x-arena-generation'];

    expect(second.body).toEqual([]);

    expect(secondGeneration).toBeTruthy();

    expect(secondGeneration).not.toBe(firstGeneration);
  });

  it('accepts a complete recovery replay after restart', async () => {
    await post(app, [runStart, gameStart, result, update]);

    closeDb();

    app = createApp(databasePath);

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);

    await post(app, [runStart, gameStart, result, update]);

    const runs = (await request(app).get('/api/runs').expect(200)).body;

    expect(runs).toHaveLength(1);

    expect(runs[0]).toMatchObject({
      id: 'recoverable',
      games_played: 1,
      wins: 1
    });

    const games = (await request(app).get('/api/games?run_id=recoverable&hero_slot=1').expect(200))
      .body;

    expect(games).toHaveLength(1);

    expect(games[0].games[0]).toMatchObject({
      external_id: 'recoverable_1_0',
      winner_color: 1,
      move_count: 1
    });
  });

  it('returns the rotated reset generation through HTTP and SSE', async () => {
    const before = await request(app).get('/api/runs').expect(200);

    const firstGeneration = before.headers['x-arena-generation'];

    const broadcast = vi.spyOn(sse, 'broadcast');

    try {
      const resetResponse = await request(app)
        .delete('/api/reset')
        .set('x-api-key', API_KEY)
        .expect(200);

      const resetGeneration = resetResponse.headers['x-arena-generation'];

      expect(resetGeneration).toBeTruthy();

      expect(resetGeneration).not.toBe(firstGeneration);

      const resetPayload = broadcast.mock.results.at(-1)?.value;

      expect(resetPayload).toMatchObject({
        type: 'reset',
        generation: resetGeneration
      });

      const after = await request(app).get('/api/runs').expect(200);

      expect(after.headers['x-arena-generation']).toBe(resetGeneration);
    } finally {
      broadcast.mockRestore();
    }
  });

  it('guards numeric game ids with an optional generation', async () => {
    const created = await post(app, [runStart, gameStart]);

    const generation = created.headers['x-arena-generation'];

    const latest = await request(app).get('/api/latest-game').expect(200);

    const gameId = latest.body.id;

    expect(gameId).toBeTruthy();

    await request(app).get(`/api/game/${gameId}`).expect(200);

    await request(app)
      .get(`/api/game/${gameId}?g=${encodeURIComponent(generation)}`)
      .expect(200);

    const resetResponse = await request(app)
      .delete('/api/reset')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(resetResponse.headers['x-arena-generation']).not.toBe(generation);

    await request(app)
      .get(`/api/game/${gameId}?g=${encodeURIComponent(generation)}`)
      .expect(409);

    await request(app).get(`/api/game/${gameId}`).expect(404);
  });
});
