import express from 'express';
import * as db from './db.js';
import * as repo from './repository.js';
import sse from './sse.js';
import { API_KEY } from './config.js';
import { compareHeroOrder, groupIdFromExternalId } from './utils.js';

const router = express.Router();

const auth = (req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.sendStatus(403);
  next();
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const validString = (value) => typeof value === 'string' && value.trim().length > 0;
const validOptionalString = (value) => value == null || typeof value === 'string';
const normalizeString = (value) => value.trim();

const normalizeVersion = (version) => {
  const value = version == null ? '' : version.trim();
  return value || 'unknown';
};

const validInteger = (value, min, max) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const validFinite = (value) => typeof value === 'number' && Number.isFinite(value);
const validOptionalInteger = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  value === undefined || value === null || validInteger(value, min, max);
const validOptionalFinite = (value) => value === undefined || value === null || validFinite(value);
const validOptionalBoolean = (value) => value === undefined || typeof value === 'boolean';

const validBoardSize = (value) => value === undefined || validInteger(value, 5, 40);
const normalizeBoardSize = (value) => value === undefined ? 20 : value;

const getEventSlots = (e) => {
  if (!Array.isArray(e.slots) || e.slots.length !== 2) return null;
  if (!e.slots.every((slot) =>
    isPlainObject(slot) &&
    (slot.slot === 1 || slot.slot === 2) &&
    validString(slot.name) &&
    validOptionalString(slot.version) &&
    validOptionalString(slot.cmd) &&
    validOptionalInteger(slot.mtime, 0)
  )) return null;

  const normalized = e.slots.map((slot) => ({
    slot: slot.slot,
    name: slot.name.trim(),
    version: normalizeVersion(slot.version),
    cmd: slot.cmd ?? null,
    mtime: slot.mtime ?? null
  }));
  if (new Set(normalized.map((slot) => slot.slot)).size !== 2) return null;
  return normalized.sort((a, b) => a.slot - b.slot);
};

const integerOr = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  value === undefined ? fallback : validInteger(value, min, max) ? value : fallback;
const finiteOr = (value, fallback) =>
  value === undefined ? fallback : validFinite(value) ? value : fallback;
const booleanFlagOr = (value, fallback) =>
  value === undefined ? fallback : value === true ? 1 : value === false ? 0 : fallback;

const validOptionalSafeInteger = (value, min = 0) =>
  value === undefined || value === null || (Number.isSafeInteger(value) && value >= min);

const safeIntegerOr = (value, fallback) =>
  Number.isSafeInteger(value) && value >= 0 ? value : fallback;

const validRunStart = (e) =>
  validOptionalInteger(e.total_games, 0) &&
  validOptionalSafeInteger(e.p1_nodes) &&
  validOptionalSafeInteger(e.p2_nodes) &&
  validOptionalSafeInteger(e.eval_nodes) &&
  validBoardSize(e.board_size) &&
  validOptionalInteger(e.min_pairs, 0) &&
  validOptionalInteger(e.max_pairs, 0) &&
  validOptionalInteger(e.repeat_index, 0) &&
  validOptionalSafeInteger(e.seed) &&
  (e.config_label === undefined || typeof e.config_label === 'string');

const validRunUpdate = (e) =>
  validOptionalInteger(e.games_played, 0) &&
  validOptionalInteger(e.wins, 0) &&
  validOptionalInteger(e.losses, 0) &&
  validOptionalInteger(e.draws, 0) &&
  validOptionalInteger(e.wall_time_ms, 0) &&
  validOptionalFinite(e.p1_elo) && validOptionalFinite(e.p2_elo) &&
  validOptionalFinite(e.p1_erf) && validOptionalFinite(e.p2_erf) &&
  validOptionalInteger(e.p1_time, 0) && validOptionalInteger(e.p2_time, 0) &&
  validOptionalInteger(e.p1_crashes, 0) && validOptionalInteger(e.p2_crashes, 0) &&
  validOptionalFinite(e.p1_cma) && validOptionalFinite(e.p2_cma) &&
  validOptionalFinite(e.p1_blunder) && validOptionalFinite(e.p2_blunder) &&
  validOptionalBoolean(e.is_done) && validOptionalBoolean(e.timed_out);

const buildRunRecord = (id, e) => ({
  id,
  config_label: e.config_label ?? 'live',
  total_games: e.total_games ?? 0,
  p1_nodes: e.p1_nodes ?? 0,
  p2_nodes: e.p2_nodes ?? 0,
  eval_nodes: e.eval_nodes ?? 0,
  board_size: normalizeBoardSize(e.board_size),
  min_pairs: e.min_pairs ?? 0,
  max_pairs: e.max_pairs ?? 0,
  repeat_index: e.repeat_index ?? 0,
  seed: e.seed ?? null
});

const getRunStartId = (e) => validString(e.run_id) ? normalizeString(e.run_id) : null;
const getRunUpdateId = (e) => validString(e.run_id) ? normalizeString(e.run_id) : null;

const getExternalId = (e) => validString(e.external_id) ? normalizeString(e.external_id) : null;

const getGameIds = (e) => {
  const externalId = getExternalId(e);
  return {
    runId: validString(e.run_id) ? normalizeString(e.run_id) : null,
    externalId,
    groupId: externalId ? groupIdFromExternalId(externalId) : null
  };
};

const validGameSlots = (blackSlot, whiteSlot) =>
  (blackSlot === 1 || blackSlot === 2) && (whiteSlot === 1 || whiteSlot === 2) && blackSlot !== whiteSlot;

const validOpeningLen = (value, boardSize) =>
  value === undefined || validInteger(value, 0, boardSize * boardSize);
const normalizeOpeningLen = (value) => value === undefined ? 0 : value;

const validMoveEvent = (e, boardSize) =>
  validInteger(e.x, 0, boardSize - 1) &&
  validInteger(e.y, 0, boardSize - 1) &&
  validInteger(e.c, 1, 2);

const parseMovesText = (moves, boardSize) => {
  if (moves == null || moves === '') return [];
  if (typeof moves !== 'string') return null;

  const occupied = new Set();
  const parsed = [];
  const tokens = moves.split(';');
  for (let i = 0; i < tokens.length; i += 1) {
    const move = tokens[i];
    if (!/^\d+,\d+,[12]$/.test(move)) return null;
    const [x, y, c] = move.split(',').map(Number);
    const key = `${x},${y}`;
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize || occupied.has(key) || c !== (i % 2) + 1) return null;
    occupied.add(key);
    parsed.push({ x, y, c });
  }
  return parsed;
};

const validMovesText = (moves, boardSize) => parseMovesText(moves, boardSize) !== null;
const validResultMovesText = (moves, boardSize) => typeof moves === 'string' && validMovesText(moves, boardSize);

const hasOccupiedMove = (moves, x, y) => {
  if (!moves) return false;
  return moves.split(';').some((move) => {
    const [mx, my] = move.split(',').map(Number);
    return mx === x && my === y;
  });
};

const expectedMoveColor = (moves) => (moves ? moves.split(';').length : 0) % 2 + 1;

const movesHavePrefix = (currentMoves, nextMoves) => {
  if (!currentMoves) return true;
  if (nextMoves == null) return true;
  if (!nextMoves) return false;
  const current = currentMoves.split(';');
  const next = nextMoves.split(';');
  return current.length <= next.length && current.every((move, index) => move === next[index]);
};

const validResultWinner = (winner) => validInteger(winner, 1, 4);
const resultMatchesFinalMove = (winner, moves, boardSize) => {
  if (winner === 4) return true;
  if (moves === '') return winner !== 3;
  const parsed = parseMovesText(moves, boardSize);
  if (!parsed || parsed.length === 0) return false;
  if (winner === 3) return parsed.length === boardSize * boardSize;
  return parsed[parsed.length - 1].c === winner;
};
const validDuration = (duration) => duration == null || validInteger(duration, 0, Number.MAX_SAFE_INTEGER);

router.get('/events', (req, res) => sse.addClient(req, res));

router.get('/latest-game', (req, res) => {
  const row = repo.getLatestGame();
  res.json({ id: row?.id ?? null });
});

router.post('/batch', auth, (req, res) => {
  const events = req.body;
  if (!Array.isArray(events)) return res.sendStatus(400);

  const broadcasts = [];
  const pendingGameStarts = [];
  const batchState = new Map();

  const getGameState = (externalId) => {
    if (batchState.has(externalId)) return batchState.get(externalId);
    const game = repo.getGameByExt(externalId);
    if (!game) return null;
    const state = { ...game, modified: false };
    batchState.set(externalId, state);
    return state;
  };

  const tx = db.transaction(() => {
    for (const e of events) {
      if (!isPlainObject(e) || typeof e.type !== 'string') continue;
      const externalId = getExternalId(e);
      if ((e.type === 'start' || e.type === 'move' || e.type === 'result') && !externalId) continue;

      if (e.type === 'run_start') {
        const runId = getRunStartId(e);
        if (!runId) continue;

        const slots = getEventSlots(e);
        if (!slots || !validRunStart(e)) continue;

        if (!repo.getRunById(runId)) repo.insertRun(buildRunRecord(runId, e));
        for (const slot of slots) repo.insertRunSlot({ run_id: runId, ...slot });
        broadcasts.push({ type: 'run_start', run: repo.getRunById(runId) });
      } else if (e.type === 'run_update') {
        const runId = getRunUpdateId(e);
        if (!runId) continue;

        const existing = repo.getRunById(runId);
        if (!existing) continue;

        if (!validRunUpdate(e)) continue;

        repo.updateRun({
          id: runId,
          games_played: integerOr(e.games_played, existing.games_played ?? 0),
          wins: integerOr(e.wins, existing.wins ?? 0),
          losses: integerOr(e.losses, existing.losses ?? 0),
          draws: integerOr(e.draws, existing.draws ?? 0),
          wall_time_ms: integerOr(e.wall_time_ms, existing.wall_time_ms ?? 0),
          p1_elo: finiteOr(e.p1_elo, existing.p1_elo ?? 1000),
          p1_erf: finiteOr(e.p1_erf, existing.p1_erf ?? 0),
          p1_time: integerOr(e.p1_time, existing.p1_total_time_ms ?? 0),
          p1_crashes: integerOr(e.p1_crashes, existing.p1_crashes ?? 0),
          p1_cma: finiteOr(e.p1_cma, existing.p1_cma ?? 0),
          p1_blunder: finiteOr(e.p1_blunder, existing.p1_blunder ?? 0),
          p2_elo: finiteOr(e.p2_elo, existing.p2_elo ?? 1000),
          p2_erf: finiteOr(e.p2_erf, existing.p2_erf ?? 0),
          p2_time: integerOr(e.p2_time, existing.p2_total_time_ms ?? 0),
          p2_crashes: integerOr(e.p2_crashes, existing.p2_crashes ?? 0),
          p2_cma: finiteOr(e.p2_cma, existing.p2_cma ?? 0),
          p2_blunder: finiteOr(e.p2_blunder, existing.p2_blunder ?? 0),
          is_done: existing.is_done || booleanFlagOr(e.is_done, existing.is_done) ? 1 : 0,
          timed_out: existing.timed_out || booleanFlagOr(e.timed_out, existing.timed_out) ? 1 : 0
        });
        broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
      } else if (e.type === 'start') {
        const { runId, groupId } = getGameIds(e);
        const run = runId ? repo.getRunById(runId) : null;
        if (!run) continue;

        if (repo.getGameByExt(externalId)) {
          if (!batchState.has(externalId)) {
            const game = repo.getGameByExt(externalId);
            if (game) batchState.set(externalId, { ...game, modified: false });
          }
          continue;
        }

        const blackSlot = e.black_slot;
        const whiteSlot = e.white_slot;
        if (!validGameSlots(blackSlot, whiteSlot) || !validOpeningLen(e.op_len, run.board_size)) continue;

        const info = repo.insertGame({
          external_id: externalId,
          group_id: groupId,
          run_id: runId,
          black_slot: blackSlot,
          white_slot: whiteSlot,
          opening_len: normalizeOpeningLen(e.op_len)
        });

        const game = repo.getGameDetails(info.lastInsertRowid);
        if (!game) continue;
        batchState.set(externalId, { ...game, modified: false });
        pendingGameStarts.push(info.lastInsertRowid);
      } else if (e.type === 'move') {
        const runId = getRunUpdateId(e);
        const state = getGameState(externalId);
        if (!state || !runId || String(state.run_id) !== String(runId) || state.winner_color !== 0) continue;
        const run = repo.getRunById(state.run_id);
        if (!run || !validMoveEvent(e, run.board_size)) continue;

        if (hasOccupiedMove(state.moves, e.x, e.y) || e.c !== expectedMoveColor(state.moves)) continue;
        const move = `${e.x},${e.y},${e.c}`;
        const moves = state.moves ? state.moves.split(';') : [];
        if (!moves.includes(move)) {
          state.moves = state.moves ? `${state.moves};${move}` : move;
          state.modified = true;
          broadcasts.push({
            type: 'game_move',
            id: state.id,
            group_id: state.group_id,
            run_id: state.run_id,
            moves: state.moves,
            move_count: moves.length + 1
          });
        }
      } else if (e.type === 'result') {
        const runId = getRunUpdateId(e);
        const state = getGameState(externalId);
        if (!state || !runId || String(state.run_id) !== String(runId)) continue;
        const run = repo.getRunById(state.run_id);
        if (!run || state.winner_color !== 0 || !validResultWinner(e.winner) || !validDuration(e.duration) || !validResultMovesText(e.moves, run.board_size)) continue;
        if (!movesHavePrefix(state.moves, e.moves) || !resultMatchesFinalMove(e.winner, e.moves, run.board_size)) continue;

        state.winner_color = e.winner;
        if (e.moves != null) {
          const currentMoveCount = state.moves ? state.moves.split(';').length : 0;
          const nextMoveCount = e.moves ? e.moves.split(';').length : 0;
          if (nextMoveCount >= currentMoveCount) state.moves = e.moves;
        }
        if (e.duration != null) state.duration = e.duration;
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
      if (state.modified) {
        repo.updateGameFull({
          moves: state.moves,
          winner: state.winner_color,
          duration: state.duration,
          id: state.id
        });
      }
    }

    for (const id of pendingGameStarts) {
      const game = repo.getGameDetails(id);
      if (game) broadcasts.push({ type: 'game_start', game });
    }
  });

  tx();
  broadcasts.forEach((msg) => sse.broadcast(msg));
  res.json({ success: true });
});

router.delete('/reset', auth, (req, res) => {
  db.getDb().exec('DELETE FROM games; DELETE FROM runs;');
  sse.reset();
  res.json({ success: true });
});

router.get('/runs', (req, res) => res.json(repo.getAllRuns()));

router.get('/matchups', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const result = repo.getRunsForMatchups(limit, offset).map((r) => {
    const slot1 = { id: `${r.runId}:1`, slot: 1, name: r.slot1_name, version: r.slot1_version, cmd: r.slot1_cmd, mtime: r.slot1_mtime };
    const slot2 = { id: `${r.runId}:2`, slot: 2, name: r.slot2_name, version: r.slot2_version, cmd: r.slot2_cmd, mtime: r.slot2_mtime };
    const slot1IsHero = compareHeroOrder(slot1, slot2) >= 0;

    return {
      runId: r.runId,
      hero: slot1IsHero ? slot1 : slot2,
      villain: slot1IsHero ? slot2 : slot1,
      heroWins: slot1IsHero ? r.wins : r.losses,
      villainWins: slot1IsHero ? r.losses : r.wins,
      draws: r.draws,
      total: r.games_played,
      lastActivity: r.updated_at,
      live_count: r.live_count
    };
  });

  res.json(result);
});

router.get('/games', (req, res) => {
  const { run_id, hero_slot, sort, order, limit, offset } = req.query;
  const l = Math.min(parseInt(limit) || 50, 100);
  const o = parseInt(offset) || 0;
  const asc = order === 'asc';
  const dir = asc ? 'ASC' : 'DESC';

  let orderBy = 'max_id DESC';
  if (sort === 'moves') orderBy = asc ? 'min_moves ASC, max_id DESC' : 'max_moves DESC, max_id DESC';
  else if (sort === 'time') orderBy = `latest_ts ${dir}, max_id DESC`;
  else if (sort === 'status') orderBy = asc ? 'live_count ASC, hero_wins ASC, max_id DESC' : 'live_count DESC, hero_wins DESC, max_id DESC';
  else if (sort === 'duration') orderBy = asc ? 'duration ASC, max_id DESC' : 'duration DESC, max_id DESC';
  else if (sort === 'id') orderBy = `max_id ${dir}`;

  try {
    const rows = repo.getGamesDynamic({
      runId: run_id,
      heroSlot: parseInt(hero_slot) || 1,
      limit: l,
      offset: o,
      orderBy
    });
    res.json(rows.map((r) => ({ ...r, games: JSON.parse(r.games_json) })));
  } catch (err) {
    console.error('Games query failed:', err.message);
    res.status(500).json({ error: 'failed to query games' });
  }
});

router.get('/game/:id', (req, res) => {
  const game = repo.getGameDetails(req.params.id);
  if (!game) return res.sendStatus(404);
  res.json(game);
});

export default router;
