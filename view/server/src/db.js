import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const SCHEMA_VERSION = 5;

let database = null;
let generation = null;

const userTables = (db) =>
  db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
    `
    )
    .all();

const createSchema = (db) => {
  const initialGeneration = randomUUID();

  db.exec(`
    CREATE TABLE viewer_meta (
      id INTEGER NOT NULL PRIMARY KEY CHECK(id = 1),
      generation TEXT NOT NULL
    );

    INSERT INTO viewer_meta (id, generation)
    VALUES (1, '${initialGeneration}');

    CREATE TABLE runs (
      id TEXT NOT NULL PRIMARY KEY,
      config_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'live'
        CHECK(status IN ('live', 'ended', 'stopped')),
      analysis_enabled INTEGER NOT NULL
        CHECK(analysis_enabled IN (0, 1)),
      total_games INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      wall_time_ms INTEGER NOT NULL DEFAULT 0,
      p1_nodes INTEGER NOT NULL DEFAULT 0,
      p2_nodes INTEGER NOT NULL DEFAULT 0,
      eval_nodes INTEGER NOT NULL DEFAULT 0,
      board_size INTEGER NOT NULL DEFAULT 20,
      min_pairs INTEGER NOT NULL DEFAULT 1,
      max_pairs INTEGER NOT NULL DEFAULT 10,
      repeat_index INTEGER NOT NULL DEFAULT 0,
      seed INTEGER,
      p1_elo REAL NOT NULL DEFAULT 1000,
      p1_erf REAL NOT NULL DEFAULT 50,
      p1_total_time_ms INTEGER NOT NULL DEFAULT 0,
      p1_cpu_time_ms INTEGER NOT NULL DEFAULT 0,
      p1_cpu_wall_time_ms INTEGER NOT NULL DEFAULT 0,
      p1_crashes INTEGER NOT NULL DEFAULT 0,
      p1_cma REAL NOT NULL DEFAULT 0,
      p1_blunder REAL NOT NULL DEFAULT 0,
      p1_moves_analyzed INTEGER NOT NULL DEFAULT 0,
      p1_critical_total INTEGER NOT NULL DEFAULT 0,
      p2_elo REAL NOT NULL DEFAULT 1000,
      p2_erf REAL NOT NULL DEFAULT 50,
      p2_total_time_ms INTEGER NOT NULL DEFAULT 0,
      p2_cpu_time_ms INTEGER NOT NULL DEFAULT 0,
      p2_cpu_wall_time_ms INTEGER NOT NULL DEFAULT 0,
      p2_crashes INTEGER NOT NULL DEFAULT 0,
      p2_cma REAL NOT NULL DEFAULT 0,
      p2_blunder REAL NOT NULL DEFAULT 0,
      p2_moves_analyzed INTEGER NOT NULL DEFAULT 0,
      p2_critical_total INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE run_slots (
      run_id TEXT NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      cmd TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(run_id, slot),
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      group_id TEXT NOT NULL,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      winner_color INTEGER NOT NULL DEFAULT 0,
      moves TEXT NOT NULL DEFAULT '',
      run_id TEXT NOT NULL,
      black_slot INTEGER NOT NULL CHECK(black_slot IN (1, 2)),
      white_slot INTEGER NOT NULL CHECK(white_slot IN (1, 2)),
      opening_len INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      CHECK(black_slot <> white_slot),
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_games_timestamp ON games(timestamp);
    CREATE INDEX idx_games_group ON games(group_id);
    CREATE INDEX idx_games_run ON games(run_id);
    CREATE INDEX idx_runs_updated ON runs(updated_at);

    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
};

const loadGeneration = (db) => {
  const row = db
    .prepare(
      `
      SELECT generation
      FROM viewer_meta
      WHERE id = 1
    `
    )
    .get();

  if (!row || typeof row.generation !== 'string' || !row.generation) {
    throw new Error('Invalid viewer database metadata: wipe the viewer database');
  }

  return row.generation;
};

export const init = (dbPath) => {
  close();

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), {
      recursive: true
    });
  }

  try {
    database = new Database(dbPath);
  } catch (error) {
    console.error(`Fatal: failed to open SQLite database at ${dbPath}:`, error.message);
    throw error;
  }

  try {
    database.pragma('foreign_keys = ON');

    const tables = userTables(database);
    const version = database.pragma('user_version', {
      simple: true
    });

    if (tables.length === 0) {
      if (version !== 0) {
        throw new Error('Unsupported viewer database schema: wipe the viewer database');
      }

      createSchema(database);
    } else if (version !== SCHEMA_VERSION) {
      throw new Error('Unsupported viewer database schema: wipe the viewer database');
    }

    generation = loadGeneration(database);
    database.pragma('journal_mode = WAL');

    return database;
  } catch (error) {
    database.close();
    database = null;
    generation = null;
    throw error;
  }
};

export const getDb = () => database;

export const getGeneration = () => {
  if (!database || !generation) {
    throw new Error('Viewer database is not initialized');
  }

  return generation;
};

export const reset = () => {
  if (!database) {
    throw new Error('Viewer database is not initialized');
  }

  const next = randomUUID();
  const apply = database.transaction(() => {
    database.exec(`
      DELETE FROM games;
      DELETE FROM runs;
    `);

    const result = database
      .prepare(
        `
        UPDATE viewer_meta
        SET generation = ?
        WHERE id = 1
      `
      )
      .run(next);

    if (result.changes !== 1) {
      throw new Error('Failed to rotate viewer generation');
    }
  });

  apply();
  generation = next;

  return generation;
};

export const prepare = (sql) => database.prepare(sql);
export const transaction = (fn) => database.transaction(fn);

export const close = () => {
  if (!database) return;

  database.close();
  database = null;
  generation = null;
};
