import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb } from '../src/db.js';
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
      { type: 'result', external_id: 't1_1_1', winner: 1 }
    ];

    await request(app).post('/api/batch').set('x-api-key', 'secret').send(events).expect(200);

    const res = await request(app).get('/api/matchups');
    expect(res.body).toHaveLength(1);
    const m = res.body[0];
    expect(m.hero.name).toBe('B');
    expect(m.heroWins).toBe(1);
    expect(m.villainWins).toBe(1);
    expect(m.total).toBe(2);
  });

  it('handles run updates', async () => {
    const start = { type: 'run_start', run_id: 'r1', config_label: 'test', total_games: 100 };
    await request(app).post('/api/batch').set('x-api-key', 'secret').send([start]).expect(200);

    const update = {
      type: 'run_update',
      run_id: 'r1',
      games_played: 50,
      p1_efficiency: 95.5,
      p2_efficiency: 94.0
    };
    await request(app).post('/api/batch').set('x-api-key', 'secret').send([update]).expect(200);

    const res = await request(app).get('/api/runs');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].games_played).toBe(50);
    expect(res.body[0].p1_efficiency).toBe(95.5);
    expect(res.body[0].p2_efficiency).toBe(94.0);
  });
});
