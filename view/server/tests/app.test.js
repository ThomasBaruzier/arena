import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb, getDb } from '../src/db.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Gomoku API Integration', () => {
  let app;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-test-'));
    app = createApp(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects unauthenticated batch requests', async () => {
    await request(app)
      .post('/api/batch')
      .send([{ type: 'start' }])
      .expect(403);
  });

  it('handles batch event ingestion correctly', async () => {
    const events = [
      { type: 'start', external_id: 'g1', p1n: 'BotA', p1v: '1.0', p2n: 'BotB', p2v: '1.0' },
      { type: 'move', external_id: 'g1', x: 10, y: 10, c: 1 },
      { type: 'move', external_id: 'g1', x: 11, y: 11, c: 2 },
      { type: 'result', external_id: 'g1', winner: 1 }
    ];

    await request(app).post('/api/batch').set('x-api-key', 'secret').send(events).expect(200);

    const res = await request(app).get('/api/games?limit=10');
    expect(res.body).toHaveLength(1);
    const game = res.body[0].games[0];
    expect(game.move_count).toBe(2);
    expect(game.winner_color).toBe(1);
  });

  it('groups matchups and calculates stats correctly', async () => {
    const runEvents = [
      {
        type: 'run_start',
        run_id: 't1',
        p1n: 'A',
        p1v: '1.0',
        p2n: 'B',
        p2v: '1.0',
        config_label: 'test',
        total_games: 10
      }
    ];
    await request(app).post('/api/batch').set('x-api-key', 'secret').send(runEvents).expect(200);

    const events = [
      {
        type: 'start',
        external_id: 't1_1_0',
        run_id: 't1',
        p1n: 'A',
        p1v: '1.0',
        p2n: 'B',
        p2v: '1.0'
      },
      { type: 'result', external_id: 't1_1_0', winner: 1 },
      {
        type: 'start',
        external_id: 't1_1_1',
        run_id: 't1',
        p1n: 'B',
        p1v: '1.0',
        p2n: 'A',
        p2v: '1.0'
      },
      { type: 'result', external_id: 't1_1_1', winner: 1 },
      {
        type: 'run_update',
        run_id: 't1',
        wins: 1,
        losses: 1,
        games_played: 2
      }
    ];

    await request(app).post('/api/batch').set('x-api-key', 'secret').send(events).expect(200);

    const res = await request(app).get('/api/matchups');
    expect(res.body).toHaveLength(1);
    const m = res.body[0];
    expect(m.hero.name).toBe('A');
    expect(m.heroWins).toBe(1);
    expect(m.villainWins).toBe(1);
    expect(m.total).toBe(2);
  });

  it('creates a stub run when live games arrive before run_start', async () => {
    const events = [
      {
        type: 'start',
        external_id: 'missing_run_1_0',
        run_id: 'missing_run',
        p1n: 'Agent',
        p1v: '0.1',
        p2n: 'Shrek',
        p2v: '6.2'
      },
      { type: 'move', external_id: 'missing_run_1_0', x: 10, y: 10, c: 1 },
      { type: 'result', external_id: 'missing_run_1_0', winner: 1 },
      { type: 'run_update', run_id: 'missing_run', wins: 1, losses: 0, draws: 0, games_played: 1 }
    ];

    await request(app).post('/api/batch').set('x-api-key', 'secret').send(events).expect(200);

    const runs = await request(app).get('/api/runs');
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].id).toBe('missing_run');

    const res = await request(app).get('/api/matchups');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tournamentId).toBe('missing_run');
    expect(res.body[0].runId).toBe('missing_run');
    expect(res.body[0].total).toBe(1);
    expect([res.body[0].hero.name, res.body[0].villain.name]).toEqual(['Agent', 'Shrek']);
  });

  it('lets metadata-less run_start correct a reversed start-created placeholder', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'start',
          external_id: 'placeholder_correct_1_1',
          run_id: 'placeholder_correct',
          p1n: 'agent',
          p1v: '0.3.3',
          p2n: 'agent',
          p2v: '0.3.4'
        },
        {
          type: 'run_start',
          run_id: 'placeholder_correct',
          p1n: 'agent',
          p1v: '0.3.4',
          p2n: 'agent',
          p2v: '0.3.3',
          total_games: 128
        },
        { type: 'run_update', run_id: 'placeholder_correct', wins: 15, losses: 6, draws: 43, games_played: 128 }
      ])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body[0].p1_version).toBe('0.3.4');
    expect(runs.body[0].p2_version).toBe('0.3.3');

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.version).toBe('0.3.4');
    expect(matchups.body[0].heroWins).toBe(15);
    expect(matchups.body[0].villainWins).toBe(6);
  });

  it('keeps canonical run_start identity when a reversed leg start arrives later', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'run_start',
          run_id: 'canonical_slots',
          p1_name: 'agent',
          p1_version: '0.3.4',
          p1_cmd: './pbrain-gomoku-ai',
          p1_mtime: 200,
          p2_name: 'agent',
          p2_version: '0.3.3',
          p2_cmd: '/tmp/opencode/agent-0.3.3',
          p2_mtime: 100,
          total_games: 128
        },
        {
          type: 'start',
          external_id: 'canonical_slots_1_1',
          run_id: 'canonical_slots',
          p1n: 'agent',
          p1v: '0.3.3',
          p2n: 'agent',
          p2v: '0.3.4'
        },
        { type: 'run_update', run_id: 'canonical_slots', wins: 15, losses: 6, draws: 43, games_played: 128 }
      ])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body[0].p1_version).toBe('0.3.4');
    expect(runs.body[0].p2_version).toBe('0.3.3');
    expect(runs.body[0].wins).toBe(15);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.version).toBe('0.3.4');
    expect(matchups.body[0].heroWins).toBe(15);
    expect(matchups.body[0].villainWins).toBe(6);
  });

  it('preserves canonical executable metadata when later run_start lacks it', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'run_start',
          run_id: 'metadata_preserve',
          p1n: 'agent',
          p1v: '0.3',
          p1_cmd: './agent',
          p1_mtime: 100,
          p2n: 'shrek',
          p2v: '6.2',
          p2_cmd: './shrek',
          p2_mtime: 200,
          total_games: 10
        },
        { type: 'run_start', run_id: 'metadata_preserve', p1n: 'agent', p1v: '0.3', p2n: 'shrek', p2v: '6.2' },
        { type: 'run_start', run_id: 'metadata_preserve', p1n: 'shrek', p1v: '6.2', p2n: 'agent', p2v: '0.3' },
        { type: 'run_update', run_id: 'metadata_preserve', wins: 3, losses: 1, draws: 2, games_played: 6 }
      ])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body[0].p1_mtime).toBe(100);
    expect(runs.body[0].p2_mtime).toBe(200);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.name).toBe('shrek');
    expect(matchups.body[0].heroWins).toBe(1);
    expect(matchups.body[0].villainWins).toBe(3);
  });

  it('uses mtime to choose hero for different bot names without changing slot1 result perspective', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'run_start',
          run_id: 'mtime_order',
          p1n: 'agent',
          p1v: '0.3',
          p1_mtime: 100,
          p2n: 'shrek',
          p2v: '6.2',
          p2_mtime: 200,
          total_games: 10
        },
        { type: 'run_update', run_id: 'mtime_order', wins: 3, losses: 1, draws: 2, games_played: 6 }
      ])
      .expect(200);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body[0].hero.name).toBe('shrek');
    expect(matchups.body[0].heroWins).toBe(1);
    expect(matchups.body[0].villainWins).toBe(3);
  });

  it('handles run updates', async () => {
    const start = {
      type: 'run_start',
      run_id: 'r1',
      config_label: 'test',
      total_games: 100,
      p1n: 'Bot1',
      p1v: '1.0',
      p2n: 'Bot2',
      p2v: '1.0'
    };
    await request(app).post('/api/batch').set('x-api-key', 'secret').send([start]).expect(200);

    const update = {
      type: 'run_update',
      run_id: 'r1',
      games_played: 50
    };
    await request(app).post('/api/batch').set('x-api-key', 'secret').send([update]).expect(200);

    const res = await request(app).get('/api/runs');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].games_played).toBe(50);
  });

  it('preserves run updates that arrive before starts', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'run_update',
          run_id: 'early_run',
          p1n: 'Bot1',
          p1v: '1.0',
          p2n: 'Bot2',
          p2v: '1.0',
          wins: 3,
          losses: 2,
          draws: 1,
          games_played: 6
        }
      ])
      .expect(200);

    const res = await request(app).get('/api/runs');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('early_run');
    expect(res.body[0].games_played).toBe(6);
    expect(res.body[0].wins).toBe(3);
  });

  it('preserves run metrics across sparse updates', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'run_update',
          run_id: 'metric_run',
          p1n: 'Bot1',
          p1v: '1.0',
          p2n: 'Bot2',
          p2v: '1.0',
          p1_time: 123,
          p2_time: 456,
          p1_cma: 1.25,
          p2_blunder: 2.5,
          games_played: 1
        },
        { type: 'run_update', run_id: 'metric_run', games_played: 2 }
      ])
      .expect(200);

    const res = await request(app).get('/api/runs');
    expect(res.body[0].games_played).toBe(2);
    expect(res.body[0].p1_total_time_ms).toBe(123);
    expect(res.body[0].p2_total_time_ms).toBe(456);
    expect(res.body[0].p1_cma).toBe(1.25);
    expect(res.body[0].p2_blunder).toBe(2.5);
  });

  it('keeps underscore run ids canonical for matchups and games', async () => {
    const runId = 'run_full_id';
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'run_start',
          run_id: runId,
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2',
          total_games: 2
        },
        {
          type: 'start',
          external_id: `${runId}_12_0`,
          run_id: runId,
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2'
        }
      ])
      .expect(200);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body).toHaveLength(1);
    expect(matchups.body[0].tournamentId).toBe(runId);
    expect(matchups.body[0].runId).toBe(runId);
    expect(matchups.body[0].live_count).toBe(1);

    const byRun = await request(app).get(`/api/games?run_id=${runId}`).expect(200);
    expect(byRun.body).toHaveLength(1);
    expect(byRun.body[0].games[0].run_id).toBe(runId);
    expect(byRun.body[0].games[0].tournament_id).toBe(runId);

    const byBadPrefix = await request(app).get('/api/games?tournament_id=run').expect(200);
    expect(byBadPrefix.body).toHaveLength(0);
  });

  it('prefers inferred underscore run id over stale supplied ids', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        { type: 'run_update', run_id: 'run', p1n: 'Agent', p1v: '0.3', p2n: 'Shrek', p2v: '6.2', wins: 2, games_played: 2 },
        {
          type: 'start',
          external_id: 'run_full_id_12_0',
          tournament_id: 'run',
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2'
        },
        {
          type: 'start',
          external_id: 'run_full_id_12_1',
          run_id: 'run',
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2'
        },
        { type: 'run_update', run_id: 'run', wins: 3, losses: 0, draws: 0, games_played: 3 }
      ])
      .expect(200);

    const byRun = await request(app).get('/api/games?run_id=run_full_id').expect(200);
    expect(byRun.body).toHaveLength(1);
    expect(byRun.body[0].games).toHaveLength(2);
    expect(byRun.body[0].games.every((g) => g.tournament_id === 'run_full_id')).toBe(true);

    const byStale = await request(app).get('/api/games?run_id=run').expect(200);
    expect(byStale.body).toHaveLength(0);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body).toHaveLength(1);
    expect(matchups.body[0].total).toBe(3);
    expect(matchups.body[0].heroWins).toBe(3);

    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([{ type: 'run_update', run_id: 'run', wins: 4, losses: 0, draws: 0, games_played: 4 }])
      .expect(200);

    const afterAlias = await request(app).get('/api/matchups').expect(200);
    expect(afterAlias.body).toHaveLength(1);
    expect(afterAlias.body[0].runId).toBe('run_full_id');
    expect(afterAlias.body[0].total).toBe(4);
    expect(afterAlias.body[0].heroWins).toBe(4);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body.some((r) => r.id === 'run')).toBe(false);
  });

  it('clears run aliases on reset', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'start',
          external_id: 'run_full_id_12_0',
          run_id: 'run',
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2'
        }
      ])
      .expect(200);

    await request(app).delete('/api/reset').set('x-api-key', 'secret').expect(200);
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([{ type: 'run_update', run_id: 'run', p1n: 'Agent', p1v: '0.3', p2n: 'Shrek', p2v: '6.2', games_played: 1 }])
      .expect(200);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].id).toBe('run');
  });

  it('updates duplicate starts to the canonical run identity', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        {
          type: 'start',
          external_id: 'legacy_1_0',
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2'
        },
        { type: 'move', external_id: 'legacy_1_0', x: 10, y: 10, c: 1 },
        { type: 'result', external_id: 'legacy_1_0', winner: 1 },
        { type: 'run_update', run_id: 'legacy', wins: 1, losses: 0, draws: 0, games_played: 1 },
        {
          type: 'start',
          external_id: 'legacy_1_0',
          run_id: 'canonical_run',
          p1n: 'Agent',
          p1v: '0.3',
          p2n: 'Shrek',
          p2v: '6.2'
        }
      ])
      .expect(200);

    const byRun = await request(app).get('/api/games?run_id=canonical_run').expect(200);
    expect(byRun.body).toHaveLength(1);
    expect(byRun.body[0].games).toHaveLength(1);
    expect(byRun.body[0].games[0].run_id).toBe('canonical_run');
    expect(byRun.body[0].games[0].move_count).toBe(1);
    expect(byRun.body[0].games[0].winner_color).toBe(1);

    const matchups = await request(app).get('/api/matchups').expect(200);
    expect(matchups.body).toHaveLength(1);
    expect(matchups.body[0].runId).toBe('canonical_run');
    expect(matchups.body[0].total).toBe(1);
    expect(matchups.body[0].heroWins).toBe(1);

    const runs = await request(app).get('/api/runs').expect(200);
    expect(runs.body.map((r) => r.id)).toEqual(['canonical_run']);
  });

  it('repairs truncated stored identities on startup without touching custom ids', async () => {
    await request(app)
      .post('/api/batch')
      .set('x-api-key', 'secret')
      .send([
        { type: 'run_update', run_id: 'run', p1n: 'Agent', p1v: '0.3', p2n: 'Shrek', p2v: '6.2', wins: 2, games_played: 2 },
        { type: 'run_start', run_id: 'custom', p1n: 'Agent', p1v: '0.3', p2n: 'Shrek', p2v: '6.2' },
        { type: 'start', external_id: 'run_full_id_12_0', tournament_id: 'run', p1n: 'Agent', p1v: '0.3', p2n: 'Shrek', p2v: '6.2' },
        { type: 'start', external_id: 'custom_game', run_id: 'custom', p1n: 'Agent', p1v: '0.3', p2n: 'Shrek', p2v: '6.2' }
      ])
      .expect(200);

    closeDb();
    app = createApp(path.join(tmpDir, 'test.db'));

    const byRun = await request(app).get('/api/games?run_id=run_full_id').expect(200);
    expect(byRun.body).toHaveLength(1);
    expect(byRun.body[0].games[0].tournament_id).toBe('run_full_id');

    const custom = await request(app).get('/api/games?run_id=custom').expect(200);
    expect(custom.body).toHaveLength(1);
    expect(custom.body[0].games[0].external_id).toBe('custom_game');

    const runs = await request(app).get('/api/runs').expect(200);
    const repaired = runs.body.find((r) => r.id === 'run_full_id');
    expect(repaired.games_played).toBe(2);
    expect(repaired.wins).toBe(2);
    expect(runs.body.some((r) => r.id === 'run')).toBe(false);
  });
});
