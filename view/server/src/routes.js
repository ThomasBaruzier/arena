import express from 'express';
import * as db from './db.js';
import * as repo from './repository.js';
import sse from './sse.js';
import { API_KEY } from './config.js';
import { compareVersions } from './utils.js';

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
          const p1Name = e.p1_name || e.p1n || 'Unknown';
          const p1Ver = e.p1_version || e.p1v || '0.0';
          const p2Name = e.p2_name || e.p2n || 'Unknown';
          const p2Ver = e.p2_version || e.p2v || '0.0';

          getPlayerId(p1Name, p1Ver);
          getPlayerId(p2Name, p2Ver);

          repo.insertRun({
            id: runId,
            p1_name: p1Name,
            p1_version: p1Ver,
            p2_name: p2Name,
            p2_version: p2Ver,
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
            repo.updateRun({
              ...merged,
              p1_time: e.p1_time || 0,
              p2_time: e.p2_time || 0,
              p1_cma: e.p1_cma || 0,
              p1_blunder: e.p1_blunder || 0,
              p2_cma: e.p2_cma || 0,
              p2_blunder: e.p2_blunder || 0
            });
            broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
          }
        } else if (e.type === 'start') {
          const bId = getPlayerId(e.p1n || 'Unknown', e.p1v || '0.0');
          const wId = getPlayerId(e.p2n || 'Unknown', e.p2v || '0.0');
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
            black_is_p1: e.black_is_p1 ? 1 : 0,
            opening_len: e.op_len || 0
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
          if (e.duration) state.duration = e.duration;
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
            group_id: state.group_id,
            duration: e.duration
          });
        }
      } catch (err) {
        console.error('Batch error:', err.message);
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

  const runs = repo.getRunsForMatchups(limit, offset);

  const result = runs.map((r) => {
    const p1 = { id: r.p1_id || 0, name: r.p1_name, version: r.p1_version };
    const p2 = { id: r.p2_id || 0, name: r.p2_name, version: r.p2_version };
    const p1IsHero = compareVersions(p1, p2) >= 0;

    return {
      tournamentId: r.tournamentId,
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
  else if (sort === 'duration')
    orderBy = asc ? 'duration ASC, max_id DESC' : 'duration DESC, max_id DESC';
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
    res.json(
      rows.map((r) => {
        const games = JSON.parse(r.games_json);
        games.sort((a, b) => (asc ? a.id - b.id : b.id - a.id));
        return { ...r, games };
      })
    );
  } catch {
    res.status(500).json([]);
  }
});

router.get('/game/:id', (req, res) => {
  const g = repo.getGameDetails(req.params.id);
  if (!g) return res.sendStatus(404);

  if (req.query.context === 'true' && g.run_id) {
    const rOffset = repo.getRunOffset(g.run_id);
    if (rOffset) g.matchup_offset = rOffset.offset;

    const groupMax = repo.getGameGroupMaxId(g.group_id);
    if (groupMax) {
      const gOffset = repo.getGameGroupOffset(g.run_id, groupMax.max_id);
      if (gOffset) g.game_offset = gOffset.offset;
    }
  }

  res.json(g);
});

export default router;
