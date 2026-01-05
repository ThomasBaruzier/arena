let stmts = {};
let dbInstance = null;

const init = (db) => {
  dbInstance = db;
  stmts = {
    insertPlayer: db.prepare(
      'INSERT OR IGNORE INTO players (name, version) VALUES (@name, @version)'
    ),
    getPlayerId: db.prepare('SELECT id FROM players WHERE name = @name AND version = @version'),
    insertGame: db.prepare(`
      INSERT OR IGNORE INTO games (
        external_id, group_id, tournament_id, black_id, white_id, run_id, black_is_p1
      ) VALUES (@external_id, @group_id, @tournament_id, @black_id, @white_id, @run_id, @black_is_p1)
    `),
    getGameByExt: db.prepare('SELECT * FROM games WHERE external_id = ?'),
    updateGameFull: db.prepare(
      'UPDATE games SET moves = @moves, winner_color = @winner WHERE id = @id'
    ),
    getGameDetails: db.prepare(`
      SELECT
        g.id, g.external_id, g.group_id, g.tournament_id, g.timestamp, g.moves, g.winner_color,
        g.run_id, g.black_is_p1,
        p1.id as black_id, p1.name as black_name, p1.version as black_ver,
        p2.id as white_id, p2.name as white_name, p2.version as white_ver
      FROM games g
      JOIN players p1 ON g.black_id = p1.id
      JOIN players p2 ON g.white_id = p2.id
      WHERE g.id = ?
    `),
    insertRun: db.prepare(`
      INSERT OR REPLACE INTO runs (
        id, p1_name, p1_version, p2_name, p2_version, config_label, total_games,
        p1_nodes, p2_nodes, eval_nodes, board_size, min_pairs, max_pairs, repeat_index, seed
      ) VALUES (
        @id, @p1_name, @p1_version, @p2_name, @p2_version, @config_label, @total_games,
        @p1_nodes, @p2_nodes, @eval_nodes, @board_size, @min_pairs, @max_pairs, @repeat_index, @seed
      )
    `),
    updateRun: db.prepare(`
      UPDATE runs SET
        games_played = @games_played, wins = @wins, losses = @losses, draws = @draws,
        wall_time_ms = @wall_time_ms, arena_load = @arena_load,
        p1_efficiency = @p1_efficiency, p2_efficiency = @p2_efficiency,
        p1_elo = @p1_elo, p1_dqi = @p1_dqi, p1_cma = @p1_cma, p1_blunder = @p1_blunder,
        p1_crashes = @p1_crashes, p2_elo = @p2_elo, p2_dqi = @p2_dqi, p2_cma = @p2_cma,
        p2_blunder = @p2_blunder, p2_crashes = @p2_crashes, is_done = @is_done,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `),
    getRunById: db.prepare('SELECT * FROM runs WHERE id = ?'),
    getAllRuns: db.prepare('SELECT * FROM runs ORDER BY updated_at DESC LIMIT 50'),
    getLatestGame: db.prepare('SELECT id FROM games ORDER BY id DESC LIMIT 1'),
    getRawStats: db.prepare(`
      SELECT tournament_id, black_id, white_id, winner_color,
      CASE WHEN external_id LIKE '%_0' THEN 0 ELSE 1 END as leg,
      MAX(timestamp) as last_ts, COUNT(*) as cnt
      FROM games GROUP BY tournament_id, black_id, white_id, winner_color, leg
    `),
    getAllPlayers: db.prepare('SELECT id, name, version FROM players')
  };
};

const getGamesDynamic = ({ hero, villain, tid, runId, limit, offset, orderBy }) => {
  if (!dbInstance) throw new Error('Repository not initialized');
  const sql = `
    SELECT
      group_id, COUNT(*) as pair_size, MAX(timestamp) as latest_ts, MAX(id) as max_id,
      MAX(CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END) as max_moves,
      MIN(CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END) as min_moves,
      SUM(CASE WHEN winner_color = 0 THEN 1 ELSE 0 END) as live_count,
      SUM(CASE WHEN winner_color != 0 AND winner_color != 3 AND (
        (winner_color = 1 AND black_id = @hero) OR (winner_color = 2 AND white_id = @hero)
      ) THEN 1 ELSE 0 END) as hero_wins,
      json_group_array(json_object(
        'id', id, 'winner_color', winner_color,
        'move_count', CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END,
        'timestamp', timestamp, 'external_id', external_id,
        'black_id', black_id, 'white_id', white_id, 'tournament_id', tournament_id
      )) as games_json
    FROM games
    WHERE (@hero = 0 OR (black_id = @hero AND white_id = @villain) OR (black_id = @villain AND white_id = @hero))
      ${tid ? 'AND tournament_id = @tid' : ''}
      ${runId ? 'AND run_id = @runId' : ''}
    GROUP BY group_id
    ORDER BY ${orderBy} LIMIT @limit OFFSET @offset
  `;
  return dbInstance.prepare(sql).all({ hero, villain, tid, runId, limit, offset });
};

export { init };
export const insertPlayer = (p) => stmts.insertPlayer.run(p);
export const getPlayerId = (p) => stmts.getPlayerId.get(p);
export const insertGame = (g) => stmts.insertGame.run(g);
export const getGameByExt = (id) => stmts.getGameByExt.get(id);
export const updateGameFull = (g) => stmts.updateGameFull.run(g);
export const getGameDetails = (id) => stmts.getGameDetails.get(id);
export const insertRun = (r) => stmts.insertRun.run(r);
export const updateRun = (r) => stmts.updateRun.run(r);
export const getRunById = (id) => stmts.getRunById.get(id);
export const getAllRuns = () => stmts.getAllRuns.all();
export const getLatestGame = () => stmts.getLatestGame.get();
export const getRawStats = () => stmts.getRawStats.all();
export const getAllPlayers = () => stmts.getAllPlayers.all();
export { getGamesDynamic };
