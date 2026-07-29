import express from 'express';
import * as db from './db.js';
import * as repo from './repository.js';
import sse from './sse.js';
import { groupIdFromExternalId } from './utils.js';

const STATUSES = new Set(['live', 'ended', 'stopped']);

const MATCHUP_SORTS = new Set(['id', 'moves', 'status', 'time', 'duration']);

const ORDERS = new Set(['asc', 'desc']);

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const validString = (value) => typeof value === 'string' && value.trim().length > 0;

const validOptionalString = (value) => value == null || typeof value === 'string';

const validFinite = (value) => typeof value === 'number' && Number.isFinite(value);

const validInteger = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

const validOptionalInteger = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  value == null || validInteger(value, min, max);

const validOptionalFinite = (value) => value == null || validFinite(value);

const validOptionalStatus = (value) => value === undefined || STATUSES.has(value);

const normalizeVersion = (version) => {
  const value = typeof version === 'string' ? version.trim() : '';

  return value || 'unknown';
};

const integerOr = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  value === undefined ? fallback : validInteger(value, min, max) ? value : fallback;

const finiteOr = (value, fallback) =>
  value === undefined ? fallback : validFinite(value) ? value : fallback;

const nextStatus = (current, incoming) => {
  if (current !== 'live') return current;
  return incoming ?? current;
};

const parseQueryInteger = (value, fallback, min, max) => {
  if (value === undefined) return fallback;

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};

const getEventSlots = (event) => {
  if (!Array.isArray(event.slots) || event.slots.length !== 2) {
    return null;
  }

  if (
    !event.slots.every(
      (slot) =>
        isPlainObject(slot) &&
        (slot.slot === 1 || slot.slot === 2) &&
        validString(slot.name) &&
        validOptionalString(slot.version) &&
        validOptionalString(slot.cmd)
    )
  ) {
    return null;
  }

  const slots = event.slots
    .map((slot) => ({
      slot: slot.slot,
      name: slot.name.trim(),
      version: normalizeVersion(slot.version),
      cmd: slot.cmd ?? null
    }))
    .sort((first, second) => first.slot - second.slot);

  return new Set(slots.map((slot) => slot.slot)).size === 2 ? slots : null;
};

const validRunStart = (event) =>
  (event.status === undefined || event.status === 'live') &&
  validOptionalInteger(event.total_games, 0) &&
  validOptionalInteger(event.p1_nodes, 0) &&
  validOptionalInteger(event.p2_nodes, 0) &&
  validOptionalInteger(event.eval_nodes, 0) &&
  (event.board_size === undefined || validInteger(event.board_size, 5, 40)) &&
  validOptionalInteger(event.min_pairs, 0) &&
  validOptionalInteger(event.max_pairs, 0) &&
  validOptionalInteger(event.repeat_index, 0) &&
  validOptionalInteger(event.seed, 0) &&
  (event.config_label === undefined || typeof event.config_label === 'string');

const validRunUpdate = (event) =>
  validOptionalStatus(event.status) &&
  validOptionalInteger(event.games_played, 0) &&
  validOptionalInteger(event.wins, 0) &&
  validOptionalInteger(event.losses, 0) &&
  validOptionalInteger(event.draws, 0) &&
  validOptionalInteger(event.wall_time_ms, 0) &&
  validOptionalFinite(event.p1_elo) &&
  validOptionalFinite(event.p1_erf) &&
  validOptionalInteger(event.p1_time, 0) &&
  validOptionalInteger(event.p1_cpu_time, 0) &&
  validOptionalInteger(event.p1_cpu_wall_time, 0) &&
  validOptionalInteger(event.p1_crashes, 0) &&
  validOptionalFinite(event.p1_cma) &&
  validOptionalFinite(event.p1_blunder) &&
  validOptionalInteger(event.p1_moves_analyzed, 0) &&
  validOptionalInteger(event.p1_critical_total, 0) &&
  validOptionalFinite(event.p2_elo) &&
  validOptionalFinite(event.p2_erf) &&
  validOptionalInteger(event.p2_time, 0) &&
  validOptionalInteger(event.p2_cpu_time, 0) &&
  validOptionalInteger(event.p2_cpu_wall_time, 0) &&
  validOptionalInteger(event.p2_crashes, 0) &&
  validOptionalFinite(event.p2_cma) &&
  validOptionalFinite(event.p2_blunder) &&
  validOptionalInteger(event.p2_moves_analyzed, 0) &&
  validOptionalInteger(event.p2_critical_total, 0);

const buildRunRecord = (id, event) => ({
  id,
  config_label: event.config_label ?? 'live',
  status: 'live',
  total_games: event.total_games ?? 0,
  p1_nodes: event.p1_nodes ?? 0,
  p2_nodes: event.p2_nodes ?? 0,
  eval_nodes: event.eval_nodes ?? 0,
  board_size: event.board_size ?? 20,
  min_pairs: event.min_pairs ?? 0,
  max_pairs: event.max_pairs ?? 0,
  repeat_index: event.repeat_index ?? 0,
  seed: event.seed ?? null
});

const getRunId = (event) => (validString(event.run_id) ? event.run_id.trim() : null);

const getExternalId = (event) => (validString(event.external_id) ? event.external_id.trim() : null);

const getGameIds = (event) => {
  const externalId = getExternalId(event);

  return {
    runId: getRunId(event),
    externalId,
    groupId: externalId ? groupIdFromExternalId(externalId) : null
  };
};

const validGameSlots = (blackSlot, whiteSlot) =>
  (blackSlot === 1 || blackSlot === 2) &&
  (whiteSlot === 1 || whiteSlot === 2) &&
  blackSlot !== whiteSlot;

const validOpeningLength = (value, boardSize) =>
  value === undefined || validInteger(value, 0, boardSize * boardSize);

const validMoveEvent = (event, boardSize) =>
  validInteger(event.x, 0, boardSize - 1) &&
  validInteger(event.y, 0, boardSize - 1) &&
  validInteger(event.c, 1, 2);

const parseMovesText = (moves, boardSize) => {
  if (moves === '') return [];
  if (typeof moves !== 'string') {
    return null;
  }

  const occupied = new Set();
  const parsed = [];

  for (const [index, move] of moves.split(';').entries()) {
    if (!/^\d+,\d+,[12]$/.test(move)) {
      return null;
    }

    const [x, y, color] = move.split(',').map(Number);

    const key = `${x},${y}`;

    if (
      x < 0 ||
      x >= boardSize ||
      y < 0 ||
      y >= boardSize ||
      occupied.has(key) ||
      color !== (index % 2) + 1
    ) {
      return null;
    }

    occupied.add(key);
    parsed.push({
      x,
      y,
      c: color
    });
  }

  return parsed;
};

const hasOccupiedMove = (moves, x, y) =>
  moves
    ? moves.split(';').some((move) => {
        const [moveX, moveY] = move.split(',').map(Number);

        return moveX === x && moveY === y;
      })
    : false;

const expectedMoveColor = (moves) => ((moves ? moves.split(';').length : 0) % 2) + 1;

const movesHavePrefix = (currentMoves, nextMoves) => {
  if (!currentMoves) return true;
  if (nextMoves == null) return true;
  if (!nextMoves) return false;

  const current = currentMoves.split(';');
  const next = nextMoves.split(';');

  return current.length <= next.length && current.every((move, index) => move === next[index]);
};

const resultMatchesFinalMove = (winner, moves, boardSize) => {
  if (winner === 4) return true;
  if (moves === '') {
    return winner !== 3;
  }

  const parsed = parseMovesText(moves, boardSize);

  if (!parsed || parsed.length === 0) {
    return false;
  }

  if (winner === 3) {
    return parsed.length === boardSize * boardSize;
  }

  return parsed[parsed.length - 1].c === winner;
};

const getGamesOrder = (sort, order) => {
  const ascending = order === 'asc';

  const direction = ascending ? 'ASC' : 'DESC';

  if (sort === 'moves') {
    return ascending ? 'min_moves ASC, max_id DESC' : 'max_moves DESC, max_id DESC';
  }

  if (sort === 'time') {
    return `latest_ts ${direction}, max_id DESC`;
  }

  if (sort === 'status') {
    return ascending
      ? 'live_count ASC, hero_wins ASC, max_id DESC'
      : 'live_count DESC, hero_wins DESC, max_id DESC';
  }

  if (sort === 'duration') {
    return ascending ? 'duration ASC, max_id DESC' : 'duration DESC, max_id DESC';
  }

  return `max_id ${direction}`;
};

const parseGamesCursor = (value, sort) => {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return false;
  }

  let cursor;

  try {
    cursor = JSON.parse(value);
  } catch {
    return false;
  }

  if (!isPlainObject(cursor) || !validInteger(cursor.id, 1)) {
    return false;
  }

  if (sort === 'id') {
    return {
      id: cursor.id
    };
  }

  if (sort === 'time') {
    if (!validString(cursor.value)) {
      return false;
    }

    return {
      id: cursor.id,
      value: cursor.value
    };
  }

  if (!validInteger(cursor.value, 0)) {
    return false;
  }

  if (sort === 'status') {
    if (!validInteger(cursor.secondary, 0)) {
      return false;
    }

    return {
      id: cursor.id,
      value: cursor.value,
      secondary: cursor.secondary
    };
  }

  return {
    id: cursor.id,
    value: cursor.value
  };
};

const getGamesCursorClause = (sort, order, cursor) => {
  if (!cursor) return '';

  if (sort === 'id') {
    return order === 'asc' ? 'WHERE max_id > @cursorId' : 'WHERE max_id < @cursorId';
  }

  const comparison = order === 'asc' ? '>' : '<';

  if (sort === 'status') {
    return `
      WHERE (
        live_count ${comparison} @cursorValue
        OR (
          live_count = @cursorValue
          AND hero_wins ${comparison} @cursorSecondary
        )
        OR (
          live_count = @cursorValue
          AND hero_wins = @cursorSecondary
          AND max_id < @cursorId
        )
      )
    `;
  }

  const field =
    sort === 'moves'
      ? order === 'asc'
        ? 'min_moves'
        : 'max_moves'
      : sort === 'time'
        ? 'latest_ts'
        : 'duration';

  return `
    WHERE (
      ${field} ${comparison} @cursorValue
      OR (
        ${field} = @cursorValue
        AND max_id < @cursorId
      )
    )
  `;
};

const createRoutes = (apiKey) => {
  const router = express.Router();

  const auth = (req, res, next) => {
    if (req.headers['x-api-key'] !== apiKey) {
      return res.sendStatus(403);
    }

    next();
  };

  router.get('/events', (req, res) => sse.addClient(req, res));

  router.get('/latest-game', (req, res) => {
    const row = repo.getLatestGame();

    res.json({
      id: row?.id ?? null
    });
  });

  router.post('/batch', auth, (req, res) => {
    const events = req.body;

    if (!Array.isArray(events)) {
      return res.sendStatus(400);
    }

    const broadcasts = [];
    const batchState = new Map();

    const getGameState = (externalId) => {
      if (batchState.has(externalId)) {
        return batchState.get(externalId);
      }

      const game = repo.getGameByExt(externalId);

      if (!game) return null;

      const state = {
        ...game,
        modified: false
      };

      batchState.set(externalId, state);

      return state;
    };

    const transaction = db.transaction(() => {
      for (const event of events) {
        if (!isPlainObject(event) || typeof event.type !== 'string') {
          continue;
        }

        const externalId = getExternalId(event);

        if (['start', 'move', 'result'].includes(event.type) && !externalId) {
          continue;
        }

        if (event.type === 'run_start') {
          const runId = getRunId(event);

          const slots = getEventSlots(event);

          if (!runId || !slots || !validRunStart(event)) {
            continue;
          }

          if (!repo.getRunById(runId)) {
            repo.insertRun(buildRunRecord(runId, event));
          }

          for (const slot of slots) {
            repo.insertRunSlot({
              run_id: runId,
              ...slot
            });
          }

          broadcasts.push({
            type: 'run_start',
            run: repo.getRunById(runId)
          });

          continue;
        }

        if (event.type === 'run_update') {
          const runId = getRunId(event);

          const existing = runId ? repo.getRunById(runId) : null;

          if (!existing || !validRunUpdate(event)) {
            continue;
          }

          repo.updateRun({
            id: runId,
            status: nextStatus(existing.status, event.status),
            games_played: integerOr(event.games_played, existing.games_played),
            wins: integerOr(event.wins, existing.wins),
            losses: integerOr(event.losses, existing.losses),
            draws: integerOr(event.draws, existing.draws),
            wall_time_ms: integerOr(event.wall_time_ms, existing.wall_time_ms),
            p1_elo: finiteOr(event.p1_elo, existing.p1_elo),
            p1_erf: finiteOr(event.p1_erf, existing.p1_erf),
            p1_time: integerOr(event.p1_time, existing.p1_total_time_ms),
            p1_cpu_time: integerOr(event.p1_cpu_time, existing.p1_cpu_time_ms),
            p1_cpu_wall_time: integerOr(event.p1_cpu_wall_time, existing.p1_cpu_wall_time_ms),
            p1_crashes: integerOr(event.p1_crashes, existing.p1_crashes),
            p1_cma: finiteOr(event.p1_cma, existing.p1_cma),
            p1_blunder: finiteOr(event.p1_blunder, existing.p1_blunder),
            p1_moves_analyzed: integerOr(event.p1_moves_analyzed, existing.p1_moves_analyzed),
            p1_critical_total: integerOr(event.p1_critical_total, existing.p1_critical_total),
            p2_elo: finiteOr(event.p2_elo, existing.p2_elo),
            p2_erf: finiteOr(event.p2_erf, existing.p2_erf),
            p2_time: integerOr(event.p2_time, existing.p2_total_time_ms),
            p2_cpu_time: integerOr(event.p2_cpu_time, existing.p2_cpu_time_ms),
            p2_cpu_wall_time: integerOr(event.p2_cpu_wall_time, existing.p2_cpu_wall_time_ms),
            p2_crashes: integerOr(event.p2_crashes, existing.p2_crashes),
            p2_cma: finiteOr(event.p2_cma, existing.p2_cma),
            p2_blunder: finiteOr(event.p2_blunder, existing.p2_blunder),
            p2_moves_analyzed: integerOr(event.p2_moves_analyzed, existing.p2_moves_analyzed),
            p2_critical_total: integerOr(event.p2_critical_total, existing.p2_critical_total)
          });

          broadcasts.push({
            type: 'run_update',
            run: repo.getRunById(runId)
          });

          continue;
        }

        if (event.type === 'start') {
          const { runId, groupId } = getGameIds(event);

          const run = runId ? repo.getRunById(runId) : null;

          if (!run) continue;

          const existing = repo.getGameByExt(externalId);

          if (existing) {
            if (!batchState.has(externalId)) {
              batchState.set(externalId, {
                ...existing,
                modified: false
              });
            }

            continue;
          }

          if (
            !validGameSlots(event.black_slot, event.white_slot) ||
            !validOpeningLength(event.op_len, run.board_size)
          ) {
            continue;
          }

          const info = repo.insertGame({
            external_id: externalId,
            group_id: groupId,
            run_id: runId,
            black_slot: event.black_slot,
            white_slot: event.white_slot,
            opening_len: event.op_len ?? 0
          });

          const game = repo.getGameDetails(info.lastInsertRowid);

          if (!game) continue;

          batchState.set(externalId, {
            ...game,
            modified: false
          });

          broadcasts.push({
            type: 'game_start',
            game
          });

          continue;
        }

        if (event.type === 'move') {
          const runId = getRunId(event);

          const state = getGameState(externalId);

          if (
            !state ||
            !runId ||
            String(state.run_id) !== String(runId) ||
            state.winner_color !== 0
          ) {
            continue;
          }

          const run = repo.getRunById(state.run_id);

          if (
            !run ||
            !validMoveEvent(event, run.board_size) ||
            hasOccupiedMove(state.moves, event.x, event.y) ||
            event.c !== expectedMoveColor(state.moves)
          ) {
            continue;
          }

          const move = `${event.x},${event.y},${event.c}`;

          const moveCount = state.moves ? state.moves.split(';').length : 0;

          state.moves = state.moves ? `${state.moves};${move}` : move;

          state.modified = true;

          broadcasts.push({
            type: 'game_move',
            id: state.id,
            group_id: state.group_id,
            run_id: state.run_id,
            moves: state.moves,
            move_count: moveCount + 1
          });

          continue;
        }

        if (event.type === 'result') {
          const runId = getRunId(event);

          const state = getGameState(externalId);

          if (!state || !runId || String(state.run_id) !== String(runId)) {
            continue;
          }

          const run = repo.getRunById(state.run_id);

          if (
            !run ||
            state.winner_color !== 0 ||
            !validInteger(event.winner, 1, 4) ||
            !validOptionalInteger(event.duration, 0) ||
            typeof event.moves !== 'string' ||
            parseMovesText(event.moves, run.board_size) === null ||
            !movesHavePrefix(state.moves, event.moves) ||
            !resultMatchesFinalMove(event.winner, event.moves, run.board_size)
          ) {
            continue;
          }

          state.winner_color = event.winner;

          const currentCount = state.moves ? state.moves.split(';').length : 0;

          const nextCount = event.moves ? event.moves.split(';').length : 0;

          if (nextCount >= currentCount) {
            state.moves = event.moves;
          }

          if (event.duration != null) {
            state.duration = event.duration;
          }

          state.modified = true;

          broadcasts.push({
            type: 'game_result',
            id: state.id,
            external_id: externalId,
            run_id: state.run_id,
            winner_color: state.winner_color,
            moves: state.moves,
            move_count: state.moves ? state.moves.split(';').length : 0,
            black_slot: state.black_slot,
            white_slot: state.white_slot,
            group_id: state.group_id,
            duration: state.duration
          });
        }
      }

      for (const state of batchState.values()) {
        if (!state.modified) {
          continue;
        }

        repo.updateGameFull({
          moves: state.moves,
          winner: state.winner_color,
          duration: state.duration,
          id: state.id
        });
      }
    });

    transaction();

    for (const message of broadcasts) {
      sse.broadcast(message);
    }

    res.json({
      success: true
    });
  });

  router.delete('/reset', auth, (req, res) => {
    db.getDb().exec('DELETE FROM games; DELETE FROM runs;');

    const resetEvent = sse.reset();

    res.setHeader('X-Arena-Generation', resetEvent.generation);

    res.json({
      success: true
    });
  });

  router.get('/runs', (req, res) => {
    res.json(repo.getAllRuns());
  });

  router.get('/matchups', (req, res) => {
    const limit = parseQueryInteger(req.query.limit, 20, 1, 100);

    const offset = parseQueryInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    if (limit === null || offset === null) {
      return res.status(400).json({
        error: 'invalid pagination'
      });
    }

    const result = repo.getRunsForMatchups(limit, offset).map((row) => {
      const {
        runId,
        slot1_name: slot1Name,
        slot1_version: slot1Version,
        slot1_cmd: slot1Cmd,
        slot2_name: slot2Name,
        slot2_version: slot2Version,
        slot2_cmd: slot2Cmd,
        live_count: liveCount,
        ...run
      } = row;

      return {
        runId,
        status: run.status,
        hero: {
          id: `${runId}:1`,
          slot: 1,
          name: slot1Name,
          version: slot1Version,
          cmd: slot1Cmd
        },
        villain: {
          id: `${runId}:2`,
          slot: 2,
          name: slot2Name,
          version: slot2Version,
          cmd: slot2Cmd
        },
        heroWins: run.wins,
        villainWins: run.losses,
        draws: run.draws,
        total: run.games_played,
        lastActivity: run.updated_at,
        live_count: liveCount,
        run: {
          ...run,
          id: runId,
          slot1_name: slot1Name,
          slot1_version: slot1Version,
          slot1_cmd: slot1Cmd,
          slot2_name: slot2Name,
          slot2_version: slot2Version,
          slot2_cmd: slot2Cmd
        }
      };
    });

    res.json(result);
  });

  router.get('/games', (req, res) => {
    const { run_id: runId, hero_slot: heroSlot } = req.query;

    if (!validString(runId) || (heroSlot !== '1' && heroSlot !== '2')) {
      return res.status(400).json({
        error: 'run_id and hero_slot are required'
      });
    }

    const limit = parseQueryInteger(req.query.limit, 50, 1, 100);

    const offset = parseQueryInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const sort = req.query.sort ?? 'id';

    const order = req.query.order ?? 'desc';

    const cursor =
      typeof sort === 'string' && MATCHUP_SORTS.has(sort)
        ? parseGamesCursor(req.query.cursor, sort)
        : false;

    if (
      limit === null ||
      offset === null ||
      cursor === false ||
      (cursor && offset !== 0) ||
      typeof sort !== 'string' ||
      !MATCHUP_SORTS.has(sort) ||
      typeof order !== 'string' ||
      !ORDERS.has(order)
    ) {
      return res.status(400).json({
        error: 'invalid games query'
      });
    }

    try {
      const rows = repo.getGamesDynamic({
        runId: runId.trim(),
        heroSlot: Number(heroSlot),
        limit,
        offset,
        cursor,
        cursorClause: getGamesCursorClause(sort, order, cursor),
        orderBy: getGamesOrder(sort, order)
      });

      res.json(
        rows.map((row) => ({
          ...row,
          games: JSON.parse(row.games_json)
        }))
      );
    } catch (error) {
      console.error('Games query failed:', error.message);

      res.status(500).json({
        error: 'failed to query games'
      });
    }
  });

  router.get('/game/:id', (req, res) => {
    const requestedGeneration = req.query.g;

    if (requestedGeneration !== undefined) {
      if (typeof requestedGeneration !== 'string' || requestedGeneration.length === 0) {
        return res.status(400).json({
          error: 'invalid viewer generation'
        });
      }

      if (requestedGeneration !== db.getGeneration()) {
        return res.status(409).json({
          error: 'stale viewer generation'
        });
      }
    }

    const id = parseQueryInteger(req.params.id, null, 1, Number.MAX_SAFE_INTEGER);

    if (id === null) {
      return res.status(400).json({
        error: 'invalid game id'
      });
    }

    const game = repo.getGameDetails(id);

    if (!game) {
      return res.sendStatus(404);
    }

    res.json(game);
  });

  return router;
};

export default createRoutes;
