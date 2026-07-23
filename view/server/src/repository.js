let stmts = {};
let dbInstance = null;

const sourceColumn = (column) => `(SELECT ${column} FROM runs WHERE id = @from)`;
const copyColumn = (column, condition) =>
  `${column} = CASE WHEN (${condition}) THEN ${sourceColumn(column)} ELSE ${column} END`;
const gameIdentityAssignments = 'group_id = @group_id, tournament_id = @run_id, run_id = @run_id';

const sourceHasPlayers = `${sourceColumn('p1_name')} != 'Unknown' AND ${sourceColumn('p2_name')} != 'Unknown'`;
const placeholderRunCondition = `
  config_label = 'repaired' OR
  (config_label = 'live' AND total_games = 0 AND p1_nodes = 0 AND p2_nodes = 0 AND eval_nodes = 0 AND min_pairs = 0 AND max_pairs = 0)
`;
const placeholderRunWithPlayersCondition = `(${sourceHasPlayers}) AND (${placeholderRunCondition})`;
const betterRunMetricsCondition = `
  ${sourceColumn('games_played')} > games_played OR
  (${sourceColumn('games_played')} = games_played AND
   ${sourceColumn('wins + losses + draws')} > wins + losses + draws)
`;
const mergeRunMetricAssignments = ['p1_name', 'p1_version', 'p1_cmd', 'p1_mtime', 'p2_name', 'p2_version', 'p2_cmd', 'p2_mtime']
  .map((column) => copyColumn(column, placeholderRunWithPlayersCondition))
  .concat(
    [
      'config_label',
      'total_games',
      'p1_nodes',
      'p2_nodes',
      'eval_nodes',
      'board_size',
      'min_pairs',
      'max_pairs',
      'repeat_index',
      'seed'
    ].map((column) => copyColumn(column, placeholderRunCondition)),
    ['games_played', 'wins', 'losses', 'draws'].map((column) =>
      copyColumn(column, betterRunMetricsCondition)
    ),
    [
      'wall_time_ms',
      'p1_elo',
      'p1_erf',
      'p1_total_time_ms',
      'p1_crashes',
      'p1_cma',
      'p1_blunder',
      'p2_elo',
      'p2_erf',
      'p2_total_time_ms',
      'p2_crashes',
      'p2_cma',
      'p2_blunder'
    ].map((column) => copyColumn(column, betterRunMetricsCondition)),
    ['is_done', 'timed_out'].map((column) => copyColumn(column, placeholderRunCondition))
  )
  .join(',\n        ');

const init = (db) => {
  dbInstance = db;
  stmts = {
    insertPlayer: db.prepare(
      'INSERT OR IGNORE INTO players (name, version) VALUES (@name, @version)'
    ),
    getPlayerId: db.prepare('SELECT id FROM players WHERE name = @name AND version = @version'),
    insertGame: db.prepare(`
      INSERT INTO games (
        external_id, group_id, tournament_id, black_id, white_id, run_id, black_is_p1, opening_len
      ) VALUES (@external_id, @group_id, @tournament_id, @black_id, @white_id, @run_id, @black_is_p1, @opening_len)
      ON CONFLICT(external_id) DO UPDATE SET
        group_id = excluded.group_id,
        tournament_id = excluded.tournament_id,
        run_id = excluded.run_id,
        black_id = excluded.black_id,
        white_id = excluded.white_id,
        black_is_p1 = excluded.black_is_p1,
        opening_len = excluded.opening_len
    `),
    getGameByExt: db.prepare('SELECT * FROM games WHERE external_id = ?'),
    updateGameFull: db.prepare(
      'UPDATE games SET moves = @moves, winner_color = @winner, duration = @duration WHERE id = @id'
    ),
    getGameDetails: db.prepare(`
      SELECT
        g.id, g.external_id, g.group_id, g.tournament_id, g.timestamp, g.moves, g.winner_color,
        g.run_id, g.black_is_p1, g.opening_len, g.duration,
        p1.id as black_id, p1.name as black_name, p1.version as black_ver,
        p2.id as white_id, p2.name as white_name, p2.version as white_ver
      FROM games g
      JOIN players p1 ON g.black_id = p1.id
      JOIN players p2 ON g.white_id = p2.id
      WHERE g.id = ?
    `),
    insertRun: db.prepare(`
      INSERT INTO runs (
        id, p1_name, p1_version, p1_cmd, p1_mtime, p2_name, p2_version, p2_cmd, p2_mtime, config_label, total_games,
        p1_nodes, p2_nodes, eval_nodes, board_size, min_pairs, max_pairs, repeat_index, seed
      ) VALUES (
        @id, @p1_name, @p1_version, @p1_cmd, @p1_mtime, @p2_name, @p2_version, @p2_cmd, @p2_mtime, @config_label, @total_games,
        @p1_nodes, @p2_nodes, @eval_nodes, @board_size, @min_pairs, @max_pairs, @repeat_index, @seed
      )
      ON CONFLICT(id) DO UPDATE SET
        p1_name = excluded.p1_name,
        p1_version = excluded.p1_version,
        p1_cmd = excluded.p1_cmd,
        p1_mtime = excluded.p1_mtime,
        p2_name = excluded.p2_name,
        p2_version = excluded.p2_version,
        p2_cmd = excluded.p2_cmd,
        p2_mtime = excluded.p2_mtime,
        config_label = excluded.config_label,
        total_games = excluded.total_games,
        p1_nodes = excluded.p1_nodes,
        p2_nodes = excluded.p2_nodes,
        eval_nodes = excluded.eval_nodes,
        board_size = excluded.board_size,
        min_pairs = excluded.min_pairs,
        max_pairs = excluded.max_pairs,
        repeat_index = excluded.repeat_index,
        seed = excluded.seed,
        updated_at = CURRENT_TIMESTAMP
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
    getRunById: db.prepare('SELECT * FROM runs WHERE id = ?'),
    reviveRun: db.prepare(
      'UPDATE runs SET is_done = 0, timed_out = 0, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND (is_done = 1 OR timed_out = 1)'
    ),
    getAllRuns: db.prepare('SELECT * FROM runs ORDER BY updated_at DESC LIMIT 50'),
    getLatestGame: db.prepare('SELECT id FROM games ORDER BY id DESC LIMIT 1'),
    getAllPlayers: db.prepare('SELECT id, name, version FROM players'),
    getRunsForMatchups: db.prepare(`
      SELECT
        r.id as tournamentId,
        r.id as runId,
        r.p1_name, r.p1_version, r.p1_cmd, r.p1_mtime,
        r.p2_name, r.p2_version, r.p2_cmd, r.p2_mtime,
        r.wins, r.losses, r.draws, r.games_played,
        r.updated_at,
        r.p1_elo, r.p2_elo,
        r.p1_erf, r.p2_erf,
        r.p1_total_time_ms, r.p2_total_time_ms,
        r.p1_crashes, r.p2_crashes,
        r.p1_cma, r.p2_cma,
        r.p1_blunder, r.p2_blunder,
        r.timed_out,
        (SELECT COUNT(*) FROM games g WHERE g.run_id = r.id AND g.winner_color = 0) as live_count,
        p1.id as p1_id, p2.id as p2_id
      FROM runs r
      LEFT JOIN players p1 ON r.p1_name = p1.name AND r.p1_version = p1.version
      LEFT JOIN players p2 ON r.p2_name = p2.name AND r.p2_version = p2.version
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT @limit OFFSET @offset
    `),
    getRunOffset: db.prepare(`
      SELECT COUNT(*) as offset FROM runs
      WHERE updated_at > (SELECT updated_at FROM runs WHERE id = @id)
      OR (updated_at = (SELECT updated_at FROM runs WHERE id = @id) AND id > @id)
    `),
    getGameGroupMaxId: db.prepare('SELECT MAX(id) as max_id FROM games WHERE group_id = ?'),
    getGameGroupOffset: db.prepare(`
      SELECT COUNT(*) as offset FROM (
        SELECT group_id, MAX(id) as m_id
        FROM games
        WHERE run_id = @runId
        GROUP BY group_id
      ) WHERE m_id > @targetMaxId
    `),
    getExpiredRunIds: db.prepare(
      `SELECT id FROM runs r
       WHERE games_played = 0
         AND created_at < datetime('now', '-60 seconds')
         AND NOT EXISTS (SELECT 1 FROM games g WHERE g.run_id = r.id)`
    ),
    deleteEmptyRun: db.prepare(
      `DELETE FROM runs
       WHERE id = @id
         AND NOT EXISTS (SELECT 1 FROM games g WHERE g.run_id = runs.id)`
    ),
    deleteRuns: db.prepare(
      `DELETE FROM runs
       WHERE games_played = 0
         AND created_at < datetime('now', '-60 seconds')
         AND NOT EXISTS (SELECT 1 FROM games g WHERE g.run_id = runs.id)`
    ),
    markStaleRuns: db.prepare(
      `UPDATE runs SET is_done = 1, timed_out = 1 WHERE is_done = 0 AND updated_at < datetime('now', '-5 minutes')`
    ),
    getStaleRunIds: db.prepare(
      "SELECT id FROM runs WHERE is_done = 0 AND updated_at < datetime('now', '-5 minutes')"
    ),
    getStaleGameIds: db.prepare(
      'SELECT id, external_id, run_id, group_id, tournament_id, black_id, white_id, moves FROM games WHERE winner_color = 0 AND run_id IN (SELECT id FROM runs WHERE timed_out = 1)'
    ),
    markStaleGamesAsCrashed: db.prepare(`
        UPDATE games SET winner_color = 4
        WHERE winner_color = 0 AND run_id IN (SELECT id FROM runs WHERE timed_out = 1)
    `),
    getGamesForIdentityRepair: db.prepare('SELECT id, external_id, run_id, tournament_id FROM games'),
    updateGameIdentity: db.prepare(`UPDATE games SET ${gameIdentityAssignments} WHERE id = @id`),
    updateGameIdentityRevive: db.prepare(
      `UPDATE games SET ${gameIdentityAssignments}, winner_color = CASE WHEN winner_color = 4 THEN 0 ELSE winner_color END, moves = CASE WHEN winner_color = 4 THEN '' ELSE moves END, duration = CASE WHEN winner_color = 4 THEN 0 ELSE duration END WHERE id = @id`
    ),
    renameRun: db.prepare(`
      UPDATE runs SET id = @to, updated_at = CURRENT_TIMESTAMP
      WHERE id = @from AND NOT EXISTS (SELECT 1 FROM runs WHERE id = @to)
    `),
    mergeRunMetrics: db.prepare(`
      UPDATE runs SET
        ${mergeRunMetricAssignments},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @to AND EXISTS (SELECT 1 FROM runs WHERE id = @from)
    `),
    getGamesByRunForIdentityRepair: db.prepare(
      'SELECT id, external_id, run_id, tournament_id FROM games WHERE run_id = @id OR (run_id IS NULL AND tournament_id = @id)'
    ),
    getRunAlias: db.prepare('SELECT run_id FROM run_aliases WHERE alias = ?'),
    insertRunAlias: db.prepare(`
      INSERT INTO run_aliases (alias, run_id) VALUES (@alias, @run_id)
      ON CONFLICT(alias) DO UPDATE SET run_id = excluded.run_id
    `)
  };
};

const getGamesDynamic = ({ hero, villain, tid, runId, limit, offset, orderBy }) => {
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
          (winner_color = 1 AND black_id = @hero) OR (winner_color = 2 AND white_id = @hero)
        ) THEN 1 ELSE 0 END) as hero_wins,
        json_group_array(json_object(
          'id', id, 'winner_color', winner_color,
          'move_count', CASE WHEN moves IS NULL OR moves = '' THEN 0 ELSE LENGTH(moves) - LENGTH(REPLACE(moves, ';', '')) + 1 END,
          'timestamp', timestamp, 'external_id', external_id,
          'black_id', black_id, 'white_id', white_id, 'tournament_id', tournament_id,
          'run_id', run_id,
          'opening_len', opening_len,
          'duration', duration
        )) as games_json
      FROM games
      WHERE (@hero = 0 OR (black_id = @hero AND white_id = @villain) OR (black_id = @villain AND white_id = @hero))
        ${tid ? 'AND tournament_id = @tid' : ''}
        ${runId ? 'AND run_id = @runId' : ''}
      GROUP BY group_id
    )
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
export const reviveRun = (id) => stmts.reviveRun.run({ id });
export const getAllRuns = () => stmts.getAllRuns.all();
export const getLatestGame = () => stmts.getLatestGame.get();
export const getRunsForMatchups = (limit, offset) =>
  stmts.getRunsForMatchups.all({ limit, offset });
export const getAllPlayers = () => stmts.getAllPlayers.all();
export const getExpiredRunIds = () => stmts.getExpiredRunIds.all();
export const deleteEmptyRun = (id) => stmts.deleteEmptyRun.run({ id });
export const deleteRuns = () => stmts.deleteRuns.run();
export const markStaleRuns = () => stmts.markStaleRuns.run();
export const markStaleGamesAsCrashed = () => stmts.markStaleGamesAsCrashed.run();
export const getStaleRunIds = () => stmts.getStaleRunIds.all();
export const getStaleGameIds = () => stmts.getStaleGameIds.all();
export const getGamesForIdentityRepair = () => stmts.getGamesForIdentityRepair.all();
export const getGamesByRunForIdentityRepair = (runId) =>
  stmts.getGamesByRunForIdentityRepair.all({ id: runId });
export const updateGameIdentity = (g) => stmts.updateGameIdentity.run(g);
export const updateGameIdentityRevive = (g) => stmts.updateGameIdentityRevive.run(g);
export const renameRun = (from, to) => stmts.renameRun.run({ from, to });
export const mergeRunMetrics = (from, to) => stmts.mergeRunMetrics.run({ from, to });
export const getRunAlias = (alias) => stmts.getRunAlias.get(alias);
export const insertRunAlias = (alias, runId) => stmts.insertRunAlias.run({ alias, run_id: runId });
export const getRunOffset = (id) => stmts.getRunOffset.get({ id });
export const getGameGroupMaxId = (groupId) => stmts.getGameGroupMaxId.get(groupId);
export const getGameGroupOffset = (runId, targetMaxId) =>
  stmts.getGameGroupOffset.get({ runId, targetMaxId });
export { getGamesDynamic };
