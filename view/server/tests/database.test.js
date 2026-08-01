import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { close, getDb, getGeneration, init as initDb, reset as resetDb } from '../src/db.js';
import * as repository from '../src/repository.js';

const run = (id, analysisEnabled = false) => ({
  id,
  config_label: 'test',
  status: 'live',
  analysis_enabled: analysisEnabled ? 1 : 0,
  total_games: 20,
  p1_nodes: 1000,
  p2_nodes: 2000,
  eval_nodes: 2000000,
  board_size: 20,
  min_pairs: 1,
  max_pairs: 10,
  repeat_index: 0,
  seed: null
});

const slot = (runId, number, name) => ({
  run_id: runId,
  slot: number,
  name,
  version: number === 1 ? '1.0' : '2.0',
  cmd: `./${name}`
});

describe('viewer database', () => {
  let directory;
  let databasePath;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-db-'));
    databasePath = path.join(directory, 'games.db');
  });

  afterEach(() => {
    close();

    fs.rmSync(directory, {
      recursive: true,
      force: true
    });
  });

  const open = () => {
    const database = initDb(databasePath);

    repository.init(database);

    return database;
  };

  it('creates only schema version five', () => {
    open();

    expect(
      getDb().pragma('user_version', {
        simple: true
      })
    ).toBe(5);

    const columns = getDb()
      .prepare('PRAGMA table_info(runs)')
      .all()
      .map((column) => column.name);

    expect(columns).toContain('analysis_enabled');
    expect(columns).toContain('p1_cpu_wall_time_ms');
    expect(columns).not.toContain('is_done');
    expect(columns).not.toContain('timed_out');
    expect(getGeneration()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves data and generation across ordinary restarts', () => {
    open();

    const firstGeneration = getGeneration();

    repository.insertRun(run('persistent', true));
    repository.insertRunSlot(slot('persistent', 1, 'Alpha'));
    repository.insertRunSlot(slot('persistent', 2, 'Beta'));

    close();
    open();

    expect(getGeneration()).toBe(firstGeneration);

    expect(repository.getRunById('persistent')).toMatchObject({
      id: 'persistent',
      analysis_enabled: 1,
      slot1_name: 'Alpha',
      slot2_name: 'Beta'
    });
  });

  it('resets data and generation atomically', () => {
    open();

    repository.insertRun(run('reset'));

    const first = getGeneration();

    getDb().exec(`
      CREATE TRIGGER fail_generation
      BEFORE UPDATE ON viewer_meta
      BEGIN
        SELECT RAISE(ABORT, 'generation failure');
      END;
    `);

    expect(() => resetDb()).toThrow('generation failure');

    expect(getGeneration()).toBe(first);

    expect(repository.getRunById('reset')).toMatchObject({
      id: 'reset'
    });

    getDb().exec('DROP TRIGGER fail_generation');

    const second = resetDb();

    expect(second).not.toBe(first);
    expect(repository.getRunById('reset')).toBeUndefined();

    close();
    open();

    expect(getGeneration()).toBe(second);
    expect(repository.getRunById('reset')).toBeUndefined();
  });

  it('rejects any previous schema without migration', () => {
    const legacy = new Database(databasePath);

    legacy.exec(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY
      );

      PRAGMA user_version = 4;
    `);

    legacy.close();

    expect(() => initDb(databasePath)).toThrow(
      'Unsupported viewer database schema: wipe the viewer database'
    );
  });

  it('derives efficiency and exposes immutable analysis configuration', () => {
    open();

    repository.insertRun(run('metrics', true));

    getDb()
      .prepare(
        `
        UPDATE runs SET
          p1_cpu_time_ms = 300,
          p1_cpu_wall_time_ms = 400,
          p2_cpu_time_ms = 50,
          p2_cpu_wall_time_ms = 0
        WHERE id = ?
      `
      )
      .run('metrics');

    const stored = repository.getRunById('metrics');

    expect(stored.analysis_enabled).toBe(1);
    expect(stored.p1_eff).toBe(75);
    expect(stored.p2_eff).toBeNull();
  });

  it('returns complete matchup run snapshots', () => {
    open();

    repository.insertRun(run('matchup', true));
    repository.insertRunSlot(slot('matchup', 1, 'Alpha'));
    repository.insertRunSlot(slot('matchup', 2, 'Beta'));

    getDb()
      .prepare(
        `
        UPDATE runs SET
          games_played = 7,
          wins = 4,
          losses = 2,
          draws = 1,
          p1_cpu_time_ms = 90,
          p1_cpu_wall_time_ms = 100
        WHERE id = ?
      `
      )
      .run('matchup');

    const rows = repository.getRunsForMatchups(20, 0);

    expect(rows).toHaveLength(1);

    expect(rows[0]).toMatchObject({
      runId: 'matchup',
      analysis_enabled: 1,
      games_played: 7,
      wins: 4,
      losses: 2,
      draws: 1,
      slot1_name: 'Alpha',
      slot2_name: 'Beta',
      p1_eff: 90
    });
  });
});
