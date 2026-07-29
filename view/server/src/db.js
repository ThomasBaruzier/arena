import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

let db;
let generation = randomUUID();

const resetFiles = (dbPath) => {
  if (dbPath === ':memory:') return;

  fs.mkdirSync(path.dirname(dbPath), {
    recursive: true
  });

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, {
      force: true
    });
  }
};

export const rotateGeneration = () => {
  generation = randomUUID();
  return generation;
};

export const getGeneration = () => generation;

export const init = (dbPath) => {
  if (db) {
    db.close();
    db = null;
  }

  resetFiles(dbPath);
  rotateGeneration();

  try {
    db = new Database(dbPath);
  } catch (error) {
    console.error(`Fatal: failed to open SQLite database at ${dbPath}:`, error.message);
    throw error;
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE runs (
      id TEXT NOT NULL PRIMARY KEY,
      config_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'live'
        CHECK(status IN ('live', 'ended', 'stopped')),
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE run_slots (
      run_id TEXT NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      cmd TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(run_id, slot),
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      group_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
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
  `);

  db.pragma('user_version = 4');

  return db;
};

export const getDb = () => db;

export const prepare = (sql) => db.prepare(sql);

export const transaction = (fn) => db.transaction(fn);

export const close = () => {
  if (!db) return;

  db.close();
  db = null;
};
