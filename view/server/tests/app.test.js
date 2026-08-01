import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb } from '../src/db.js';
import sse from '../src/sse.js';

const API_KEY = 'test-key';

const auth = {
  'x-api-key': API_KEY
};

const slots = [
  {
    slot: 1,
    name: 'Alpha',
    version: '1.0',
    cmd: './alpha'
  },
  {
    slot: 2,
    name: 'Beta',
    version: '2.0',
    cmd: './beta'
  }
];

const blackWin = '10,10,1;0,1,2;11,10,1;1,1,2;12,10,1;2,1,2;13,10,1;3,1,2;14,10,1';

const alternateBlackWin = '10,12,1;0,2,2;11,12,1;1,2,2;12,12,1;2,2,2;13,12,1;3,2,2;14,12,1';

const whiteWin = '10,10,1;0,1,2;11,10,1;1,1,2;12,10,1;2,1,2;13,10,1;3,1,2;14,11,1;4,1,2';

const earlyBlackWin = `${blackWin};4,1,2`;

const runStart = (runId, analysisEnabled = false, overrides = {}) => ({
  type: 'run_start',
  run_id: runId,
  status: 'live',
  analysis_enabled: analysisEnabled,
  slots,
  total_games: 2,
  board_size: 20,
  ...overrides
});

const runUpdate = (runId, status = 'live', overrides = {}) => ({
  type: 'run_update',
  run_id: runId,
  status,
  games_played: status === 'live' ? 0 : 1,
  wins: status === 'live' ? 0 : 1,
  losses: 0,
  draws: 0,
  ...overrides
});

const gameStart = (runId, pair, leg = 0) => ({
  type: 'start',
  external_id: `${runId}_${pair}_${leg}`,
  run_id: runId,
  black_slot: leg === 0 ? 1 : 2,
  white_slot: leg === 0 ? 2 : 1,
  op_len: 0
});

const move = (runId, pair, x, y, color, leg = 0) => ({
  type: 'move',
  external_id: `${runId}_${pair}_${leg}`,
  run_id: runId,
  x,
  y,
  c: color
});

const result = (runId, pair, { winner, reason, moves, duration = 100, leg = 0 }) => ({
  type: 'result',
  external_id: `${runId}_${pair}_${leg}`,
  run_id: runId,
  winner,
  reason,
  moves,
  duration,
  op_len: 0
});

const gamesUrl = (runId) => `/api/games?run_id=${encodeURIComponent(runId)}`;

describe('viewer routes', () => {
  let app;
  let directory;
  let consoleError;

  beforeEach(() => {
    process.env.API_KEY = API_KEY;

    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-routes-'));

    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    app = createApp(path.join(directory, 'games.db'));
  });

  afterEach(() => {
    const errors = consoleError.mock.calls;

    closeDb();
    vi.restoreAllMocks();

    fs.rmSync(directory, {
      recursive: true,
      force: true
    });

    expect(errors).toEqual([]);
  });

  const post = (events, status = 200) =>
    request(app).post('/api/batch').set(auth).send(events).expect(status);

  it('requires authentication', async () => {
    await request(app).post('/api/batch').send([]).expect(403);
  });

  it('rolls back the complete invalid batch', async () => {
    await post(
      [
        runStart('atomic'),
        {
          type: 'run_update',
          run_id: 'atomic',
          p1_time: null
        }
      ],
      422
    );

    const runs = (await request(app).get('/api/runs').expect(200)).body;

    expect(runs).toEqual([]);
  });

  it('rejects an opposite-color move on an occupied coordinate atomically', async () => {
    await post(
      [
        runStart('occupied'),
        gameStart('occupied', 1),
        move('occupied', 1, 10, 10, 1),
        move('occupied', 1, 10, 10, 2)
      ],
      422
    );

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);

    expect((await request(app).get(gamesUrl('occupied')).expect(200)).body).toEqual([]);
  });

  it('accepts an exact duplicate move', async () => {
    const declaration = runStart('duplicate-move');
    const start = gameStart('duplicate-move', 1);
    const firstMove = move('duplicate-move', 1, 10, 10, 1);

    await post([declaration, start, firstMove]);
    await post([firstMove]);

    const history = (await request(app).get(gamesUrl('duplicate-move')).expect(200)).body;

    expect(history[0].games[0].move_count).toBe(1);
  });

  it('accepts a final-move line win', async () => {
    await post([
      runStart('line'),
      gameStart('line', 1),
      result('line', 1, {
        winner: 1,
        reason: 'line',
        moves: blackWin
      })
    ]);

    const pair = (await request(app).get(gamesUrl('line')).expect(200)).body[0];

    expect(pair.games[0].winner_color).toBe(1);
  });

  it('accepts an adjudicated loss without a line', async () => {
    await post([
      runStart('adjudication'),
      gameStart('adjudication', 1),
      result('adjudication', 1, {
        winner: 2,
        reason: 'adjudication',
        moves: '10,10,1'
      })
    ]);

    const pair = (await request(app).get(gamesUrl('adjudication')).expect(200)).body[0];

    expect(pair.games[0].winner_color).toBe(2);
  });

  it('accepts an empty initialization adjudication', async () => {
    await post([
      runStart('startup'),
      gameStart('startup', 1),
      result('startup', 1, {
        winner: 1,
        reason: 'adjudication',
        moves: ''
      })
    ]);

    const pair = (await request(app).get(gamesUrl('startup')).expect(200)).body[0];

    expect(pair.games[0].winner_color).toBe(1);
  });

  it('rejects a fake line result', async () => {
    await post(
      [
        runStart('fake'),
        gameStart('fake', 1),
        result('fake', 1, {
          winner: 1,
          reason: 'line',
          moves: '10,10,1'
        })
      ],
      422
    );

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);
  });

  it('rejects moves after an earlier winner', async () => {
    await post(
      [
        runStart('late'),
        gameStart('late', 1),
        result('late', 1, {
          winner: 2,
          reason: 'line',
          moves: earlyBlackWin
        })
      ],
      422
    );

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);
  });

  it('accepts exact duplicate game events idempotently', async () => {
    const declaration = runStart('duplicate');
    const start = gameStart('duplicate', 1);
    const terminal = result('duplicate', 1, {
      winner: 1,
      reason: 'line',
      moves: blackWin
    });

    await post([declaration, start, terminal]);
    await post([declaration, start, terminal]);

    const history = (await request(app).get(gamesUrl('duplicate')).expect(200)).body;

    expect(history).toHaveLength(1);
    expect(history[0].games).toHaveLength(1);
  });

  it('replays an exact completed batch idempotently', async () => {
    const batch = [
      runStart('completed'),
      gameStart('completed', 1),
      result('completed', 1, {
        winner: 1,
        reason: 'line',
        moves: blackWin,
        duration: 987
      }),
      runUpdate('completed', 'ended', {
        games_played: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        wall_time_ms: 987
      })
    ];

    await post(batch);
    await post(batch);

    const runs = (await request(app).get('/api/runs').expect(200)).body;
    const storedRun = runs.find((run) => run.id === 'completed');

    expect(runs.filter((run) => run.id === 'completed')).toHaveLength(1);

    expect(storedRun).toMatchObject({
      status: 'ended',
      games_played: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      wall_time_ms: 987
    });

    const history = (await request(app).get(gamesUrl('completed')).expect(200)).body;

    expect(history).toHaveLength(1);
    expect(history[0].games).toHaveLength(1);

    const summary = history[0].games[0];

    expect(summary).toMatchObject({
      winner_color: 1,
      move_count: 9,
      duration: 987
    });

    const details = (await request(app).get(`/api/game/${summary.id}`).expect(200)).body;

    expect(details).toMatchObject({
      moves: blackWin,
      winner_color: 1,
      duration: 987
    });
  });

  it('rejects a duplicate result with another duration', async () => {
    const declaration = runStart('duplicate-duration');
    const start = gameStart('duplicate-duration', 1);
    const terminal = result('duplicate-duration', 1, {
      winner: 1,
      reason: 'line',
      moves: blackWin,
      duration: 100
    });

    await post([declaration, start, terminal]);

    await post(
      [
        {
          ...terminal,
          duration: 101
        }
      ],
      422
    );

    const history = (await request(app).get(gamesUrl('duplicate-duration')).expect(200)).body;

    expect(history[0].games[0].duration).toBe(100);
  });

  it('rejects conflicting duplicate results', async () => {
    const declaration = runStart('result-conflict');
    const start = gameStart('result-conflict', 1);
    const terminal = result('result-conflict', 1, {
      winner: 1,
      reason: 'line',
      moves: blackWin,
      duration: 100
    });

    await post([declaration, start, terminal]);

    const conflicts = [
      result('result-conflict', 1, {
        winner: 2,
        reason: 'line',
        moves: whiteWin,
        duration: 100
      }),
      result('result-conflict', 1, {
        winner: 1,
        reason: 'adjudication',
        moves: '10,10,1',
        duration: 100
      }),
      result('result-conflict', 1, {
        winner: 1,
        reason: 'line',
        moves: alternateBlackWin,
        duration: 100
      })
    ];

    for (const conflict of conflicts) {
      await post([conflict], 422);
    }

    const history = (await request(app).get(gamesUrl('result-conflict')).expect(200)).body;

    expect(history).toHaveLength(1);
    expect(history[0].games).toHaveLength(1);

    const details = (await request(app).get(`/api/game/${history[0].games[0].id}`).expect(200))
      .body;

    expect(details).toMatchObject({
      winner_color: 1,
      moves: blackWin,
      duration: 100
    });
  });

  it('rejects a changed run declaration', async () => {
    await post([runStart('immutable')]);

    await post(
      [
        runStart('immutable', false, {
          total_games: 4
        })
      ],
      422
    );

    const stored = (await request(app).get('/api/runs').expect(200)).body[0];

    expect(stored.total_games).toBe(2);
  });

  it('rejects a changed terminal run status', async () => {
    await post([runStart('terminal-status'), runUpdate('terminal-status', 'ended')]);

    await post([runUpdate('terminal-status', 'stopped')], 422);

    const stored = (await request(app).get('/api/runs').expect(200)).body[0];

    expect(stored).toMatchObject({
      id: 'terminal-status',
      status: 'ended'
    });
  });

  it('rejects unknown declaration fields', async () => {
    await post(
      [
        runStart('unknown-field', false, {
          legacy: true
        })
      ],
      422
    );
  });

  it('broadcasts lean pair snapshots', async () => {
    const broadcast = vi.spyOn(sse, 'broadcast');

    await post([runStart('lean'), gameStart('lean', 1), move('lean', 1, 10, 10, 1)]);

    const messages = broadcast.mock.calls.map(([message]) => message);

    expect(messages.map((message) => message.type)).toEqual([
      'run_start',
      'game_start',
      'game_move'
    ]);

    for (const message of messages.slice(1)) {
      for (const game of message.pair.games) {
        expect(game).not.toHaveProperty('moves');
      }
    }

    expect(messages.at(-1).moves).toBe('10,10,1');
  });

  it('rejects unknown event types', async () => {
    await post(
      [
        {
          type: 'legacy'
        }
      ],
      422
    );
  });

  it('uses clean numeric routes', async () => {
    await post([runStart('clean'), gameStart('clean', 1)]);

    const id = (await request(app).get('/api/latest-game').expect(200)).body.id;

    await request(app).get(`/api/game/${id}`).expect(200);

    await request(app).get(`/api/game/${id}?g=uuid`).expect(400);
  });
});
