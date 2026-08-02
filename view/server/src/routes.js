import express from 'express';
import * as db from './db.js';
import * as repository from './repository.js';
import sse from './sse.js';
import { groupIdFromExternalId } from './utils.js';

const STATUSES = new Set(['live', 'ended', 'stopped']);
const RESULT_REASONS = new Set(['line', 'draw', 'adjudication', 'void']);
const GAME_SORTS = new Set(['id', 'moves', 'duration', 'result']);
const ORDERS = new Set(['asc', 'desc']);

const RUN_START_FIELDS = new Set([
  'type',
  'run_id',
  'status',
  'analysis_enabled',
  'slots',
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
]);

const SLOT_FIELDS = new Set(['slot', 'name', 'version', 'cmd']);

const START_FIELDS = new Set([
  'type',
  'external_id',
  'run_id',
  'black_slot',
  'white_slot',
  'op_len'
]);

const MOVE_FIELDS = new Set(['type', 'external_id', 'run_id', 'x', 'y', 'c']);

const RESULT_FIELDS = new Set([
  'type',
  'external_id',
  'run_id',
  'winner',
  'reason',
  'moves',
  'op_len',
  'duration'
]);

const GAME_QUERY_FIELDS = new Set([
  'run_id',
  'limit',
  'offset',
  'sort',
  'order',
  'cursor'
]);

const RUN_UPDATE_VALUES = [
  ['games_played', 'games_played', 'integer'],
  ['wins', 'wins', 'integer'],
  ['losses', 'losses', 'integer'],
  ['draws', 'draws', 'integer'],
  ['wall_time_ms', 'wall_time_ms', 'integer'],
  ['p1_elo', 'p1_elo', 'finite'],
  ['p1_erf', 'p1_erf', 'finite'],
  ['p1_time', 'p1_total_time_ms', 'integer'],
  ['p1_cpu_time', 'p1_cpu_time_ms', 'integer'],
  ['p1_cpu_wall_time', 'p1_cpu_wall_time_ms', 'integer'],
  ['p1_crashes', 'p1_crashes', 'integer'],
  ['p1_cma', 'p1_cma', 'finite'],
  ['p1_blunder', 'p1_blunder', 'finite'],
  ['p1_moves_analyzed', 'p1_moves_analyzed', 'integer'],
  ['p1_critical_total', 'p1_critical_total', 'integer'],
  ['p2_elo', 'p2_elo', 'finite'],
  ['p2_erf', 'p2_erf', 'finite'],
  ['p2_time', 'p2_total_time_ms', 'integer'],
  ['p2_cpu_time', 'p2_cpu_time_ms', 'integer'],
  ['p2_cpu_wall_time', 'p2_cpu_wall_time_ms', 'integer'],
  ['p2_crashes', 'p2_crashes', 'integer'],
  ['p2_cma', 'p2_cma', 'finite'],
  ['p2_blunder', 'p2_blunder', 'finite'],
  ['p2_moves_analyzed', 'p2_moves_analyzed', 'integer'],
  ['p2_critical_total', 'p2_critical_total', 'integer']
];

const RUN_UPDATE_FIELDS = new Set([
  'type',
  'run_id',
  'status',
  ...RUN_UPDATE_VALUES.map(([field]) => field)
]);

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
];

class ProtocolError extends Error {}

const reject = (message) => {
  throw new ProtocolError(message);
};

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const onlyFields = (value, allowed) =>
  isObject(value) && Object.keys(value).every((field) => allowed.has(field));

const validString = (value) => typeof value === 'string' && value.trim().length > 0;
const validOptionalString = (value) => value === undefined || typeof value === 'string';
const validFinite = (value) => typeof value === 'number' && Number.isFinite(value);

const validInteger = (value, minimum, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;

const validOptionalInteger = (value, minimum, maximum = Number.MAX_SAFE_INTEGER) =>
  value === undefined || validInteger(value, minimum, maximum);

const validNullableInteger = (value, minimum, maximum = Number.MAX_SAFE_INTEGER) =>
  value === undefined || value === null || validInteger(value, minimum, maximum);

const validOptionalFinite = (value) => value === undefined || validFinite(value);

const normalizeVersion = (version) => {
  const value = typeof version === 'string' ? version.trim() : '';
  return value || 'unknown';
};

const valueOr = (value, fallback) => (value === undefined ? fallback : value);

const nextStatus = (current, incoming) =>
  current === 'live' ? (incoming ?? current) : current;

const sameValue = (first, second) =>
  first === second || (first == null && second == null);

const parseQueryInteger = (value, fallback, minimum, maximum) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return validInteger(parsed, minimum, maximum) ? parsed : null;
};

const eventRunId = (event) => (validString(event.run_id) ? event.run_id.trim() : null);

const eventExternalId = (event) =>
  validString(event.external_id) ? event.external_id.trim() : null;

const eventGameIds = (event) => {
  const externalId = eventExternalId(event);

  return {
    runId: eventRunId(event),
    externalId,
    groupId: externalId ? groupIdFromExternalId(externalId) : null
  };
};

const eventSlots = (event) => {
  if (!Array.isArray(event.slots) || event.slots.length !== 2) return null;

  const slots = event.slots.map((slot) => {
    if (
      !onlyFields(slot, SLOT_FIELDS) ||
      !validInteger(slot.slot, 1, 2) ||
      !validString(slot.name) ||
      !validOptionalString(slot.version) ||
      !validOptionalString(slot.cmd)
    ) {
      return null;
    }

    return {
      slot: slot.slot,
      name: slot.name.trim(),
      version: normalizeVersion(slot.version),
      cmd: slot.cmd ?? null
    };
  });

  if (
    slots.some((slot) => !slot) ||
    new Set(slots.map((slot) => slot.slot)).size !== 2
  ) {
    return null;
  }

  return slots.sort((first, second) => first.slot - second.slot);
};

const validRunStart = (event) =>
  onlyFields(event, RUN_START_FIELDS) &&
  event.status === 'live' &&
  typeof event.analysis_enabled === 'boolean' &&
  validOptionalInteger(event.total_games, 0) &&
  validOptionalInteger(event.p1_nodes, 0) &&
  validOptionalInteger(event.p2_nodes, 0) &&
  validOptionalInteger(event.eval_nodes, 0) &&
  (event.board_size === undefined || validInteger(event.board_size, 5, 40)) &&
  validOptionalInteger(event.min_pairs, 0) &&
  validOptionalInteger(event.max_pairs, 0) &&
  validOptionalInteger(event.repeat_index, 0) &&
  validNullableInteger(event.seed, 0) &&
  (event.config_label === undefined || typeof event.config_label === 'string');

const validRunUpdate = (event) =>
  onlyFields(event, RUN_UPDATE_FIELDS) &&
  (event.status === undefined || STATUSES.has(event.status)) &&
  RUN_UPDATE_VALUES.every(([field, _stored, type]) =>
    type === 'integer'
      ? validOptionalInteger(event[field], 0)
      : validOptionalFinite(event[field])
  );

const runRecord = (id, event) => ({
  id,
  config_label: event.config_label ?? 'live',
  status: 'live',
  analysis_enabled: event.analysis_enabled ? 1 : 0,
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

const sameRunDeclaration = (existing, event, slots) => {
  const expected = runRecord(existing.id, event);

  return (
    existing.config_label === expected.config_label &&
    Boolean(existing.analysis_enabled) === event.analysis_enabled &&
    existing.total_games === expected.total_games &&
    existing.p1_nodes === expected.p1_nodes &&
    existing.p2_nodes === expected.p2_nodes &&
    existing.eval_nodes === expected.eval_nodes &&
    existing.board_size === expected.board_size &&
    existing.min_pairs === expected.min_pairs &&
    existing.max_pairs === expected.max_pairs &&
    existing.repeat_index === expected.repeat_index &&
    sameValue(existing.seed, expected.seed) &&
    existing.slot1_name === slots[0].name &&
    existing.slot1_version === slots[0].version &&
    sameValue(existing.slot1_cmd, slots[0].cmd) &&
    existing.slot2_name === slots[1].name &&
    existing.slot2_version === slots[1].version &&
    sameValue(existing.slot2_cmd, slots[1].cmd)
  );
};

const runUpdateRecord = (id, event, existing) => {
  const record = {
    id,
    status: nextStatus(existing.status, event.status)
  };

  for (const [field, stored] of RUN_UPDATE_VALUES) {
    record[field] = valueOr(event[field], existing[stored]);
  }

  return record;
};

const validGameSlots = (black, white) =>
  validInteger(black, 1, 2) && validInteger(white, 1, 2) && black !== white;

const validOpeningLength = (value, boardSize) =>
  value === undefined || validInteger(value, 0, boardSize * boardSize);

const validMove = (event, boardSize) =>
  onlyFields(event, MOVE_FIELDS) &&
  validInteger(event.x, 0, boardSize - 1) &&
  validInteger(event.y, 0, boardSize - 1) &&
  validInteger(event.c, 1, 2);

const parseMoves = (moves, boardSize) => {
  if (moves === '') return [];
  if (typeof moves !== 'string') return null;

  const occupied = new Set();
  const parsed = [];

  for (const [index, text] of moves.split(';').entries()) {
    if (!/^\d+,\d+,[12]$/.test(text)) return null;

    const [x, y, color] = text.split(',').map(Number);
    const key = `${x},${y}`;

    if (
      !validInteger(x, 0, boardSize - 1) ||
      !validInteger(y, 0, boardSize - 1) ||
      occupied.has(key) ||
      color !== (index % 2) + 1
    ) {
      return null;
    }

    occupied.add(key);
    parsed.push({ x, y, c: color });
  }

  return parsed;
};

const movesExtend = (currentMoves, nextMoves) => {
  if (!currentMoves) return true;
  if (!nextMoves) return false;

  const current = currentMoves.split(';');
  const next = nextMoves.split(';');

  return (
    current.length <= next.length &&
    current.every((move, index) => move === next[index])
  );
};

const lineLength = (board, x, y, color, dx, dy) => {
  let count = 1;

  for (const direction of [-1, 1]) {
    for (let distance = 1; ; distance += 1) {
      const nextX = x + dx * distance * direction;
      const nextY = y + dy * distance * direction;

      if (board.get(`${nextX},${nextY}`) !== color) break;

      count += 1;
    }
  }

  return count;
};

const winningAt = (board, move) =>
  DIRECTIONS.some(([dx, dy]) => lineLength(board, move.x, move.y, move.c, dx, dy) >= 5);

const firstWinningMove = (moves) => {
  const board = new Map();

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];

    board.set(`${move.x},${move.y}`, move.c);

    if (winningAt(board, move)) {
      return {
        index,
        color: move.c
      };
    }
  }

  return null;
};

const validResultSequence = (winner, reason, moves, boardSize) => {
  if (!RESULT_REASONS.has(reason)) return null;

  const parsed = parseMoves(moves, boardSize);

  if (!parsed) return null;

  const firstWinner = firstWinningMove(parsed);

  if (reason === 'line') {
    return (winner === 1 || winner === 2) &&
      firstWinner?.color === winner &&
      firstWinner.index === parsed.length - 1
      ? parsed
      : null;
  }

  if (firstWinner) return null;

  if (reason === 'draw') {
    return winner === 3 && parsed.length === boardSize * boardSize ? parsed : null;
  }

  if (reason === 'adjudication') {
    return winner === 1 || winner === 2 ? parsed : null;
  }

  return winner === 4 ? parsed : null;
};

const storedResultReason = (game, boardSize) => {
  if (game.winner_color === 4) return 'void';
  if (game.winner_color === 3) return 'draw';

  const parsed = parseMoves(game.moves, boardSize);

  if (!parsed) return null;

  const firstWinner = firstWinningMove(parsed);

  return firstWinner?.color === game.winner_color &&
    firstWinner.index === parsed.length - 1
    ? 'line'
    : 'adjudication';
};

const gameOrder = (sort, order) => {
  const ascending = order === 'asc';
  const direction = ascending ? 'ASC' : 'DESC';

  if (sort === 'moves') {
    return ascending ? 'min_moves ASC, max_id DESC' : 'max_moves DESC, max_id DESC';
  }

  if (sort === 'duration') {
    return ascending ? 'duration ASC, max_id DESC' : 'duration DESC, max_id DESC';
  }

  if (sort === 'result') {
    return ascending
      ? 'live_count ASC, slot1_wins ASC, max_id DESC'
      : 'live_count DESC, slot1_wins DESC, max_id DESC';
  }

  return `max_id ${direction}`;
};

const parseCursor = (value, sort) => {
  if (value === undefined) return null;
  if (typeof value !== 'string') return false;

  let cursor;

  try {
    cursor = JSON.parse(value);
  } catch {
    return false;
  }

  if (!isObject(cursor) || !validInteger(cursor.id, 1)) return false;
  if (sort === 'id') return { id: cursor.id };
  if (!validInteger(cursor.value, 0)) return false;

  if (sort === 'result') {
    if (!validInteger(cursor.secondary, 0)) return false;

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

const cursorClause = (sort, order, cursor) => {
  if (!cursor) return '';

  if (sort === 'id') {
    return order === 'asc' ? 'WHERE max_id > @cursorId' : 'WHERE max_id < @cursorId';
  }

  const comparison = order === 'asc' ? '>' : '<';

  if (sort === 'result') {
    return `
      WHERE (
        live_count ${comparison} @cursorValue
        OR (
          live_count = @cursorValue
          AND slot1_wins ${comparison} @cursorSecondary
        )
        OR (
          live_count = @cursorValue
          AND slot1_wins = @cursorSecondary
          AND max_id < @cursorId
        )
      )
    `;
  }

  const field =
    sort === 'moves' ? (order === 'asc' ? 'min_moves' : 'max_moves') : 'duration';

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

const pairResponse = (row) => {
  if (!row) return null;

  const { games_json: gamesJson, ...pair } = row;
  const games = JSON.parse(gamesJson || '[]').sort((first, second) => {
    const firstSide = first.black_slot === 1 ? 0 : 1;
    const secondSide = second.black_slot === 1 ? 0 : 1;

    return firstSide - secondSide || first.id - second.id;
  });

  return {
    ...pair,
    games
  };
};

const matchupResponse = (row) => {
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
};

const persistGame = (game) =>
  repository.updateGameFull({
    id: game.id,
    moves: game.moves,
    winner: game.winner_color,
    duration: game.duration
  });

const currentPair = (runId, groupId) => {
  const pair = pairResponse(repository.getPairSummary(runId, groupId));

  if (!pair) {
    throw new Error(`Pair ${groupId} was not persisted`);
  }

  return pair;
};

const sameGameDeclaration = (game, runId, groupId, event) =>
  String(game.run_id) === String(runId) &&
  game.group_id === groupId &&
  game.black_slot === event.black_slot &&
  game.white_slot === event.white_slot &&
  game.opening_len === (event.op_len ?? 0);

const createRoutes = (apiKey) => {
  const router = express.Router();

  const authenticate = (req, res, next) => {
    if (req.headers['x-api-key'] !== apiKey) {
      return res.sendStatus(403);
    }

    next();
  };

  router.get('/events', (req, res) => sse.addClient(req, res));

  router.get('/latest-game', (req, res) => {
    const row = repository.getLatestGame();

    res.json({
      id: row?.id ?? null
    });
  });

  router.post('/batch', authenticate, (req, res) => {
    const events = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({
        error: 'batch must be an array'
      });
    }

    const broadcasts = [];
    const apply = db.transaction(() => {
      for (const event of events) {
        if (!isObject(event) || typeof event.type !== 'string') {
          reject('invalid event');
        }

        if (event.type === 'run_start') {
          const runId = eventRunId(event);
          const slots = eventSlots(event);

          if (!runId || !slots || !validRunStart(event)) {
            reject('invalid run_start');
          }

          const existing = repository.getRunById(runId);

          if (existing) {
            if (!sameRunDeclaration(existing, event, slots)) {
              reject('conflicting run declaration');
            }

            continue;
          }

          repository.insertRun(runRecord(runId, event));

          for (const slot of slots) {
            repository.insertRunSlot({
              run_id: runId,
              ...slot
            });
          }

          broadcasts.push({
            type: 'run_start',
            run: repository.getRunById(runId)
          });
          continue;
        }

        if (event.type === 'run_update') {
          const runId = eventRunId(event);
          const existing = runId ? repository.getRunById(runId) : null;

          if (!existing || !validRunUpdate(event)) {
            reject('invalid run_update');
          }

          if (
            existing.status !== 'live' &&
            event.status !== undefined &&
            event.status !== existing.status
          ) {
            reject('terminal run status changed');
          }

          repository.updateRun(runUpdateRecord(runId, event, existing));

          broadcasts.push({
            type: 'run_update',
            run: repository.getRunById(runId)
          });
          continue;
        }

        const { runId, externalId, groupId } = eventGameIds(event);

        if (!runId || !externalId || !groupId) {
          reject('invalid game identity');
        }

        if (event.type === 'start') {
          if (!onlyFields(event, START_FIELDS)) {
            reject('invalid game start');
          }

          const run = repository.getRunById(runId);

          if (
            !run ||
            !validGameSlots(event.black_slot, event.white_slot) ||
            !validOpeningLength(event.op_len, run.board_size)
          ) {
            reject('invalid game start');
          }

          const existing = repository.getGameByExt(externalId);

          if (existing) {
            if (!sameGameDeclaration(existing, runId, groupId, event)) {
              reject('conflicting game start');
            }

            continue;
          }

          const info = repository.insertGame({
            external_id: externalId,
            group_id: groupId,
            run_id: runId,
            black_slot: event.black_slot,
            white_slot: event.white_slot,
            opening_len: event.op_len ?? 0
          });
          const game = repository.getGameDetails(info.lastInsertRowid);

          if (!game) {
            throw new Error('game start was not persisted');
          }

          broadcasts.push({
            type: 'game_start',
            game,
            pair: currentPair(runId, groupId)
          });
          continue;
        }

        const game = repository.getGameByExt(externalId);

        if (!game || String(game.run_id) !== String(runId)) {
          reject('game does not exist');
        }

        const run = repository.getRunById(game.run_id);

        if (!run) {
          reject('game run does not exist');
        }

        if (event.type === 'move') {
          if (!validMove(event, run.board_size)) {
            reject('invalid move');
          }

          const currentMoves = parseMoves(game.moves, run.board_size);

          if (!currentMoves) {
            throw new Error('stored game contains invalid moves');
          }

          const occupied = currentMoves.find(
            (move) => move.x === event.x && move.y === event.y
          );

          if (occupied) {
            if (occupied.c === event.c) {
              continue;
            }

            reject('move targets an occupied coordinate');
          }

          if (game.winner_color !== 0 || event.c !== (currentMoves.length % 2) + 1) {
            reject('move does not extend live game');
          }

          if (firstWinningMove(currentMoves)) {
            reject('move follows a terminal position');
          }

          const move = `${event.x},${event.y},${event.c}`;

          game.moves = game.moves ? `${game.moves};${move}` : move;

          persistGame(game);

          broadcasts.push({
            type: 'game_move',
            id: game.id,
            external_id: externalId,
            group_id: game.group_id,
            run_id: game.run_id,
            moves: game.moves,
            move_count: currentMoves.length + 1,
            pair: currentPair(game.run_id, game.group_id)
          });
          continue;
        }

        if (event.type === 'result') {
          if (
            !onlyFields(event, RESULT_FIELDS) ||
            !validInteger(event.winner, 1, 4) ||
            !validInteger(event.duration, 0) ||
            typeof event.moves !== 'string' ||
            typeof event.reason !== 'string' ||
            !validOpeningLength(event.op_len, run.board_size)
          ) {
            reject('invalid result');
          }

          if (event.op_len !== undefined && event.op_len !== game.opening_len) {
            reject('result opening length changed');
          }

          const parsed = validResultSequence(
            event.winner,
            event.reason,
            event.moves,
            run.board_size
          );

          if (!parsed) {
            reject('result does not match move sequence');
          }

          if (game.winner_color !== 0) {
            const existingReason = storedResultReason(game, run.board_size);

            if (
              game.winner_color !== event.winner ||
              game.moves !== event.moves ||
              game.duration !== event.duration ||
              existingReason !== event.reason
            ) {
              reject('conflicting game result');
            }

            continue;
          }

          if (!movesExtend(game.moves, event.moves)) {
            reject('result does not extend game');
          }

          game.winner_color = event.winner;
          game.moves = event.moves;
          game.duration = event.duration;

          persistGame(game);

          broadcasts.push({
            type: 'game_result',
            id: game.id,
            external_id: externalId,
            run_id: game.run_id,
            winner_color: game.winner_color,
            moves: game.moves,
            move_count: parsed.length,
            black_slot: game.black_slot,
            white_slot: game.white_slot,
            group_id: game.group_id,
            duration: game.duration,
            pair: currentPair(game.run_id, game.group_id)
          });
          continue;
        }

        reject(`unknown event type: ${event.type}`);
      }
    });

    try {
      apply();
    } catch (error) {
      if (error instanceof ProtocolError) {
        return res.status(422).json({
          error: error.message
        });
      }

      console.error('Batch transaction failed:', error.message);

      return res.status(500).json({
        error: 'batch transaction failed'
      });
    }

    for (const message of broadcasts) {
      sse.broadcast(message);
    }

    return res.json({
      success: true
    });
  });

  router.delete('/reset', authenticate, (req, res) => {
    db.reset();

    const event = sse.reset();

    res.setHeader('X-Arena-Generation', event.generation);
    res.json({
      success: true
    });
  });

  router.get('/runs', (req, res) => {
    res.json(repository.getAllRuns());
  });

  router.get('/matchups', (req, res) => {
    const limit = parseQueryInteger(req.query.limit, 20, 1, 100);
    const offset = parseQueryInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    if (limit === null || offset === null) {
      return res.status(400).json({
        error: 'invalid pagination'
      });
    }

    return res.json(repository.getRunsForMatchups(limit, offset).map(matchupResponse));
  });

  router.get('/games', (req, res) => {
    const runId = req.query.run_id;

    if (
      !Object.keys(req.query).every((field) => GAME_QUERY_FIELDS.has(field)) ||
      !validString(runId)
    ) {
      return res.status(400).json({
        error: 'run_id is required'
      });
    }

    const limit = parseQueryInteger(req.query.limit, 50, 1, 100);
    const offset = parseQueryInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const sort = req.query.sort ?? 'id';
    const order = req.query.order ?? 'desc';
    const cursor =
      typeof sort === 'string' && GAME_SORTS.has(sort)
        ? parseCursor(req.query.cursor, sort)
        : false;

    if (
      limit === null ||
      offset === null ||
      cursor === false ||
      (cursor && offset !== 0) ||
      typeof sort !== 'string' ||
      !GAME_SORTS.has(sort) ||
      typeof order !== 'string' ||
      !ORDERS.has(order)
    ) {
      return res.status(400).json({
        error: 'invalid games query'
      });
    }

    try {
      const rows = repository.getGamesDynamic({
        runId: runId.trim(),
        limit,
        offset,
        cursor,
        cursorClause: cursorClause(sort, order, cursor),
        orderBy: gameOrder(sort, order)
      });

      return res.json(rows.map(pairResponse));
    } catch (error) {
      console.error('Games query failed:', error.message);

      return res.status(500).json({
        error: 'failed to query games'
      });
    }
  });

  router.get('/game/:id', (req, res) => {
    if (Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'invalid game query'
      });
    }

    const id = parseQueryInteger(req.params.id, null, 1, Number.MAX_SAFE_INTEGER);

    if (id === null) {
      return res.status(400).json({
        error: 'invalid game id'
      });
    }

    const game = repository.getGameDetails(id);

    if (!game) {
      return res.sendStatus(404);
    }

    return res.json(game);
  });

  return router;
};

export default createRoutes;
