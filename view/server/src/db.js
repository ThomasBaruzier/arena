import Database from 'better-sqlite3';

let db;

export const init = (dbPath) => {
  try {
    db = new Database(dbPath);
  } catch (err) {
    console.error(`Fatal: failed to open SQLite database at ${dbPath}:`, err.message);
    throw err;
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

    const assertFreshSchema = () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    if (tables.length === 0) return;

    const version = db.pragma('user_version', { simple: true });
    if (version !== 1) throw new Error('Unsupported viewer database schema: reset the viewer database');
  };

  assertFreshSchema();

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, version)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT NOT NULL PRIMARY KEY,
      p1_name TEXT NOT NULL,
      p1_version TEXT NOT NULL,
      p1_cmd TEXT,
      p1_mtime INTEGER,
      p2_name TEXT NOT NULL,
      p2_version TEXT NOT NULL,
      p2_cmd TEXT,
      p2_mtime INTEGER,
      config_label TEXT NOT NULL,
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
      min_pairs INTEGER NOT NULL DEFAULT 5,
      max_pairs INTEGER NOT NULL DEFAULT 10,
      repeat_index INTEGER NOT NULL DEFAULT 0,
      seed INTEGER,
      p1_elo REAL NOT NULL DEFAULT 1000,
      p1_erf REAL NOT NULL DEFAULT 0,
      p1_total_time_ms INTEGER NOT NULL DEFAULT 0,
      p1_crashes INTEGER NOT NULL DEFAULT 0,
      p1_cma REAL NOT NULL DEFAULT 0,
      p1_blunder REAL NOT NULL DEFAULT 0,
      p2_elo REAL NOT NULL DEFAULT 1000,
      p2_erf REAL NOT NULL DEFAULT 0,
      p2_total_time_ms INTEGER NOT NULL DEFAULT 0,
      p2_crashes INTEGER NOT NULL DEFAULT 0,
      p2_cma REAL NOT NULL DEFAULT 0,
      p2_blunder REAL NOT NULL DEFAULT 0,
      is_done INTEGER NOT NULL DEFAULT 0,
      timed_out INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      group_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      black_id INTEGER NOT NULL,
      white_id INTEGER NOT NULL,
      winner_color INTEGER NOT NULL DEFAULT 0,
      moves TEXT NOT NULL DEFAULT '',
      run_id TEXT NOT NULL,
      black_is_p1 INTEGER NOT NULL DEFAULT 1,
      opening_len INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(black_id) REFERENCES players(id),
      FOREIGN KEY(white_id) REFERENCES players(id),
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_games_players ON games(black_id, white_id);
    CREATE INDEX IF NOT EXISTS idx_games_timestamp ON games(timestamp);
    CREATE INDEX IF NOT EXISTS idx_games_group ON games(group_id);
    CREATE INDEX IF NOT EXISTS idx_games_run ON games(run_id);
    CREATE INDEX IF NOT EXISTS idx_runs_updated ON runs(updated_at);
  `);

  db.pragma('user_version = 1');

  return db;
};

export const getDb = () => db;

export const prepare = (sql) => db.prepare(sql);

export const transaction = (fn) => db.transaction(fn);

export const close = () => {
  if (db) {
    db.close();
    db = null;
  }
};
