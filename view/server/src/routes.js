import express from 'express';
import * as db from './db.js';
import * as repo from './repository.js';
import sse from './sse.js';
import { compareVersions } from './utils.js';
import { API_KEY } from './config.js';

const router = express.Router();

const auth = (req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.sendStatus(403);
  next();
};

const getPlayerId = (name, version) => {
  repo.insertPlayer({ name, version });
  return repo.getPlayerId({ name, version }).id;
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

  const getGameState = (extId) => {
    if (batchState.has(extId)) return batchState.get(extId);
    const g = repo.getGameByExt(extId);
    if (g) {
      const state = { ...g, modified: false };
      batchState.set(extId, state);
      return state;
    }
    return null;
  };

  const tx = db.transaction(() => {
    for (const e of events) {
      try {
        if (e.type === 'run_start') {
          const runId = e.run_id || e.id;
          repo.insertRun({
            id: runId,
            p1_name: e.p1_name || e.p1n,
            p1_version: e.p1_version || e.p1v,
            p2_name: e.p2_name || e.p2n,
            p2_version: e.p2_version || e.p2v,
            config_label: e.config_label,
            total_games: e.total_games,
            p1_nodes: e.p1_nodes || 0,
            p2_nodes: e.p2_nodes || 0,
            eval_nodes: e.eval_nodes || 0,
            board_size: e.board_size || 20,
            min_pairs: e.min_pairs || 5,
            max_pairs: e.max_pairs || 10,
            repeat_index: e.repeat_index || 0,
            seed: e.seed ?? null
          });
          broadcasts.push({ type: 'run_start', run: repo.getRunById(runId) });
        } else if (e.type === 'run_update') {
          const runId = e.run_id || e.id;
          const existing = repo.getRunById(runId);
          if (existing) {
            const merged = { ...existing, ...e, id: runId, is_done: e.is_done ? 1 : 0 };
            repo.updateRun(merged);
            broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
          }
        } else if (e.type === 'start') {
          const bId = getPlayerId(e.p1n, e.p1v);
          const wId = getPlayerId(e.p2n, e.p2v);
          const parts = e.external_id.split('_');
          const tournamentId = e.run_id || parts[0] || 'unknown';
          const groupId = e.external_id.includes('_')
            ? e.external_id.substring(0, e.external_id.lastIndexOf('_'))
            : e.external_id;

          const info = repo.insertGame({
            external_id: e.external_id,
            group_id: groupId,
            tournament_id: tournamentId,
            black_id: bId,
            white_id: wId,
            run_id: e.run_id || null,
            black_is_p1: e.black_is_p1 ? 1 : 0
          });

          if (info.changes > 0) {
            const game = repo.getGameDetails(info.lastInsertRowid);
            broadcasts.push({ type: 'game_start', game });
            batchState.set(e.external_id, { ...game, modified: false });
          }
        } else if (e.type === 'move') {
          const state = getGameState(e.external_id);
          if (!state) continue;
          const moveStr = `${e.x},${e.y},${e.c}`;
          const currentMoves = state.moves && state.moves.length > 0 ? state.moves.split(';') : [];
          if (!currentMoves.includes(moveStr)) {
            state.moves = state.moves ? `${state.moves};${moveStr}` : moveStr;
            state.modified = true;
            broadcasts.push({
              type: 'game_move',
              id: state.id,
              group_id: state.group_id,
              tournament_id: state.tournament_id,
              moves: state.moves,
              move_count: currentMoves.length + 1
            });
          }
        } else if (e.type === 'result') {
          const state = getGameState(e.external_id);
          if (!state) continue;
          state.winner_color = e.winner;
          if (e.moves) state.moves = e.moves;
          state.modified = true;
          broadcasts.push({
            type: 'game_result',
            id: state.id,
            external_id: e.external_id,
            tournament_id: state.tournament_id,
            winner_color: e.winner,
            moves: state.moves,
            move_count: state.moves ? state.moves.split(';').length : 0,
            black_id: state.black_id,
            white_id: state.white_id,
            group_id: state.group_id
          });
        }
      } catch (err) {
        console.error('Batch error:', err.message);
      }
    }
    for (const state of batchState.values()) {
      if (state.modified) {
        repo.updateGameFull({ moves: state.moves, winner: state.winner_color, id: state.id });
      }
    }
  });

  tx();
  broadcasts.forEach((m) => sse.broadcast(m));
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
  const rows = repo.getRawStats();
  const players = Object.fromEntries(repo.getAllPlayers().map((p) => [p.id, p]));
  const groups = {};

  for (const r of rows) {
    const tid = r.tournament_id || 'legacy';
    const k =
      r.black_id < r.white_id
        ? `${tid}-${r.black_id}-${r.white_id}`
        : `${tid}-${r.white_id}-${r.black_id}`;
    if (!groups[k]) {
      const pA = players[r.black_id];
      const pB = players[r.white_id];
      const isAGreater = compareVersions(pA, pB) >= 0;
      groups[k] = {
        tournamentId: tid,
        hero: isAGreater ? pA : pB,
        villain: isAGreater ? pB : pA,
        heroWins: 0,
        villainWins: 0,
        draws: 0,
        total: 0,
        lastActivity: ''
      };
    }
    const g = groups[k];
    const isHeroBlack = g.hero.id === r.black_id;
    const isSelfPlay = r.black_id === r.white_id;
    if (r.winner_color === 3) {
      g.draws += r.cnt;
    } else if (isSelfPlay) {
      if (r.leg === 0) r.winner_color === 1 ? (g.heroWins += r.cnt) : (g.villainWins += r.cnt);
      else r.winner_color === 1 ? (g.villainWins += r.cnt) : (g.heroWins += r.cnt);
    } else {
      if (r.winner_color === 1) isHeroBlack ? (g.heroWins += r.cnt) : (g.villainWins += r.cnt);
      else if (r.winner_color === 2)
        !isHeroBlack ? (g.heroWins += r.cnt) : (g.villainWins += r.cnt);
    }
    g.total += r.cnt;
    if (r.last_ts > g.lastActivity) g.lastActivity = r.last_ts;
  }
  const sorted = Object.values(groups).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  res.json(sorted.slice(offset, offset + limit));
});

router.get('/games', (req, res) => {
  const { hero_id, villain_id, tournament_id, run_id, sort, order, limit, offset } = req.query;
  const l = Math.min(parseInt(limit) || 50, 100);
  const o = parseInt(offset) || 0;
  const asc = order === 'asc';
  const dir = asc ? 'ASC' : 'DESC';

  let orderBy = 'max_id DESC';
  if (sort === 'moves')
    orderBy = asc ? 'min_moves ASC, max_id DESC' : 'max_moves DESC, max_id DESC';
  else if (sort === 'time') orderBy = `latest_ts ${dir}, max_id DESC`;
  else if (sort === 'status')
    orderBy = asc
      ? 'live_count ASC, hero_wins ASC, max_id DESC'
      : 'live_count DESC, hero_wins DESC, max_id DESC';
  else if (sort === 'id') orderBy = `max_id ${dir}`;

  try {
    const rows = repo.getGamesDynamic({
      hero: parseInt(hero_id) || 0,
      villain: parseInt(villain_id) || 0,
      tid: tournament_id,
      runId: run_id,
      limit: l,
      offset: o,
      orderBy
    });
    res.json(rows.map((r) => ({ ...r, games: JSON.parse(r.games_json) })));
  } catch {
    res.status(500).json([]);
  }
});

router.get('/game/:id', (req, res) => {
  const g = repo.getGameDetails(req.params.id);
  if (!g) return res.sendStatus(404);
  res.json(g);
});

export default router;
