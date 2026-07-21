import express from 'express';
import * as db from './db.js';
import * as repo from './repository.js';
import sse from './sse.js';
import { API_KEY } from './config.js';
import { compareVersions, parseExternalGameId } from './utils.js';

const router = express.Router();

const auth = (req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.sendStatus(403);
  next();
};

const getPlayerId = (name, version) => {
  repo.insertPlayer({ name, version });
  return repo.getPlayerId({ name, version }).id;
};

const getRunPlayers = (p1Name, p1Ver, p2Name, p2Ver, blackIsP1 = true) =>
  blackIsP1
    ? {
        p1_name: p1Name,
        p1_version: p1Ver,
        p2_name: p2Name,
        p2_version: p2Ver
      }
    : {
        p1_name: p2Name,
        p1_version: p2Ver,
        p2_name: p1Name,
        p2_version: p1Ver
      };

const getEventPlayers = (e) => ({
  p1Name: e.p1_name || e.p1n || 'Unknown',
  p1Ver: e.p1_version || e.p1v || '0.0',
  p2Name: e.p2_name || e.p2n || 'Unknown',
  p2Ver: e.p2_version || e.p2v || '0.0'
});

const ensurePlayers = ({ p1Name, p1Ver, p2Name, p2Ver }) => {
  getPlayerId(p1Name, p1Ver);
  getPlayerId(p2Name, p2Ver);
};

const buildRunRecord = (id, players, e, defaults) => ({
  id,
  p1_name: players.p1Name,
  p1_version: players.p1Ver,
  p2_name: players.p2Name,
  p2_version: players.p2Ver,
  config_label: defaults.config_label,
  total_games: defaults.total_games,
  p1_nodes: e.p1_nodes ?? defaults.p1_nodes ?? 0,
  p2_nodes: e.p2_nodes ?? defaults.p2_nodes ?? 0,
  eval_nodes: e.eval_nodes ?? defaults.eval_nodes ?? 0,
  board_size: e.board_size ?? defaults.board_size ?? 20,
  min_pairs: defaults.min_pairs,
  max_pairs: defaults.max_pairs,
  repeat_index: e.repeat_index ?? defaults.repeat_index ?? 0,
  seed: e.seed ?? defaults.seed ?? null
});

const inferIds = (e) => {
  const externalId = e.external_id == null ? '' : String(e.external_id);
  const parsed = parseExternalGameId(externalId);
  const suppliedId = e.run_id || e.tournament_id || null;
  const suppliedSuffix = suppliedId ? externalId.slice(String(suppliedId).length) : '';
  const hasSuppliedShape =
    suppliedId && externalId.startsWith(String(suppliedId)) && /^_\d+_\d+$/.test(suppliedSuffix);
  const runId =
    parsed.valid && suppliedId && !hasSuppliedShape && parsed.inferredRunId.startsWith(`${suppliedId}_`)
      ? parsed.inferredRunId
      : e.run_id || (parsed.valid ? parsed.inferredRunId : null) || e.tournament_id || null;
  const tournamentId = runId || 'unknown';
  return {
    groupId: parsed.groupId,
    inferredRunId: parsed.inferredRunId,
    runId,
    tournamentId,
    suppliedId,
    valid: parsed.valid
  };
};

const resolveRunId = (id, aliases) => {
  let current = id;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const next = aliases.get(current) || repo.getRunAlias(current)?.run_id;
    if (!next || next === current) break;
    current = next;
  }
  return current;
};

const canonicalizeGroupId = (groupId, fromRunId, toRunId) => {
  if (!fromRunId || !toRunId || fromRunId === toRunId) return groupId;
  if (groupId === fromRunId) return toRunId;
  if (groupId?.startsWith(`${fromRunId}_`)) return `${toRunId}${groupId.slice(fromRunId.length)}`;
  return groupId;
};

const getStaleRunIds = ({ existing, runId, suppliedId, inferredRunId }) => {
  const staleRunIds = new Set();
  if (existing?.run_id && existing.run_id !== runId) staleRunIds.add(existing.run_id);
  if (!existing?.run_id && existing?.tournament_id && existing.tournament_id !== runId)
    staleRunIds.add(existing.tournament_id);
  if (suppliedId && suppliedId !== runId && runId?.startsWith(`${suppliedId}_`) && repo.getRunById(suppliedId))
    staleRunIds.add(suppliedId);
  if (inferredRunId && inferredRunId !== runId && repo.getRunById(inferredRunId))
    staleRunIds.add(inferredRunId);
  return staleRunIds;
};

const isRevivedCrash = (winnerColor, reviveCrashed) => reviveCrashed && winnerColor === 4;
const revivedWinnerColor = (winnerColor, reviveCrashed) =>
  isRevivedCrash(winnerColor, reviveCrashed) ? 0 : winnerColor;
const revivedMoves = (moves, winnerColor, reviveCrashed) =>
  isRevivedCrash(winnerColor, reviveCrashed) ? '' : moves;
const revivedDuration = (duration, winnerColor, reviveCrashed) =>
  isRevivedCrash(winnerColor, reviveCrashed) ? 0 : duration;

const patchQueuedGameBroadcasts = (
  broadcasts,
  { id, externalId, groupId, tournamentId, runId, reviveCrashed = false }
) => {
  let firstQueuedGameEvent = -1;
  let hasQueuedGameStart = false;

  for (let i = 0; i < broadcasts.length; i++) {
    const msg = broadcasts[i];
    if (msg.id === id || msg.external_id === externalId) {
      msg.group_id = groupId;
      msg.tournament_id = tournamentId;
      msg.run_id = runId;
      const wasCrashed = isRevivedCrash(msg.winner_color, reviveCrashed);
      msg.moves = revivedMoves(msg.moves, msg.winner_color, reviveCrashed);
      msg.move_count = wasCrashed ? 0 : msg.move_count;
      msg.duration = revivedDuration(msg.duration, msg.winner_color, reviveCrashed);
      msg.winner_color = revivedWinnerColor(msg.winner_color, reviveCrashed);
      if (firstQueuedGameEvent === -1) firstQueuedGameEvent = i;
    } else if (msg.game?.id === id || msg.game?.external_id === externalId) {
      msg.game = {
        ...msg.game,
        group_id: groupId,
        tournament_id: tournamentId,
        run_id: runId,
        winner_color: revivedWinnerColor(msg.game.winner_color, reviveCrashed),
        moves: revivedMoves(msg.game.moves, msg.game.winner_color, reviveCrashed),
        move_count: isRevivedCrash(msg.game.winner_color, reviveCrashed) ? 0 : msg.game.move_count,
        duration: revivedDuration(msg.game.duration, msg.game.winner_color, reviveCrashed)
      };
      hasQueuedGameStart ||= msg.type === 'game_start';
      if (firstQueuedGameEvent === -1) firstQueuedGameEvent = i;
    }
  }

  return { firstQueuedGameEvent, hasQueuedGameStart };
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
  const runAliases = new Map();
  const revivedTimedOutRuns = new Set();

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
        if ((e.type === 'start' || e.type === 'move' || e.type === 'result') && !e.external_id) continue;
        if (e.type === 'run_start') {
          const rawRunId = e.run_id || e.id || e.tournament_id;
          const runId = resolveRunId(rawRunId, runAliases);
          const existingRun = repo.getRunById(runId);
          const rawPlayers = getEventPlayers(e);
          const players =
            existingRun && (rawPlayers.p1Name === 'Unknown' || rawPlayers.p2Name === 'Unknown')
              ? {
                  p1Name: existingRun.p1_name,
                  p1Ver: existingRun.p1_version,
                  p2Name: existingRun.p2_name,
                  p2Ver: existingRun.p2_version
                }
              : rawPlayers;
          ensurePlayers(players);

          repo.insertRun(
            buildRunRecord(runId, players, e, {
              config_label: e.config_label ?? existingRun?.config_label,
              total_games: e.total_games ?? existingRun?.total_games,
              p1_nodes: existingRun?.p1_nodes,
              p2_nodes: existingRun?.p2_nodes,
              eval_nodes: existingRun?.eval_nodes,
              board_size: existingRun?.board_size,
              min_pairs: e.min_pairs ?? existingRun?.min_pairs ?? 5,
              max_pairs: e.max_pairs ?? existingRun?.max_pairs ?? 10,
              repeat_index: existingRun?.repeat_index,
              seed: existingRun?.seed
            })
          );
          if (existingRun?.timed_out || existingRun?.is_done) {
            repo.reviveRun(runId);
            revivedTimedOutRuns.add(runId);
          }
          broadcasts.push({ type: 'run_start', run: repo.getRunById(runId) });
        } else if (e.type === 'run_update') {
          const rawRunId = e.run_id || e.id || e.tournament_id;
          const runId = resolveRunId(rawRunId, runAliases);
          let existing = repo.getRunById(runId);
          if (!existing) {
            const players = getEventPlayers(e);
            ensurePlayers(players);
            repo.insertRun(
              buildRunRecord(runId, players, e, {
                config_label: e.config_label || 'live',
                total_games: e.total_games || 0,
                min_pairs: e.min_pairs || 0,
                max_pairs: e.max_pairs || 0
              })
            );
            existing = repo.getRunById(runId);
            broadcasts.push({ type: 'run_start', run: existing });
          }
          const hasProgress =
            e.games_played !== undefined ||
            e.wins !== undefined ||
            e.losses !== undefined ||
            e.draws !== undefined;
          const advancesProgress =
            e.games_played !== undefined && Number(e.games_played) > Number(existing.games_played || 0);
          const clearsTimedOut = existing.timed_out && advancesProgress && e.timed_out !== true;
          const revivesTimedOut = clearsTimedOut && e.is_done !== true;
          const revivesDone = existing.is_done && advancesProgress && e.is_done !== true;
          const merged = {
            ...existing,
            ...e,
            id: runId,
            is_done:
              e.is_done === undefined
                ? revivesTimedOut
                  ? 0
                  : existing.is_done
                : e.is_done
                  ? 1
                  : revivesDone || revivesTimedOut
                    ? 0
                    : existing.is_done,
            timed_out:
              e.timed_out === undefined
                ? clearsTimedOut
                  ? 0
                  : existing.timed_out
                : e.timed_out
                  ? 1
                  : 0
          };
          repo.updateRun({
            ...merged,
            p1_time: e.p1_time ?? existing.p1_total_time_ms ?? 0,
            p2_time: e.p2_time ?? existing.p2_total_time_ms ?? 0,
            p1_cma: e.p1_cma ?? existing.p1_cma ?? 0,
            p1_blunder: e.p1_blunder ?? existing.p1_blunder ?? 0,
            p2_cma: e.p2_cma ?? existing.p2_cma ?? 0,
            p2_blunder: e.p2_blunder ?? existing.p2_blunder ?? 0
          });
          if (revivesTimedOut) revivedTimedOutRuns.add(runId);
          broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
        } else if (e.type === 'start') {
          const { p1Name, p1Ver, p2Name, p2Ver } = getEventPlayers(e);
          const bId = getPlayerId(p1Name, p1Ver);
          const wId = getPlayerId(p2Name, p2Ver);
          const inferred = inferIds(e);
          const runId = resolveRunId(inferred.runId, runAliases);
          const groupId = canonicalizeGroupId(inferred.groupId, inferred.inferredRunId || inferred.runId, runId);
          const tournamentId = runId || 'unknown';
          const suppliedId = inferred.suppliedId;

          const existingRun = runId ? repo.getRunById(runId) : null;
          const startRunRecord = {
            id: runId,
            ...getRunPlayers(p1Name, p1Ver, p2Name, p2Ver, e.black_is_p1 !== false),
            config_label: existingRun?.config_label ?? 'live',
            total_games: existingRun?.total_games ?? 0,
            p1_nodes: existingRun?.p1_nodes ?? 0,
            p2_nodes: existingRun?.p2_nodes ?? 0,
            eval_nodes: existingRun?.eval_nodes ?? 0,
            board_size: existingRun?.board_size ?? 20,
            min_pairs: existingRun?.min_pairs ?? 0,
            max_pairs: existingRun?.max_pairs ?? 0,
            repeat_index: existingRun?.repeat_index ?? 0,
            seed: existingRun?.seed ?? null
          };
          if (runId && !existingRun) {
            repo.insertRun(startRunRecord);
            broadcasts.push({ type: 'run_start', run: repo.getRunById(runId) });
          } else if (existingRun?.p1_name === 'Unknown' || existingRun?.p2_name === 'Unknown') {
            repo.insertRun(startRunRecord);
            broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
          }
          const revivedStartRun = !!(existingRun?.timed_out || existingRun?.is_done);
          if (revivedStartRun) {
            repo.reviveRun(runId);
            revivedTimedOutRuns.add(runId);
            broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
          }

          const buffered = batchState.get(e.external_id);
          const existing = buffered || repo.getGameByExt(e.external_id);
          if (existing && (existing.black_id !== bId || existing.white_id !== wId)) continue;

          const staleRunIds = getStaleRunIds({
            existing,
            runId,
            suppliedId,
            inferredRunId: inferred.inferredRunId
          });
          const staleTimedOut = [...staleRunIds].some((id) => repo.getRunById(id)?.timed_out);

          const info = repo.insertGame({
            external_id: e.external_id,
            group_id: groupId,
            tournament_id: tournamentId,
            black_id: bId,
            white_id: wId,
            run_id: runId,
            black_is_p1: e.black_is_p1 === false ? 0 : 1,
            opening_len: e.op_len || 0
          });

          let game = repo.getGameDetails(existing ? existing.id : info.lastInsertRowid);
          const aliasResolvedStart = suppliedId && suppliedId !== runId && resolveRunId(suppliedId, runAliases) === runId;
          const shouldReviveCurrentGame =
            (existingRun?.timed_out || revivedTimedOutRuns.has(runId) || staleTimedOut || (aliasResolvedStart && staleTimedOut)) &&
            game.winner_color === 4;
          if (shouldReviveCurrentGame) {
            repo.updateGameIdentityRevive({ id: game.id, group_id: groupId, run_id: runId });
            repo.reviveRun(runId);
            if (!revivedStartRun) broadcasts.push({ type: 'run_update', run: repo.getRunById(runId) });
            game = repo.getGameDetails(game.id);
          }
          const state = {
            ...game,
            moves: shouldReviveCurrentGame ? game.moves : (buffered?.moves ?? game.moves),
            winner_color: shouldReviveCurrentGame ? game.winner_color : (buffered?.winner_color ?? game.winner_color),
            duration: shouldReviveCurrentGame ? game.duration : (buffered?.duration ?? game.duration),
            modified: buffered?.modified || false
          };
          for (const staleRunId of staleRunIds) {
            const staleRun = repo.getRunById(staleRunId);
            const staleGames = repo.getGamesByRunForIdentityRepair(staleRunId);
            const repairs = [];
            for (const staleGame of staleGames) {
              const staleInferred = inferIds({ external_id: staleGame.external_id });
              if (!staleInferred.valid || staleInferred.runId !== runId) {
                repairs.length = 0;
                break;
              }
              repairs.push({ staleGame, staleInferred });
            }
            if (repairs.length !== staleGames.length) continue;

            runAliases.set(staleRunId, runId);
            repo.insertRunAlias(staleRunId, runId);
            for (const { staleGame, staleInferred } of repairs) {
              const repairedGroupId = canonicalizeGroupId(staleInferred.groupId, staleInferred.runId, runId);
              const shouldReviveGame = staleRun?.timed_out && staleGame.external_id === e.external_id;
              const updateIdentity = shouldReviveGame ? repo.updateGameIdentityRevive : repo.updateGameIdentity;
              updateIdentity({ id: staleGame.id, group_id: repairedGroupId, run_id: runId });
              const repairedGame = repo.getGameDetails(staleGame.id);
              const bufferedGame = batchState.get(staleGame.external_id);
              if (bufferedGame) {
                bufferedGame.group_id = repairedGroupId;
                bufferedGame.tournament_id = runId;
                bufferedGame.run_id = runId;
                if (shouldReviveGame && bufferedGame.winner_color === 4) {
                  bufferedGame.winner_color = 0;
                  bufferedGame.moves = '';
                  bufferedGame.duration = 0;
                  bufferedGame.modified = true;
                }
              }
              if (staleGame.external_id === e.external_id && shouldReviveGame && state.winner_color === 4) {
                state.winner_color = 0;
                state.moves = '';
                state.duration = 0;
                state.modified = true;
              }
              const { firstQueuedGameEvent, hasQueuedGameStart } = patchQueuedGameBroadcasts(
                broadcasts,
                {
                  id: staleGame.id,
                  externalId: staleGame.external_id,
                  groupId: repairedGroupId,
                  tournamentId: runId,
                  runId,
                  reviveCrashed: shouldReviveGame
                }
              );

              if (!hasQueuedGameStart && staleGame.external_id !== e.external_id) {
                const startEvent = { type: 'game_start', game: repairedGame };
                if (firstQueuedGameEvent === -1) broadcasts.push(startEvent);
                else broadcasts.splice(firstQueuedGameEvent, 0, startEvent);
              }
            }
            repo.mergeRunMetrics(staleRunId, runId);
            if (staleRun?.timed_out) {
              repo.reviveRun(runId);
              revivedTimedOutRuns.add(runId);
            }
            const deleted = repo.deleteEmptyRun(staleRunId);
            for (const msg of broadcasts) {
              if ((msg.type === 'run_start' || msg.type === 'run_update') && msg.run?.id === staleRunId)
                msg.skip = true;
            }
            if (deleted.changes > 0) broadcasts.push({ type: 'run_delete', run_id: staleRunId });
          }
          const repairedRunUpdate = staleRunIds.size > 0 ? repo.getRunById(runId) : null;
          if (shouldReviveCurrentGame || !existing || existing.run_id !== runId || existing.tournament_id !== tournamentId) {
            const { hasQueuedGameStart } = patchQueuedGameBroadcasts(broadcasts, {
              id: game.id,
              externalId: e.external_id,
              groupId: game.group_id,
              tournamentId: game.tournament_id,
              runId: game.run_id,
              reviveCrashed: shouldReviveCurrentGame
            });
            if (!hasQueuedGameStart) broadcasts.push({ type: 'game_start', game: state });
          }
          if (repairedRunUpdate) broadcasts.push({ type: 'run_update', run: repairedRunUpdate });
          batchState.set(e.external_id, state);
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
              run_id: state.run_id,
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
  broadcasts.filter((m) => !m.skip).forEach((m) => sse.broadcast(m));
  res.json({ success: true });
});

router.delete('/reset', auth, (req, res) => {
  db.getDb().exec('DELETE FROM games; DELETE FROM players; DELETE FROM runs; DELETE FROM run_aliases;');
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
