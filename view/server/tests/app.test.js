import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb } from '../src/db.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

const auth = { 'x-api-key': 'secret' };

const slots = (slot1 = {}, slot2 = {}) => [
  { slot: 1, name: 'A', version: '1.0', ...slot1 },
  { slot: 2, name: 'B', version: '1.0', ...slot2 }
];

describe('Gomoku API Integration', () => {
  let app;
  let tmpDir;
  let consoleError;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-test-'));
    app = createApp(path.join(tmpDir, 'test.db'));
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects unauthenticated batch requests', async () => {
    await request(app).post('/api/batch').send([{ type: 'start' }]).expect(403);
  });

  it('ignores game events before canonical run_start', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'start', external_id: 'missing_1_0', run_id: 'missing', black_slot: 1, white_slot: 2 },
        { type: 'run_update', run_id: 'missing', wins: 1, games_played: 1 }
      ])
      .expect(200);

    expect((await request(app).get('/api/runs')).body).toHaveLength(0);
    expect((await request(app).get('/api/matchups')).body).toHaveLength(0);
  });

  it('ingests canonical run, games, moves, result, and stats', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'r1', slots: [{ slot: 1, name: 'A', version: '1.0' }, { slot: 2, name: 'B', version: '1.0' }], total_games: 2 },
        { type: 'start', external_id: 'r1_1_0', run_id: 'r1', black_slot: 1, white_slot: 2 },
        { type: 'move', external_id: 'r1_1_0', run_id: 'r1', x: 10, y: 10, c: 1 },
        { type: 'move', external_id: 'r1_1_0', run_id: 'r1', x: 11, y: 11, c: 2 },
        { type: 'result', external_id: 'r1_1_0', run_id: 'r1', winner: 2, moves: '10,10,1;11,11,2' },
        { type: 'start', external_id: 'r1_1_1', run_id: 'r1', black_slot: 2, white_slot: 1 },
        { type: 'result', external_id: 'r1_1_1', run_id: 'r1', winner: 1, moves: '' },
        { type: 'run_update', run_id: 'r1', wins: 1, losses: 1, draws: 0, games_played: 2 }
      ])
      .expect(200);

    const games = await request(app).get('/api/games?run_id=r1').expect(200);
    expect(games.body).toHaveLength(1);
    expect(games.body[0].games).toHaveLength(2);
    expect(games.body[0].games.find((g) => g.external_id === 'r1_1_0').move_count).toBe(2);
    expect(games.body[0].games.find((g) => g.external_id === 'r1_1_0').winner_color).toBe(2);
    expect(games.body[0].games.find((g) => g.external_id === 'r1_1_1').winner_color).toBe(1);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body).toHaveLength(1);
    expect(matchups.body[0].hero.name).toBe('A');
    expect(matchups.body[0].heroWins).toBe(1);
    expect(matchups.body[0].villainWins).toBe(1);
    expect(matchups.body[0].total).toBe(2);
  });

  it('ignores move and result events without matching run_id', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'guard', slots: slots() },
        { type: 'start', external_id: 'guard_1_0', run_id: 'guard', black_slot: 1, white_slot: 2 },
        { type: 'move', external_id: 'guard_1_0', x: 1, y: 1, c: 1 },
        { type: 'move', external_id: 'guard_1_0', run_id: 'wrong', x: 2, y: 2, c: 2 },
        { type: 'move', external_id: 'guard_1_0', run_id: 'guard', x: 3, y: 3, c: 1 },
        { type: 'result', external_id: 'guard_1_0', winner: 1 },
        { type: 'result', external_id: 'guard_1_0', run_id: 'wrong', winner: 2, moves: '3,3,1' },
        { type: 'result', external_id: 'guard_1_0', run_id: 'guard', winner: 1, moves: '3,3,1' }
      ])
      .expect(200);

    const games = await request(app).get('/api/games?run_id=guard').expect(200);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);
    expect(game.body.moves).toBe('3,3,1');
    expect(game.body.winner_color).toBe(1);
  });

  it('duplicate start does not erase buffered moves before flush', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'dup', slots: slots() },
        { type: 'start', external_id: 'dup_1_0', run_id: 'dup', black_slot: 1, white_slot: 2 },
        { type: 'move', external_id: 'dup_1_0', run_id: 'dup', x: 1, y: 1, c: 1 },
        { type: 'start', external_id: 'dup_1_0', run_id: 'dup', black_slot: 1, white_slot: 2 },
        { type: 'result', external_id: 'dup_1_0', run_id: 'dup', winner: 1, moves: '1,1,1' }
      ])
      .expect(200);

    const games = await request(app).get('/api/games?run_id=dup').expect(200);
    expect(games.body[0].games[0].move_count).toBe(1);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);
    expect(game.body.moves).toBe('1,1,1');
    expect(game.body.winner_color).toBe(1);
  });

  it('keeps run_start slot identity when reversed leg starts later', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'run_start',
          run_id: 'canonical_slots',
          slots: slots(
            { name: 'agent', version: '0.3.4', cmd: './pbrain-gomoku-ai', mtime: 200 },
            { name: 'agent', version: '0.3.3', cmd: '/tmp/opencode/agent-0.3.3', mtime: 100 }
          ),
          total_games: 128
        },
        { type: 'start', external_id: 'canonical_slots_1_1', run_id: 'canonical_slots', black_slot: 2, white_slot: 1 },
        { type: 'run_update', run_id: 'canonical_slots', wins: 15, losses: 6, draws: 43, games_played: 128 }
      ])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body[0].slot1_version).toBe('0.3.4');
    expect(runs.body[0].slot2_version).toBe('0.3.3');
    expect(runs.body[0].wins).toBe(15);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.version).toBe('0.3.4');
    expect(matchups.body[0].heroWins).toBe(15);
    expect(matchups.body[0].villainWins).toBe(6);
  });

  it('uses mtime hero ordering for different bot names without changing slot1 W/L perspective', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'mtime_order', slots: slots({ name: 'agent', version: '0.3', mtime: 100 }, { name: 'shrek', version: '6.2', mtime: 200 }), total_games: 10 },
        { type: 'run_update', run_id: 'mtime_order', wins: 3, losses: 1, draws: 2, games_played: 6 }
      ])
      .expect(200);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.name).toBe('shrek');
    expect(matchups.body[0].heroWins).toBe(1);
    expect(matchups.body[0].villainWins).toBe(3);
  });

  it('normalizes missing slot versions and exposes game board size', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'unknown_version', slots: slots({ version: '' }, { version: undefined }), board_size: 15 },
        { type: 'start', external_id: 'unknown_version_1_0', run_id: 'unknown_version', black_slot: 1, white_slot: 2 }
      ])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body[0].slot1_version).toBe('unknown');
    expect(runs.body[0].slot2_version).toBe('unknown');

    const games = await request(app).get('/api/games?run_id=unknown_version').expect(200);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);
    expect(game.body.board_size).toBe(15);
  });

  it('ignores malformed move and result payloads', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'validate', slots: slots(), board_size: 15 },
        { type: 'start', external_id: 'validate_1_0', run_id: 'validate', black_slot: 1, white_slot: 2 },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: 16, y: 1, c: 1 },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: 1, y: 1, c: 7 },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: '', y: 1, c: 1 },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: 2, y: 2, c: 2 },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 0 },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 9 },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 1, moves: '0,0,1;bad' },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 1, moves: '0,,1' },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 1, moves: '0,0,1;0,0,2' },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: 1, y: 1, c: 1 },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: 1, y: 1, c: 2 },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 1, moves: '2,2,1;3,3,2' },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 1 },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 1, moves: '1,1,1' },
        { type: 'move', external_id: 'validate_1_0', run_id: 'validate', x: 2, y: 2, c: 2 },
        { type: 'result', external_id: 'validate_1_0', run_id: 'validate', winner: 4, moves: '1,1,1;2,2,2' }
      ])
      .expect(200);

    const games = await request(app).get('/api/games?run_id=validate').expect(200);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);
    expect(game.body.moves).toBe('1,1,1');
    expect(game.body.winner_color).toBe(1);
  });

  it('preserves metrics across sparse run updates after run_start', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'metric_run', slots: slots({ name: 'Bot1' }, { name: 'Bot2' }) },
        { type: 'run_update', run_id: 'metric_run', p1_time: 123, p2_time: 456, p1_cma: 1.25, p2_blunder: 2.5, games_played: 1 },
        { type: 'run_update', run_id: 'metric_run', games_played: 2 }
      ])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body[0].games_played).toBe(2);
    expect(runs.body[0].p1_total_time_ms).toBe(123);
    expect(runs.body[0].p2_total_time_ms).toBe(456);
    expect(runs.body[0].p1_cma).toBe(1.25);
    expect(runs.body[0].p2_blunder).toBe(2.5);
  });

  it('keeps explicit underscore run ids canonical', async () => {
    const runId = 'run_full_id';
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: runId, slots: slots({ name: 'Agent', version: '0.3' }, { name: 'Shrek', version: '6.2' }), total_games: 2 },
        { type: 'start', external_id: `${runId}_12_0`, run_id: runId, black_slot: 1, white_slot: 2 }
      ])
      .expect(200);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].runId).toBe(runId);

    const games = await request(app).get(`/api/games?run_id=${runId}`).expect(200);
    expect(games.body).toHaveLength(1);
    expect(games.body[0].games[0].run_id).toBe(runId);
  });

  it('reset clears fresh-schema data', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([{ type: 'run_start', run_id: 'run', slots: slots({ name: 'Agent', version: '0.3' }, { name: 'Shrek', version: '6.2' }) }])
      .expect(200);

    await request(app).delete('/api/reset').set(auth).expect(200);
    expect((await request(app).get('/api/runs').expect(200)).body).toHaveLength(0);
    expect((await request(app).get('/api/matchups').expect(200)).body).toHaveLength(0);
  });
});
