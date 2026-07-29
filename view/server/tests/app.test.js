import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb, getDb } from '../src/db.js';
import sse from '../src/sse.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_KEY = 'test-key';

const auth = {
  'x-api-key': TEST_KEY
};

const slots = (slot1 = {}, slot2 = {}) => [
  {
    slot: 1,
    name: 'A',
    version: '1.0',
    ...slot1
  },
  {
    slot: 2,
    name: 'B',
    version: '1.0',
    ...slot2
  }
];

const runStart = (runId, extra = {}) => ({
  type: 'run_start',
  run_id: runId,
  status: 'live',
  slots: slots(),
  ...extra
});

const gamesUrl = (runId, extra = '') =>
  `/api/games?run_id=${encodeURIComponent(runId)}&hero_slot=1${extra}`;

describe('Gomoku API integration', () => {
  let app;
  let tmpDir;
  let dbPath;
  let consoleError;
  let originalApiKey;

  beforeAll(() => {
    originalApiKey = process.env.API_KEY;
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
  });

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.API_KEY = TEST_KEY;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-test-'));

    dbPath = path.join(tmpDir, 'test.db');

    app = createApp(dbPath);
  });

  afterEach(() => {
    const errors = consoleError?.mock.calls ?? [];

    consoleError?.mockRestore();
    closeDb();

    if (tmpDir) {
      fs.rmSync(tmpDir, {
        recursive: true,
        force: true
      });
    }

    expect(errors).toEqual([]);
  });

  const post = (events) => request(app).post('/api/batch').set(auth).send(events).expect(200);

  it('requires an API key before opening the database', () => {
    closeDb();
    delete process.env.API_KEY;

    const missingPath = path.join(tmpDir, 'missing.db');

    expect(() => createApp(missingPath)).toThrow('API_KEY is required');

    expect(fs.existsSync(missingPath)).toBe(false);

    process.env.API_KEY = TEST_KEY;

    app = createApp(dbPath);
  });

  it('creates only the current schema', () => {
    const columns = getDb()
      .prepare('PRAGMA table_info(runs)')
      .all()
      .map((column) => column.name);

    expect(
      getDb().pragma('user_version', {
        simple: true
      })
    ).toBe(4);

    expect(columns).toContain('status');

    expect(columns).toContain('p1_cpu_time_ms');

    expect(columns).toContain('p2_cpu_time_ms');

    expect(columns).toContain('p1_cpu_wall_time_ms');

    expect(columns).toContain('p2_cpu_wall_time_ms');

    expect(columns).toContain('p1_moves_analyzed');

    expect(columns).toContain('p2_critical_total');

    expect(columns).not.toContain('is_done');

    expect(columns).not.toContain('timed_out');
  });

  it('resets persisted data on application boot', async () => {
    await post([runStart('boot-reset')]);

    expect((await request(app).get('/api/runs').expect(200)).body).toHaveLength(1);

    closeDb();
    app = createApp(dbPath);

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);
  });

  it('removes stale SQLite sidecars on boot', async () => {
    await post([runStart('sidecars')]);

    closeDb();

    fs.writeFileSync(`${dbPath}-wal`, 'stale');

    fs.writeFileSync(`${dbPath}-shm`, 'stale');

    app = createApp(dbPath);

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);
  });

  it('rejects unauthenticated writes', async () => {
    await request(app).post('/api/batch').send([]).expect(403);

    await request(app).delete('/api/reset').expect(403);
  });

  it('ignores game events before run start', async () => {
    await post([
      {
        type: 'start',
        external_id: 'missing_1_0',
        run_id: 'missing',
        black_slot: 1,
        white_slot: 2
      },
      {
        type: 'run_update',
        run_id: 'missing',
        status: 'ended',
        wins: 1
      }
    ]);

    expect((await request(app).get('/api/runs')).body).toEqual([]);

    expect((await request(app).get('/api/matchups')).body).toEqual([]);
  });

  it('persists current telemetry and derives efficiency', async () => {
    await post([
      runStart('metrics'),
      {
        type: 'run_update',
        run_id: 'metrics',
        status: 'live',
        games_played: 1,
        p1_time: 500,
        p1_cpu_time: 300,
        p1_cpu_wall_time: 400,
        p2_time: 0,
        p2_cpu_time: 50,
        p2_cpu_wall_time: 0,
        p1_moves_analyzed: 12,
        p1_critical_total: 4,
        p2_moves_analyzed: 10,
        p2_critical_total: 3,
        p1_cma: 75,
        p2_cma: 66.5,
        p1_blunder: 4.5,
        p2_blunder: 7
      }
    ]);

    const [run] = (await request(app).get('/api/runs').expect(200)).body;

    expect(run.status).toBe('live');

    expect(run.p1_total_time_ms).toBe(500);

    expect(run.p1_cpu_time_ms).toBe(300);

    expect(run.p1_cpu_wall_time_ms).toBe(400);

    expect(run.p1_eff).toBe(75);
    expect(run.p2_eff).toBeNull();

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;

    expect(matchup.run.p1_eff).toBe(75);

    expect(matchup.run.p2_eff).toBeNull();

    expect(run.p1_moves_analyzed).toBe(12);

    expect(run.p1_critical_total).toBe(4);

    expect(run.p2_moves_analyzed).toBe(10);

    expect(run.p2_critical_total).toBe(3);
  });

  it('includes a complete run snapshot for matchups beyond the run-summary limit', async () => {
    await post(
      Array.from(
        {
          length: 55
        },
        (_, index) =>
          runStart(`paged-${String(index).padStart(2, '0')}`, {
            total_games: 20,
            board_size: 20
          })
      )
    );

    const summaries = (await request(app).get('/api/runs').expect(200)).body;

    const matchups = (await request(app).get('/api/matchups?limit=100&offset=0').expect(200)).body;

    expect(summaries).toHaveLength(50);

    expect(matchups).toHaveLength(55);

    const summaryIds = new Set(summaries.map((run) => run.id));

    const older = matchups.find((matchup) => !summaryIds.has(matchup.runId));

    expect(older).toBeDefined();

    expect(older.run).toMatchObject({
      id: older.runId,
      status: 'live',
      total_games: 20,
      board_size: 20
    });

    expect(older.run.p1_eff).toBeNull();

    expect(older.run.p2_eff).toBeNull();
  });

  it('preserves telemetry across sparse updates', async () => {
    await post([
      runStart('sparse'),
      {
        type: 'run_update',
        run_id: 'sparse',
        p1_time: 123,
        p1_cpu_time: 100,
        p1_cpu_wall_time: 123,
        p2_time: 456,
        p2_cpu_time: 300,
        p2_cpu_wall_time: 456,
        p1_cma: 12.5,
        p2_blunder: 2.5,
        p1_moves_analyzed: 8,
        p1_critical_total: 2
      },
      {
        type: 'run_update',
        run_id: 'sparse',
        status: 'ended',
        games_played: 2
      }
    ]);

    const [run] = (await request(app).get('/api/runs').expect(200)).body;

    expect(run.status).toBe('ended');

    expect(run.games_played).toBe(2);

    expect(run.p1_total_time_ms).toBe(123);

    expect(run.p1_cpu_time_ms).toBe(100);

    expect(run.p2_total_time_ms).toBe(456);

    expect(run.p2_cpu_time_ms).toBe(300);

    expect(run.p1_cpu_wall_time_ms).toBe(123);

    expect(run.p2_cpu_wall_time_ms).toBe(456);

    expect(run.p1_cma).toBe(12.5);

    expect(run.p2_blunder).toBe(2.5);

    expect(run.p1_moves_analyzed).toBe(8);

    expect(run.p1_critical_total).toBe(2);
  });

  it('keeps terminal statuses monotonic', async () => {
    await post([
      runStart('stopped'),
      runStart('ended'),
      {
        type: 'run_update',
        run_id: 'stopped',
        status: 'stopped'
      },
      {
        type: 'run_update',
        run_id: 'stopped',
        status: 'ended'
      },
      {
        type: 'run_update',
        run_id: 'ended',
        status: 'ended'
      },
      {
        type: 'run_update',
        run_id: 'ended',
        status: 'live'
      }
    ]);

    const runs = (await request(app).get('/api/runs').expect(200)).body;

    const stopped = runs.find((run) => run.id === 'stopped');

    const ended = runs.find((run) => run.id === 'ended');

    expect(stopped.status).toBe('stopped');

    expect(ended.status).toBe('ended');
  });

  it('ignores malformed telemetry updates', async () => {
    await post([
      runStart('invalid'),
      {
        type: 'run_update',
        run_id: 'invalid',
        status: 'unknown',
        games_played: 2
      },
      {
        type: 'run_update',
        run_id: 'invalid',
        p1_cpu_time: -1,
        games_played: 3
      }
    ]);

    const [run] = (await request(app).get('/api/runs').expect(200)).body;

    expect(run.status).toBe('live');

    expect(run.games_played).toBe(0);

    expect(run.p1_cpu_time_ms).toBe(0);
  });

  it('broadcasts batched game events in start, move, result order', async () => {
    const broadcast = vi.spyOn(sse, 'broadcast');

    try {
      await post([
        runStart('ordered'),
        {
          type: 'start',
          external_id: 'ordered_1_0',
          run_id: 'ordered',
          black_slot: 1,
          white_slot: 2
        },
        {
          type: 'move',
          external_id: 'ordered_1_0',
          run_id: 'ordered',
          x: 10,
          y: 10,
          c: 1
        },
        {
          type: 'result',
          external_id: 'ordered_1_0',
          run_id: 'ordered',
          winner: 1,
          moves: '10,10,1'
        }
      ]);

      expect(broadcast.mock.calls.map(([message]) => message.type)).toEqual([
        'run_start',
        'game_start',
        'game_move',
        'game_result'
      ]);
    } finally {
      broadcast.mockRestore();
    }
  });

  it('ingests a complete pair and authoritative totals', async () => {
    await post([
      runStart('r1', {
        total_games: 2,
        board_size: 20
      }),
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
        status: 'ended',
        wins: 1,
        losses: 1,
        draws: 0,
        games_played: 2
      }
    ]);

    const games = await request(app).get(gamesUrl('r1')).expect(200);

    expect(games.body).toHaveLength(1);

    expect(games.body[0].games).toHaveLength(2);

    const first = games.body[0].games.find((game) => game.external_id === 'r1_1_0');

    expect(first.move_count).toBe(2);

    expect(first.winner_color).toBe(2);

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;

    expect(matchup.status).toBe('ended');

    expect(matchup.hero.slot).toBe(1);

    expect(matchup.villain.slot).toBe(2);

    expect(matchup.heroWins).toBe(1);

    expect(matchup.villainWins).toBe(1);

    expect(matchup.total).toBe(2);
  });

  it('always exposes canonical slot order', async () => {
    await post([
      runStart('canonical', {
        slots: slots(
          {
            name: 'alpha',
            version: '1.0'
          },
          {
            name: 'zeta',
            version: '99.0'
          }
        )
      }),
      {
        type: 'run_update',
        run_id: 'canonical',
        status: 'live',
        wins: 4,
        losses: 2,
        draws: 3,
        games_played: 9
      }
    ]);

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
  });

  it('maps reversed colors to canonical slots', async () => {
    await post([
      runStart('reverse', {
        slots: slots(
          {
            name: 'slot1'
          },
          {
            name: 'slot2'
          }
        )
      }),
      {
        type: 'start',
        external_id: 'reverse_1_1',
        run_id: 'reverse',
        black_slot: 2,
        white_slot: 1
      }
    ]);

    const games = await request(app).get(gamesUrl('reverse')).expect(200);

    const gameId = games.body[0].games[0].id;

    const game = await request(app).get(`/api/game/${gameId}`).expect(200);

    expect(game.body.black_slot).toBe(2);

    expect(game.body.white_slot).toBe(1);

    expect(game.body.black_name).toBe('slot2');

    expect(game.body.white_name).toBe('slot1');
  });

  it('keeps same-name slots distinct', async () => {
    await post([
      runStart('mirror', {
        slots: slots(
          {
            name: 'agent',
            version: '1.0'
          },
          {
            name: 'agent',
            version: '1.0'
          }
        )
      })
    ]);

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;

    expect(matchup.hero.id).toBe('mirror:1');

    expect(matchup.villain.id).toBe('mirror:2');

    expect(matchup.hero.name).toBe(matchup.villain.name);
  });

  it('rejects mismatched run ids', async () => {
    await post([
      runStart('guard'),
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
    ]);

    const games = await request(app).get(gamesUrl('guard')).expect(200);

    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);

    expect(game.body.moves).toBe('3,3,1');

    expect(game.body.winner_color).toBe(1);
  });

  it('does not erase moves on duplicate starts', async () => {
    await post([
      runStart('duplicate'),
      {
        type: 'start',
        external_id: 'duplicate_1_0',
        run_id: 'duplicate',
        black_slot: 1,
        white_slot: 2
      },
      {
        type: 'move',
        external_id: 'duplicate_1_0',
        run_id: 'duplicate',
        x: 1,
        y: 1,
        c: 1
      },
      {
        type: 'start',
        external_id: 'duplicate_1_0',
        run_id: 'duplicate',
        black_slot: 1,
        white_slot: 2
      },
      {
        type: 'result',
        external_id: 'duplicate_1_0',
        run_id: 'duplicate',
        winner: 1,
        moves: '1,1,1'
      }
    ]);

    const games = await request(app).get(gamesUrl('duplicate')).expect(200);

    expect(games.body[0].games[0].move_count).toBe(1);
  });

  it('rejects malformed move and result payloads', async () => {
    await post([
      runStart('validate', {
        board_size: 15
      }),
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
    ]);

    const games = await request(app).get(gamesUrl('validate')).expect(200);

    const game = await request(app).get(`/api/game/${games.body[0].games[0].id}`).expect(200);

    expect(game.body.moves).toBe('1,1,1');

    expect(game.body.winner_color).toBe(1);
  });

  it('keeps underscore run ids canonical', async () => {
    const runId = 'run_full_id';

    await post([
      runStart(runId),
      {
        type: 'start',
        external_id: `${runId}_12_0`,
        run_id: runId,
        black_slot: 1,
        white_slot: 2
      }
    ]);

    const [matchup] = (await request(app).get('/api/matchups').expect(200)).body;

    const games = await request(app).get(gamesUrl(runId)).expect(200);

    expect(matchup.runId).toBe(runId);

    expect(games.body[0].games[0].run_id).toBe(runId);
  });

  it('normalizes missing versions and exposes board size', async () => {
    await post([
      runStart('version', {
        slots: slots(
          {
            version: ''
          },
          {
            version: undefined
          }
        ),
        board_size: 15
      }),
      {
        type: 'start',
        external_id: 'version_1_0',
        run_id: 'version',
        black_slot: 1,
        white_slot: 2
      }
    ]);

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

  it('paginates game history with a stable cursor', async () => {
    await post([
      runStart('cursor'),
      ...Array.from(
        {
          length: 3
        },
        (_, index) => ({
          type: 'start',
          external_id: `cursor_${index + 1}_0`,
          run_id: 'cursor',
          black_slot: 1,
          white_slot: 2
        })
      )
    ]);

    const first = await request(app)
      .get(gamesUrl('cursor', '&limit=2&sort=id&order=desc'))
      .expect(200);

    expect(first.body).toHaveLength(2);

    const cursor = encodeURIComponent(
      JSON.stringify({
        id: first.body.at(-1).max_id
      })
    );

    const second = await request(app)
      .get(gamesUrl('cursor', `&limit=2&sort=id&order=desc&cursor=${cursor}`))
      .expect(200);

    expect(second.body).toHaveLength(1);

    const firstIds = new Set(first.body.map((pair) => pair.max_id));

    expect(firstIds.has(second.body[0].max_id)).toBe(false);
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
      '/api/games?run_id=r&hero_slot=1&order=sideways',
      '/api/games?run_id=r&hero_slot=1&cursor=bad',
      '/api/games?run_id=r&hero_slot=1&cursor=%7B%22id%22%3A0%7D',
      '/api/games?run_id=r&hero_slot=1&offset=1&cursor=%7B%22id%22%3A1%7D'
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

  it('validates supplied game generations', async () => {
    await request(app).get('/api/game/1?g=').expect(400);

    await request(app).get('/api/game/1?g=stale').expect(409);
  });

  it('reset clears data without restarting', async () => {
    await post([runStart('reset')]);

    await request(app).delete('/api/reset').set(auth).expect(200);

    expect((await request(app).get('/api/runs').expect(200)).body).toEqual([]);

    expect((await request(app).get('/api/matchups').expect(200)).body).toEqual([]);
  });
});
