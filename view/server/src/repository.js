let stmts = {};
let dbInstance = null;

const init = (db) => {
  dbInstance = db;
  stmts = {
    insertRun: db.prepare(`
      INSERT INTO runs (
        id, config_label, total_games, p1_nodes, p2_nodes, eval_nodes,
        board_size, min_pairs, max_pairs, repeat_index, seed
      ) VALUES (
        @id, @config_label, @total_games, @p1_nodes, @p2_nodes, @eval_nodes,
        @board_size, @min_pairs, @max_pairs, @repeat_index, @seed
      )
    `),
    insertRunSlot: db.prepare(`
      INSERT INTO run_slots (run_id, slot, name, version, cmd, mtime)
      VALUES (@run_id, @slot, @name, @version, @cmd, @mtime)
    `),
    insertGame: db.prepare(`
      INSERT INTO games (external_id, group_id, run_id, black_slot, white_slot, opening_len)
      VALUES (@external_id, @group_id, @run_id, @black_slot, @white_slot, @opening_len)
    `),
    getGameByExt: db.prepare('SELECT * FROM games WHERE external_id = ?'),
    updateGameFull: db.prepare(
      'UPDATE games SET moves = @moves, winner_color = @winner, duration = @duration WHERE id = @id'
    ),
    getGameDetails: db.prepare(`
      SELECT
        g.id, g.external_id, g.group_id, g.timestamp, g.moves, g.winner_color,
        g.run_id, g.black_slot, g.white_slot, g.opening_len, g.duration,
        bs.name as black_name, bs.version as black_ver, bs.cmd as black_cmd, bs.mtime as black_mtime,
        ws.name as white_name, ws.version as white_ver, ws.cmd as white_cmd, ws.mtime as white_mtime
      FROM games g
      JOIN run_slots bs ON bs.run_id = g.run_id AND bs.slot = g.black_slot
      JOIN run_slots ws ON ws.run_id = g.run_id AND ws.slot = g.white_slot
      WHERE g.id = ?
    `),
    updateRun: db.prepare(`
      UPDATE runs SET
        games_played = @games_played, wins = @wins, losses = @losses, draws = @draws,
        wall_time_ms = @wall_time_ms,
        p1_elo = @p1_elo, p1_erf = @p1_erf, p1_total_time_ms = @p1_time,
        p1_crashes = @p1_crashes, p1_cma = @p1_cma, p1_blunder = @p1_blunder,
        p2_elo = @p2_elo, p2_erf = @p2_erf, p2_total_time_ms = @p2_time,
        p2_crashes = @p2_crashes, p2_cma = @p2_cma, p2_blunder = @p2_blunder,
        is_done = @is_done,
        timed_out = @timed_out,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `),
    getRunById: db.prepare(`
      SELECT
        r.*,
        s1.name as slot1_name, s1.version as slot1_version, s1.cmd as slot1_cmd, s1.mtime as slot1_mtime,
        s2.name as slot2_name, s2.version as slot2_version, s2.cmd as slot2_cmd, s2.mtime as slot2_mtime
      FROM runs r
      LEFT JOIN run_slots s1 ON s1.run_id = r.id AND s1.slot = 1
      LEFT JOIN run_slots s2 ON s2.run_id = r.id AND s2.slot = 2
      WHERE r.id = ?
    `),
    getAllRuns: db.prepare(`
      SELECT
        r.*,
        s1.name as slot1_name, s1.version as slot1_version, s1.cmd as slot1_cmd, s1.mtime as slot1_mtime,
        s2.name as slot2_name, s2.version as slot2_version, s2.cmd as slot2_cmd, s2.mtime as slot2_mtime
      FROM runs r
      LEFT JOIN run_slots s1 ON s1.run_id = r.id AND s1.slot = 1
      LEFT JOIN run_slots s2 ON s2.run_id = r.id AND s2.slot = 2
      ORDER BY r.updated_at DESC LIMIT 50
    `),
    getLatestGame: db.prepare('SELECT id FROM games ORDER BY id DESC LIMIT 1'),
    getRunsForMatchups: db.prepare(`
      SELECT
        r.id as runId,
        s1.name as slot1_name, s1.version as slot1_version, s1.cmd as slot1_cmd, s1.mtime as slot1_mtime,
        s2.name as slot2_name, s2.version as slot2_version, s2.cmd as slot2_cmd, s2.mtime as slot2_mtime,
        r.wins, r.losses, r.draws, r.games_played,
        r.updated_at,
        r.p1_elo, r.p2_elo,
        r.p1_erf, r.p2_erf,
        r.p1_total_time_ms, r.p2_total_time_ms,
        r.p1_crashes, r.p2_crashes,
        r.p1_cma, r.p2_cma,
        r.p1_blunder, r.p2_blunder,
        r.timed_out,
        (SELECT COUNT(*) FROM games g WHERE g.run_id = r.id AND g.winner_color = 0) as live_count
      FROM runs r
      JOIN run_slots s1 ON s1.run_id = r.id AND s1.slot = 1
      JOIN run_slots s2 ON s2.run_id = r.id AND s2.slot = 2
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT @limit OFFSET @offset
    `)
  };
};

const getGamesDynamic = ({ runId, heroSlot, limit, offset, orderBy }) => {
  if (!dbInstance) throw new Error('Repository not initialized');
  const sql = `
    SELECT * FROM (
      SELECT
        group_id, COUNT(*) as pair_size, MAX(timestamp) as latest_ts, MAX(id) as max_id,
        MAX(CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END) as max_moves,
        MIN(CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END) as min_moves,
        SUM(CASE WHEN winner_color = 0 THEN 1 ELSE 0 END) as live_count,
        MAX(duration) as duration,
        SUM(CASE WHEN winner_color != 0 AND winner_color != 3 AND winner_color != 4 AND (
          (winner_color = 1 AND black_slot = @heroSlot) OR (winner_color = 2 AND white_slot = @heroSlot)
        ) THEN 1 ELSE 0 END) as hero_wins,
        json_group_array(json_object(
          'id', id, 'winner_color', winner_color,
          'move_count', CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END,
          'timestamp', timestamp, 'external_id', external_id,
          'black_slot', black_slot, 'white_slot', white_slot,
          'run_id', run_id,
          'opening_len', opening_len,
          'duration', duration
        )) as games_json
      FROM games
      WHERE run_id = @runId
      GROUP BY group_id
    )
    ORDER BY ${orderBy} LIMIT @limit OFFSET @offset
  `;
  return dbInstance.prepare(sql).all({ runId, heroSlot, limit, offset });
};

export { init };
export const insertRun = (r) => stmts.insertRun.run(r);
export const insertRunSlot = (slot) => stmts.insertRunSlot.run(slot);
export const insertGame = (g) => stmts.insertGame.run(g);
export const getGameByExt = (id) => stmts.getGameByExt.get(id);
export const updateGameFull = (g) => stmts.updateGameFull.run(g);
export const getGameDetails = (id) => stmts.getGameDetails.get(id);
export const updateRun = (r) => stmts.updateRun.run(r);
export const getRunById = (id) => stmts.getRunById.get(id);
export const getAllRuns = () => stmts.getAllRuns.all();
export const getLatestGame = () => stmts.getLatestGame.get();
export const getRunsForMatchups = (limit, offset) => stmts.getRunsForMatchups.all({ limit, offset });
export { getGamesDynamic };
