let statements = {};
let database = null;

const runProjection = `
  r.*,
  CASE
    WHEN r.p1_cpu_wall_time_ms > 0
    THEN 100.0 * r.p1_cpu_time_ms / r.p1_cpu_wall_time_ms
    ELSE NULL
  END AS p1_eff,
  CASE
    WHEN r.p2_cpu_wall_time_ms > 0
    THEN 100.0 * r.p2_cpu_time_ms / r.p2_cpu_wall_time_ms
    ELSE NULL
  END AS p2_eff,
  s1.name AS slot1_name,
  s1.version AS slot1_version,
  s1.cmd AS slot1_cmd,
  s2.name AS slot2_name,
  s2.version AS slot2_version,
  s2.cmd AS slot2_cmd
`;

const init = (db) => {
  database = db;

  statements = {
    insertRun: db.prepare(`
      INSERT INTO runs (
        id,
        config_label,
        status,
        total_games,
        p1_nodes,
        p2_nodes,
        eval_nodes,
        board_size,
        min_pairs,
        max_pairs,
        repeat_index,
        seed
      ) VALUES (
        @id,
        @config_label,
        @status,
        @total_games,
        @p1_nodes,
        @p2_nodes,
        @eval_nodes,
        @board_size,
        @min_pairs,
        @max_pairs,
        @repeat_index,
        @seed
      )
    `),
    insertRunSlot: db.prepare(`
      INSERT INTO run_slots (
        run_id,
        slot,
        name,
        version,
        cmd
      ) VALUES (
        @run_id,
        @slot,
        @name,
        @version,
        @cmd
      )
      ON CONFLICT(run_id, slot) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        cmd = excluded.cmd
    `),
    insertGame: db.prepare(`
      INSERT INTO games (
        external_id,
        group_id,
        run_id,
        black_slot,
        white_slot,
        opening_len
      ) VALUES (
        @external_id,
        @group_id,
        @run_id,
        @black_slot,
        @white_slot,
        @opening_len
      )
    `),
    getGameByExt: db.prepare('SELECT * FROM games WHERE external_id = ?'),
    updateGameFull: db.prepare(`
      UPDATE games SET
        moves = @moves,
        winner_color = @winner,
        duration = @duration
      WHERE id = @id
    `),
    getGameDetails: db.prepare(`
      SELECT
        g.id,
        g.external_id,
        g.group_id,
        g.timestamp,
        g.moves,
        g.winner_color,
        g.run_id,
        r.board_size,
        g.black_slot,
        g.white_slot,
        g.opening_len,
        g.duration,
        bs.name AS black_name,
        bs.version AS black_ver,
        bs.cmd AS black_cmd,
        ws.name AS white_name,
        ws.version AS white_ver,
        ws.cmd AS white_cmd
      FROM games g
      JOIN runs r ON r.id = g.run_id
      JOIN run_slots bs
        ON bs.run_id = g.run_id
        AND bs.slot = g.black_slot
      JOIN run_slots ws
        ON ws.run_id = g.run_id
        AND ws.slot = g.white_slot
      WHERE g.id = ?
    `),
    updateRun: db.prepare(`
      UPDATE runs SET
        status = @status,
        games_played = @games_played,
        wins = @wins,
        losses = @losses,
        draws = @draws,
        wall_time_ms = @wall_time_ms,
        p1_elo = @p1_elo,
        p1_erf = @p1_erf,
        p1_total_time_ms = @p1_time,
        p1_cpu_time_ms = @p1_cpu_time,
        p1_cpu_wall_time_ms = @p1_cpu_wall_time,
        p1_crashes = @p1_crashes,
        p1_cma = @p1_cma,
        p1_blunder = @p1_blunder,
        p1_moves_analyzed = @p1_moves_analyzed,
        p1_critical_total = @p1_critical_total,
        p2_elo = @p2_elo,
        p2_erf = @p2_erf,
        p2_total_time_ms = @p2_time,
        p2_cpu_time_ms = @p2_cpu_time,
        p2_cpu_wall_time_ms = @p2_cpu_wall_time,
        p2_crashes = @p2_crashes,
        p2_cma = @p2_cma,
        p2_blunder = @p2_blunder,
        p2_moves_analyzed = @p2_moves_analyzed,
        p2_critical_total = @p2_critical_total,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `),
    getRunById: db.prepare(`
      SELECT ${runProjection}
      FROM runs r
      LEFT JOIN run_slots s1
        ON s1.run_id = r.id
        AND s1.slot = 1
      LEFT JOIN run_slots s2
        ON s2.run_id = r.id
        AND s2.slot = 2
      WHERE r.id = ?
    `),
    getAllRuns: db.prepare(`
      SELECT ${runProjection}
      FROM runs r
      LEFT JOIN run_slots s1
        ON s1.run_id = r.id
        AND s1.slot = 1
      LEFT JOIN run_slots s2
        ON s2.run_id = r.id
        AND s2.slot = 2
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT 50
    `),
    getLatestGame: db.prepare('SELECT id FROM games ORDER BY id DESC LIMIT 1'),
    getRunsForMatchups: db.prepare(`
      SELECT
        ${runProjection},
        r.id AS runId,
        (
          SELECT COUNT(*)
          FROM games g
          WHERE g.run_id = r.id
            AND g.winner_color = 0
        ) AS live_count
      FROM runs r
      JOIN run_slots s1
        ON s1.run_id = r.id
        AND s1.slot = 1
      JOIN run_slots s2
        ON s2.run_id = r.id
        AND s2.slot = 2
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT @limit OFFSET @offset
    `)
  };
};

const getGamesDynamic = ({ runId, heroSlot, limit, offset, cursor, cursorClause, orderBy }) => {
  if (!database) {
    throw new Error('Repository not initialized');
  }

  const sql = `
    SELECT * FROM (
      SELECT
        g.group_id,
        COUNT(*) AS pair_size,
        MAX(g.timestamp) AS latest_ts,
        MAX(g.id) AS max_id,
        MAX(
          CASE
            WHEN g.moves = '' THEN 0
            ELSE LENGTH(g.moves)
              - LENGTH(REPLACE(g.moves, ';', ''))
              + 1
          END
        ) AS max_moves,
        MIN(
          CASE
            WHEN g.moves = '' THEN 0
            ELSE LENGTH(g.moves)
              - LENGTH(REPLACE(g.moves, ';', ''))
              + 1
          END
        ) AS min_moves,
        SUM(
          CASE
            WHEN g.winner_color = 0 THEN 1
            ELSE 0
          END
        ) AS live_count,
        MAX(g.duration) AS duration,
        SUM(
          CASE
            WHEN g.winner_color NOT IN (0, 3, 4)
              AND (
                (
                  g.winner_color = 1
                  AND g.black_slot = @heroSlot
                )
                OR (
                  g.winner_color = 2
                  AND g.white_slot = @heroSlot
                )
              )
            THEN 1
            ELSE 0
          END
        ) AS hero_wins,
        json_group_array(
          json_object(
            'id', g.id,
            'winner_color', g.winner_color,
            'move_count',
              CASE
                WHEN g.moves = '' THEN 0
                ELSE LENGTH(g.moves)
                  - LENGTH(REPLACE(g.moves, ';', ''))
                  + 1
              END,
            'timestamp', g.timestamp,
            'external_id', g.external_id,
            'black_slot', g.black_slot,
            'white_slot', g.white_slot,
            'run_id', g.run_id,
            'board_size', r.board_size,
            'opening_len', g.opening_len,
            'duration', g.duration
          )
        ) AS games_json
      FROM games g
      JOIN runs r ON r.id = g.run_id
      WHERE g.run_id = @runId
      GROUP BY g.group_id
    )
    ${cursorClause}
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `;

  const parameters = {
    runId,
    heroSlot,
    limit,
    offset
  };

  if (cursor) {
    parameters.cursorId = cursor.id;

    if (cursor.value !== undefined) {
      parameters.cursorValue = cursor.value;
    }

    if (cursor.secondary !== undefined) {
      parameters.cursorSecondary = cursor.secondary;
    }
  }

  return database.prepare(sql).all(parameters);
};

export { init };
export const insertRun = (run) => statements.insertRun.run(run);
export const insertRunSlot = (slot) => statements.insertRunSlot.run(slot);
export const insertGame = (game) => statements.insertGame.run(game);
export const getGameByExt = (id) => statements.getGameByExt.get(id);
export const updateGameFull = (game) => statements.updateGameFull.run(game);
export const getGameDetails = (id) => statements.getGameDetails.get(id);
export const updateRun = (run) => statements.updateRun.run(run);
export const getRunById = (id) => statements.getRunById.get(id);
export const getAllRuns = () => statements.getAllRuns.all();
export const getLatestGame = () => statements.getLatestGame.get();
export const getRunsForMatchups = (limit, offset) =>
  statements.getRunsForMatchups.all({ limit, offset });
export { getGamesDynamic };
