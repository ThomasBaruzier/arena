import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import createApp from '../src/app.js';
import { close as closeDb } from '../src/db.js';
import sse from '../src/sse.js';

const API_KEY = 'test-key';

const declaration = {
  type: 'run_start',
  run_id: 'persistent',
  status: 'live',
  analysis_enabled: true,
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

describe('viewer generation', () => {
  let app;
  let directory;
  let databasePath;
  let consoleError;

  beforeEach(() => {
    process.env.API_KEY = API_KEY;

    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-generation-'));

    databasePath = path.join(directory, 'games.db');

    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    app = createApp(databasePath);
  });

  afterEach(() => {
    const errors = consoleError.mock.calls;

    consoleError.mockRestore();
    closeDb();

    fs.rmSync(directory, {
      recursive: true,
      force: true
    });

    expect(errors).toEqual([]);
  });

  const post = (events) =>
    request(app).post('/api/batch').set('x-api-key', API_KEY).send(events).expect(200);

  it('preserves data and generation across normal restarts', async () => {
    const created = await post([declaration]);

    const generation = created.headers['x-arena-generation'];

    closeDb();

    app = createApp(databasePath);

    const response = await request(app).get('/api/runs').expect(200);

    expect(response.headers['x-arena-generation']).toBe(generation);

    expect(response.body).toHaveLength(1);

    expect(response.body[0]).toMatchObject({
      id: 'persistent',
      analysis_enabled: 1
    });
  });

  it('rotates one shared generation on explicit reset', async () => {
    const before = await request(app).get('/api/runs').expect(200);

    const oldGeneration = before.headers['x-arena-generation'];

    const broadcast = vi.spyOn(sse, 'broadcast');

    const reset = await request(app)
      .delete('/api/reset')
      .set('x-api-key', API_KEY)
      .expect(200);

    const newGeneration = reset.headers['x-arena-generation'];

    expect(newGeneration).toBeTruthy();

    expect(newGeneration).not.toBe(oldGeneration);

    expect(broadcast.mock.results.at(-1).value).toMatchObject({
      type: 'reset',
      generation: newGeneration
    });

    const after = await request(app).get('/api/runs').expect(200);

    expect(after.headers['x-arena-generation']).toBe(newGeneration);

    broadcast.mockRestore();
  });

  it('uses generation only in headers and SSE payloads', async () => {
    const response = await request(app).get('/api/latest-game').expect(200);

    expect(response.headers['x-arena-generation']).toBeTruthy();

    const broadcast = vi.spyOn(sse, 'broadcast');

    const payload = sse.broadcast({
      type: 'probe'
    });

    expect(payload).toMatchObject({
      type: 'probe',
      generation: response.headers['x-arena-generation']
    });

    broadcast.mockRestore();
  });
});
