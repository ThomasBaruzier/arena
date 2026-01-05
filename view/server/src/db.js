import Database from 'better-sqlite3';

let db;

export const init = (dbPath) => {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, version)
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      group_id TEXT,
      tournament_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      black_id INTEGER NOT NULL,
      white_id INTEGER NOT NULL,
      winner_color INTEGER DEFAULT 0,
      moves TEXT DEFAULT '',
      run_id TEXT,
      black_is_p1 INTEGER DEFAULT 1,
      FOREIGN KEY(black_id) REFERENCES players(id),
      FOREIGN KEY(white_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      p1_name TEXT,
      p1_version TEXT,
      p2_name TEXT,
      p2_version TEXT,
      config_label TEXT,
      total_games INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      wall_time_ms INTEGER DEFAULT 0,
      arena_load REAL DEFAULT 0,
      p1_efficiency REAL DEFAULT 0,
      p2_efficiency REAL DEFAULT 0,
      p1_nodes INTEGER DEFAULT 0,
      p2_nodes INTEGER DEFAULT 0,
      eval_nodes INTEGER DEFAULT 0,
      board_size INTEGER DEFAULT 20,
      min_pairs INTEGER DEFAULT 5,
      max_pairs INTEGER DEFAULT 10,
      repeat_index INTEGER DEFAULT 0,
      seed INTEGER,
      p1_elo REAL DEFAULT 1000,
      p1_dqi REAL DEFAULT 0,
      p1_cma REAL DEFAULT 0,
      p1_blunder REAL DEFAULT 0,
      p1_crashes INTEGER DEFAULT 0,
      p2_elo REAL DEFAULT 1000,
      p2_dqi REAL DEFAULT 0,
      p2_cma REAL DEFAULT 0,
      p2_blunder REAL DEFAULT 0,
      p2_crashes INTEGER DEFAULT 0,
      is_done INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_games_players ON games(black_id, white_id);
    CREATE INDEX IF NOT EXISTS idx_games_timestamp ON games(timestamp);
    CREATE INDEX IF NOT EXISTS idx_games_group ON games(group_id);
    CREATE INDEX IF NOT EXISTS idx_games_tournament ON games(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_games_run ON games(run_id);
    CREATE INDEX IF NOT EXISTS idx_runs_updated ON runs(updated_at);
  `);

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
