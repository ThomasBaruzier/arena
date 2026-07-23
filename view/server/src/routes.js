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

const getPlayerId = (name, version) => {
  repo.insertPlayer({ name, version });
  return repo.getPlayerId({ name, version }).id;
};

const getEventPlayers = (e) => {
  const players = {
    p1Name: e.p1_name || e.p1n,
    p1Ver: e.p1_version || e.p1v,
    p1Cmd: e.p1_cmd ?? null,
    p1Mtime: e.p1_mtime ?? null,
    p2Name: e.p2_name || e.p2n,
    p2Ver: e.p2_version || e.p2v,
    p2Cmd: e.p2_cmd ?? null,
    p2Mtime: e.p2_mtime ?? null
  };
  return players.p1Name && players.p1Ver && players.p2Name && players.p2Ver ? players : null;
};

const ensurePlayers = ({ p1Name, p1Ver, p2Name, p2Ver }) => {
  getPlayerId(p1Name, p1Ver);
  getPlayerId(p2Name, p2Ver);
};

const buildRunRecord = (id, players, e) => ({
  id,
  p1_name: players.p1Name,
  p1_version: players.p1Ver,
  p1_cmd: players.p1Cmd,
  p1_mtime: players.p1Mtime,
  p2_name: players.p2Name,
  p2_version: players.p2Ver,
  p2_cmd: players.p2Cmd,
  p2_mtime: players.p2Mtime,
  config_label: e.config_label ?? 'live',
  total_games: e.total_games ?? 0,
  p1_nodes: e.p1_nodes ?? 0,
  p2_nodes: e.p2_nodes ?? 0,
  eval_nodes: e.eval_nodes ?? 0,
  board_size: e.board_size ?? 20,
  min_pairs: e.min_pairs ?? 0,
  max_pairs: e.max_pairs ?? 0,
  repeat_index: e.repeat_index ?? 0,
  seed: e.seed ?? null
});

const getRunStartId = (e) => e.run_id || null;
const getRunUpdateId = (e) => e.run_id || null;

const getGameIds = (e) => {
  return {
    runId: e.run_id || null,
    groupId: groupIdFromExternalId(e.external_id)
  };
};

const getStartSlotMapping = (run, players) => {
  const blackIsSlot1 = run.p1_name === players.p1Name && run.p1_version === players.p1Ver;
  const whiteIsSlot2 = run.p2_name === players.p2Name && run.p2_version === players.p2Ver;
  if (blackIsSlot1 && whiteIsSlot2) return { blackIdName: players.p1Name, blackIdVer: players.p1Ver, whiteIdName: players.p2Name, whiteIdVer: players.p2Ver, blackIsP1: 1 };

  const blackIsSlot2 = run.p2_name === players.p1Name && run.p2_version === players.p1Ver;
  const whiteIsSlot1 = run.p1_name === players.p2Name && run.p1_version === players.p2Ver;
  if (blackIsSlot2 && whiteIsSlot1) return { blackIdName: players.p1Name, blackIdVer: players.p1Ver, whiteIdName: players.p2Name, whiteIdVer: players.p2Ver, blackIsP1: 0 };

  return null;
};

router.get('/events', (req, res) => sse.addClient(req, res));

router.get('/latest-game', (req, res) => {
  const row = repo.getLatestGame();
  res.json({ id: row?.id ?? null });
});

router.post('/batch', auth, (req, res) => {
  const events = req.body;
  if (!Array.isArray(events)) return res.sendStatus(400);

  const broadcasts = [];
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
      if ((e.type === 'start' || e.type === 'move' || e.type === 'result') && !e.external_id) continue;

      if (e.type === 'run_start') {
        const runId = getRunStartId(e);
        if (!runId) continue;

        if (repo.getRunById(runId)) continue;

          const players = getEventPlayers(e);
          if (!players) continue;
          ensurePlayers(players);

        repo.insertRun(buildRunRecord(runId, players, e));
        broadcasts.push({ type: 'run_start', run: repo.getRunById(runId) });
      } else if (e.type === 'run_update') {
        const runId = getRunUpdateId(e);
        if (!runId) continue;

        const existing = repo.getRunById(runId);
        if (!existing) continue;

        repo.updateRun({
            ...existing,
            ...e,
            id: runId,
            games_played: e.games_played ?? existing.games_played ?? 0,
            wins: e.wins ?? existing.wins ?? 0,
            losses: e.losses ?? existing.losses ?? 0,
            draws: e.draws ?? existing.draws ?? 0,
            wall_time_ms: e.wall_time_ms ?? existing.wall_time_ms ?? 0,
            p1_elo: e.p1_elo ?? existing.p1_elo ?? 1000,
            p1_erf: e.p1_erf ?? existing.p1_erf ?? 0,
            p1_time: e.p1_time ?? existing.p1_total_time_ms ?? 0,
            p1_crashes: e.p1_crashes ?? existing.p1_crashes ?? 0,
            p1_cma: e.p1_cma ?? existing.p1_cma ?? 0,
            p1_blunder: e.p1_blunder ?? existing.p1_blunder ?? 0,
            p2_elo: e.p2_elo ?? existing.p2_elo ?? 1000,
            p2_erf: e.p2_erf ?? existing.p2_erf ?? 0,
            p2_time: e.p2_time ?? existing.p2_total_time_ms ?? 0,
            p2_crashes: e.p2_crashes ?? existing.p2_crashes ?? 0,
            p2_cma: e.p2_cma ?? existing.p2_cma ?? 0,
            p2_blunder: e.p2_blunder ?? existing.p2_blunder ?? 0,
            is_done: e.is_done === undefined ? existing.is_done : e.is_done ? 1 : 0,
            timed_out: e.timed_out === undefined ? existing.timed_out : e.timed_out ? 1 : 0
        });
        broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
        } else if (e.type === 'start') {
          const { runId, groupId } = getGameIds(e);
          const run = runId ? repo.getRunById(runId) : null;
          if (!run) continue;

          if (repo.getGameByExt(e.external_id)) {
            if (!batchState.has(e.external_id)) {
              const game = repo.getGameByExt(e.external_id);
              if (game) batchState.set(e.external_id, { ...game, modified: false });
            }
            continue;
          }

          const players = getEventPlayers(e);
          if (!players) continue;
          const slotMapping = getStartSlotMapping(run, players);
          if (!slotMapping) continue;

          const blackId = getPlayerId(slotMapping.blackIdName, slotMapping.blackIdVer);
          const whiteId = getPlayerId(slotMapping.whiteIdName, slotMapping.whiteIdVer);

          const info = repo.insertGame({
            external_id: e.external_id,
            group_id: groupId,
            black_id: blackId,
            white_id: whiteId,
            run_id: runId,
            black_is_p1: slotMapping.blackIsP1,
            opening_len: e.op_len || 0
          });

          const game = repo.getGameDetails(info.lastInsertRowid);
          if (!game) continue;
          batchState.set(e.external_id, { ...game, modified: false });
          broadcasts.push({ type: 'game_start', game });
        } else if (e.type === 'move') {
          const state = getGameState(e.external_id);
          if (!state || !e.run_id || String(state.run_id) !== String(e.run_id)) continue;

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
          const state = getGameState(e.external_id);
          if (!state || !e.run_id || String(state.run_id) !== String(e.run_id)) continue;

          state.winner_color = e.winner;
          if (e.moves) state.moves = e.moves;
          if (e.duration) state.duration = e.duration;
          state.modified = true;
          broadcasts.push({
            type: 'game_result',
            id: state.id,
            external_id: e.external_id,
            run_id: state.run_id,
            winner_color: e.winner,
            moves: state.moves,
            move_count: state.moves ? state.moves.split(';').length : 0,
            black_id: state.black_id,
            white_id: state.white_id,
            group_id: state.group_id,
            duration: e.duration
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
  });

  tx();
  broadcasts.forEach((msg) => sse.broadcast(msg));
  res.json({ success: true });
});

router.delete('/reset', auth, (req, res) => {
  db.getDb().exec('DELETE FROM games; DELETE FROM players; DELETE FROM runs;');
  sse.reset();
  res.json({ success: true });
});

router.get('/runs', (req, res) => res.json(repo.getAllRuns()));

router.get('/matchups', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const result = repo.getRunsForMatchups(limit, offset).map((r) => {
    const p1 = { id: r.p1_id || 0, name: r.p1_name, version: r.p1_version, cmd: r.p1_cmd, mtime: r.p1_mtime };
    const p2 = { id: r.p2_id || 0, name: r.p2_name, version: r.p2_version, cmd: r.p2_cmd, mtime: r.p2_mtime };
    const p1IsHero = compareHeroOrder(p1, p2) >= 0;

    return {
      runId: r.runId,
      hero: p1IsHero ? p1 : p2,
      villain: p1IsHero ? p2 : p1,
      heroWins: p1IsHero ? r.wins : r.losses,
      villainWins: p1IsHero ? r.losses : r.wins,
      draws: r.draws,
      total: r.games_played,
      lastActivity: r.updated_at,
      live_count: r.live_count
    };
  });

  res.json(result);
});

router.get('/games', (req, res) => {
  const { hero_id, villain_id, run_id, sort, order, limit, offset } = req.query;
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
      hero: parseInt(hero_id) || 0,
      villain: parseInt(villain_id) || 0,
      runId: run_id,
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
