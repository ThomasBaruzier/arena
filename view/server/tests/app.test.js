import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb } from '../src/db.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_KEY = 'test-key';
const auth = { 'x-api-key': TEST_KEY };

const slots = (slot1 = {}, slot2 = {}) => [
  { slot: 1, name: 'A', version: '1.0', ...slot1 },
  { slot: 2, name: 'B', version: '1.0', ...slot2 }
];

const gamesUrl = (runId, extra = '') =>
  `/api/games?run_id=${encodeURIComponent(runId)}&hero_slot=1${extra}`;

describe('Gomoku API integration', () => {
  let app;
  let tmpDir;
  let consoleError;
  let originalApiKey;

  beforeAll(() => {
    originalApiKey = process.env.API_KEY;
  });

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;
  });

  beforeEach(() => {
    process.env.API_KEY = TEST_KEY;
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

  it('requires an API key before opening the database', () => {
    delete process.env.API_KEY;

    expect(() => createApp(path.join(tmpDir, 'missing-key.db'))).toThrow(
      'API_KEY is required'
    );

    process.env.API_KEY = TEST_KEY;
    expect(fs.existsSync(path.join(tmpDir, 'missing-key.db'))).toBe(false);
  });

  it('rejects unauthenticated writes', async () => {
    await request(app).post('/api/batch').send([]).expect(403);
    await request(app).delete('/api/reset').expect(403);
  });

  it('ignores game events before run_start', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'start',
          external_id: 'missing_1_0',
          run_id: 'missing',
          black_slot: 1,
          white_slot: 2
        },
        { type: 'run_update', run_id: 'missing', wins: 1 }
      ])
      .expect(200);

    expect((await request(app).get('/api/runs')).body).toEqual([]);
    expect((await request(app).get('/api/matchups')).body).toEqual([]);
  });

  it('ingests a complete pair and authoritative totals', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'run_start',
          run_id: 'r1',
          slots: slots(),
          total_games: 2,
          board_size: 20
        },
        {
          type: 'start',
          external_id: 'r1_1_0',
          run_id: 'r1',
          black_slot: 1,
          white_slot: 2
        },
        {
          type: 'move',
          external_id: 'r1_1_0',
          run_id: 'r1',
          x: 10,
          y: 10,
          c: 1
        },
        {
          type: 'move',
          external_id: 'r1_1_0',
          run_id: 'r1',
          x: 11,
          y: 11,
          c: 2
        },
        {
          type: 'result',
          external_id: 'r1_1_0',
          run_id: 'r1',
          winner: 2,
          moves: '10,10,1;11,11,2'
        },
        {
          type: 'start',
          external_id: 'r1_1_1',
          run_id: 'r1',
          black_slot: 2,
          white_slot: 1
        },
        {
          type: 'result',
          external_id: 'r1_1_1',
          run_id: 'r1',
          winner: 1,
          moves: ''
        },
        {
          type: 'run_update',
          run_id: 'r1',
          wins: 1,
          losses: 1,
          draws: 0,
          games_played: 2
        }
      ])
      .expect(200);

    const games = await request(app).get(gamesUrl('r1')).expect(200);
    expect(games.body).toHaveLength(1);
    expect(games.body[0].games).toHaveLength(2);

    const first = games.body[0].games.find((game) => game.external_id === 'r1_1_0');
    expect(first.move_count).toBe(2);
    expect(first.winner_color).toBe(2);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.slot).toBe(1);
    expect(matchups.body[0].villain.slot).toBe(2);
    expect(matchups.body[0].heroWins).toBe(1);
    expect(matchups.body[0].villainWins).toBe(1);
    expect(matchups.body[0].total).toBe(2);
  });

  it('always exposes slot 1 first without heuristic ordering', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'run_start',
          run_id: 'canonical',
          slots: slots(
            { name: 'alpha', version: '1.0', mtime: 1 },
            { name: 'zeta', version: '99.0', mtime: 999999 }
          )
        },
        {
          type: 'run_update',
          run_id: 'canonical',
          wins: 4,
          losses: 2,
          draws: 3,
          games_played: 9
        }
      ])
      .expect(200);

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;

    expect(matchup.hero).toMatchObject({
      slot: 1,
      name: 'alpha',
      version: '1.0'
    });
    expect(matchup.villain).toMatchObject({
      slot: 2,
      name: 'zeta',
      version: '99.0'
    });
    expect(matchup.heroWins).toBe(4);
    expect(matchup.villainWins).toBe(2);
    expect(matchup.hero.mtime).toBeUndefined();
    expect(matchup.villain.mtime).toBeUndefined();
  });

  it('keeps reversed leg colors mapped to canonical slots', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'run_start',
          run_id: 'reverse',
          slots: slots({ name: 'slot1' }, { name: 'slot2' })
        },
        {
          type: 'start',
          external_id: 'reverse_1_1',
          run_id: 'reverse',
          black_slot: 2,
          white_slot: 1
        }
      ])
      .expect(200);

    const games = await request(app).get(gamesUrl('reverse')).expect(200);
    const gameId = games.body[0].games[0].id;
    const game = await request(app).get(`/api/game/${gameId}`).expect(200);

    expect(game.body.black_slot).toBe(2);
    expect(game.body.white_slot).toBe(1);
    expect(game.body.black_name).toBe('slot2');
    expect(game.body.white_name).toBe('slot1');
  });

  it('keeps same-name mirror slots distinct', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'run_start',
          run_id: 'mirror',
          slots: slots(
            { name: 'agent', version: '1.0' },
            { name: 'agent', version: '1.0' }
          )
        }
      ])
      .expect(200);

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;

    expect(matchup.hero.id).toBe('mirror:1');
    expect(matchup.villain.id).toBe('mirror:2');
    expect(matchup.hero.name).toBe(matchup.villain.name);
  });

  it('preserves metrics across sparse updates', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'metrics', slots: slots() },
        {
          type: 'run_update',
          run_id: 'metrics',
          games_played: 1,
          p1_time: 123,
          p2_time: 456,
          p1_cma: 1.25,
          p2_blunder: 2.5
        },
        { type: 'run_update', run_id: 'metrics', games_played: 2 }
      ])
      .expect(200);

    const [run] = (await request(app).get('/api/runs').expect(200)).body;

    expect(run.games_played).toBe(2);
    expect(run.p1_total_time_ms).toBe(123);
    expect(run.p2_total_time_ms).toBe(456);
    expect(run.p1_cma).toBe(1.25);
    expect(run.p2_blunder).toBe(2.5);
  });

  it('rejects moves and results with mismatched run ids', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'guard', slots: slots() },
        {
          type: 'start',
          external_id: 'guard_1_0',
          run_id: 'guard',
          black_slot: 1,
          white_slot: 2
        },
        {
          type: 'move',
          external_id: 'guard_1_0',
          run_id: 'wrong',
          x: 1,
          y: 1,
          c: 1
        },
        {
          type: 'move',
          external_id: 'guard_1_0',
          run_id: 'guard',
          x: 3,
          y: 3,
          c: 1
        },
        {
          type: 'result',
          external_id: 'guard_1_0',
          run_id: 'wrong',
          winner: 1,
          moves: '3,3,1'
        },
        {
          type: 'result',
          external_id: 'guard_1_0',
          run_id: 'guard',
          winner: 1,
          moves: '3,3,1'
        }
      ])
      .expect(200);

    const games = await request(app).get(gamesUrl('guard')).expect(200);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);

    expect(game.body.moves).toBe('3,3,1');
    expect(game.body.winner_color).toBe(1);
  });

  it('does not erase buffered moves on duplicate starts', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'dup', slots: slots() },
        {
          type: 'start',
          external_id: 'dup_1_0',
          run_id: 'dup',
          black_slot: 1,
          white_slot: 2
        },
        {
          type: 'move',
          external_id: 'dup_1_0',
          run_id: 'dup',
          x: 1,
          y: 1,
          c: 1
        },
        {
          type: 'start',
          external_id: 'dup_1_0',
          run_id: 'dup',
          black_slot: 1,
          white_slot: 2
        },
        {
          type: 'result',
          external_id: 'dup_1_0',
          run_id: 'dup',
          winner: 1,
          moves: '1,1,1'
        }
      ])
      .expect(200);

    const games = await request(app).get(gamesUrl('dup')).expect(200);
    expect(games.body[0].games[0].move_count).toBe(1);
  });

  it('rejects malformed move and result payloads', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: 'validate', slots: slots(), board_size: 15 },
        {
          type: 'start',
          external_id: 'validate_1_0',
          run_id: 'validate',
          black_slot: 1,
          white_slot: 2
        },
        {
          type: 'move',
          external_id: 'validate_1_0',
          run_id: 'validate',
          x: 16,
          y: 1,
          c: 1
        },
        {
          type: 'move',
          external_id: 'validate_1_0',
          run_id: 'validate',
          x: 1,
          y: 1,
          c: 2
        },
        {
          type: 'move',
          external_id: 'validate_1_0',
          run_id: 'validate',
          x: 1,
          y: 1,
          c: 1
        },
        {
          type: 'move',
          external_id: 'validate_1_0',
          run_id: 'validate',
          x: 1,
          y: 1,
          c: 2
        },
        {
          type: 'result',
          external_id: 'validate_1_0',
          run_id: 'validate',
          winner: 1,
          moves: '0,0,1;bad'
        },
        {
          type: 'result',
          external_id: 'validate_1_0',
          run_id: 'validate',
          winner: 1,
          moves: '1,1,1'
        }
      ])
      .expect(200);

    const games = await request(app).get(gamesUrl('validate')).expect(200);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);

    expect(game.body.moves).toBe('1,1,1');
    expect(game.body.winner_color).toBe(1);
  });

  it('keeps underscore run ids canonical', async () => {
    const runId = 'run_full_id';

    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        { type: 'run_start', run_id: runId, slots: slots() },
        {
          type: 'start',
          external_id: `${runId}_12_0`,
          run_id: runId,
          black_slot: 1,
          white_slot: 2
        }
      ])
      .expect(200);

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;
    const games = await request(app).get(gamesUrl(runId)).expect(200);

    expect(matchup.runId).toBe(runId);
    expect(games.body[0].games[0].run_id).toBe(runId);
  });

  it('normalizes missing versions and exposes board size', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([
        {
          type: 'run_start',
          run_id: 'version',
          slots: slots({ version: '' }, { version: undefined }),
          board_size: 15
        },
        {
          type: 'start',
          external_id: 'version_1_0',
          run_id: 'version',
          black_slot: 1,
          white_slot: 2
        }
      ])
      .expect(200);

    const [run] = (await request(app).get('/api/runs').expect(200)).body;
    expect(run.slot1_version).toBe('unknown');
    expect(run.slot2_version).toBe('unknown');

    const games = await request(app).get(gamesUrl('version')).expect(200);
    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);
    expect(game.body.board_size).toBe(15);
  });

  it('validates matchup pagination', async () => {
    for (const query of [
      '?limit=0',
      '?limit=101',
      '?limit=-1',
      '?limit=x',
      '?limit=1.5',
      '?offset=-1',
      '?offset=x',
      '?offset=1.5'
    ]) {
      await request(app).get(`/api/matchups${query}`).expect(400);
    }

    await request(app).get('/api/matchups?limit=1&offset=0').expect(200);
  });

  it('validates game-list queries', async () => {
    const invalid = [
      '/api/games',
      '/api/games?run_id=r',
      '/api/games?hero_slot=1',
      '/api/games?run_id=r&hero_slot=0',
      '/api/games?run_id=r&hero_slot=3',
      '/api/games?run_id=r&hero_slot=x',
      '/api/games?run_id=r&hero_slot=1&limit=0',
      '/api/games?run_id=r&hero_slot=1&limit=101',
      '/api/games?run_id=r&hero_slot=1&offset=-1',
      '/api/games?run_id=r&hero_slot=1&sort=unknown',
      '/api/games?run_id=r&hero_slot=1&order=sideways'
    ];

    for (const url of invalid) {
      await request(app).get(url).expect(400);
    }

    await request(app)
      .get('/api/games?run_id=r&hero_slot=2&limit=50&offset=0&sort=id&order=desc')
      .expect(200);
  });

  it('validates game ids', async () => {
    for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) {
      await request(app).get(`/api/game/${id}`).expect(400);
    }

    await request(app).get('/api/game/1').expect(404);
  });

  it('reset clears data', async () => {
    await request(app)
      .post('/api/batch')
      .set(auth)
      .send([{ type: 'run_start', run_id: 'reset', slots: slots() }])
      .expect(200);

    await request(app).delete('/api/reset').set(auth).expect(200);

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);
    expect((await request(app).get('/api/matchups').expect(200)).body).toEqual([]);
  });
});
