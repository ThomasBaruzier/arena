import express from 'express';
import cors from 'cors';
import * as db from './db.js';
import * as repo from './repository.js';
import routes from './routes.js';
import { DB_PATH } from './config.js';
import { parseExternalGameId } from './utils.js';

const getRunPlayers = (details) =>
  details.black_is_p1
    ? {
        p1_name: details.black_name,
        p1_version: details.black_ver,
        p2_name: details.white_name,
        p2_version: details.white_ver
      }
    : {
        p1_name: details.white_name,
        p1_version: details.white_ver,
        p2_name: details.black_name,
        p2_version: details.black_ver
      };

const ensureRepairedRun = (runId, gameId) => {
  const existing = repo.getRunById(runId);
  if (existing && existing.p1_name !== 'Unknown' && existing.p2_name !== 'Unknown') return;

  const details = repo.getGameDetails(gameId);
  repo.insertRun({
    id: runId,
    ...getRunPlayers(details),
    config_label: existing?.config_label || 'repaired',
    total_games: existing?.total_games || 0,
    p1_nodes: existing?.p1_nodes || 0,
    p2_nodes: existing?.p2_nodes || 0,
    eval_nodes: existing?.eval_nodes || 0,
    board_size: existing?.board_size || 20,
    min_pairs: existing?.min_pairs || 0,
    max_pairs: existing?.max_pairs || 0,
    repeat_index: existing?.repeat_index || 0,
    seed: existing?.seed ?? null
  });
};

const repairGameIdentities = () => {
  const games = repo.getGamesForIdentityRepair();
  const truncated = new Map();

  for (const game of games) {
    const parsed = parseExternalGameId(game.external_id);
    const inferred = { ...parsed, runId: parsed.inferredRunId };
    if (!inferred.valid || !inferred.runId) continue;

    const storedId = game.run_id || game.tournament_id;

    if (!storedId) {
      ensureRepairedRun(inferred.runId, game.id);
      repo.updateGameIdentity({ id: game.id, group_id: inferred.groupId, run_id: inferred.runId });
      continue;
    }

    if (storedId === inferred.runId) {
      ensureRepairedRun(inferred.runId, game.id);
      if (game.run_id !== inferred.runId || game.tournament_id !== inferred.runId)
        repo.updateGameIdentity({ id: game.id, group_id: inferred.groupId, run_id: inferred.runId });
      continue;
    }

    if (inferred.runId.startsWith(`${storedId}_`)) {
      if (!truncated.has(storedId)) truncated.set(storedId, []);
      truncated.get(storedId).push({ game, inferred });
    }
  }

  for (const [storedId, repairs] of truncated) {
    const allStoredGames = repo.getGamesByRunForIdentityRepair(storedId);
    if (repairs.length !== allStoredGames.length) continue;

    const targetRunId = repairs[0]?.inferred.runId;
    if (!targetRunId || repairs.some(({ inferred }) => inferred.runId !== targetRunId)) continue;

    ensureRepairedRun(targetRunId, repairs[0].game.id);

    repo.insertRunAlias(storedId, targetRunId);
    repo.renameRun(storedId, targetRunId);
    repo.mergeRunMetrics(storedId, targetRunId);

    for (const { game, inferred } of repairs) {
      repo.updateGameIdentity({ id: game.id, group_id: inferred.groupId, run_id: targetRunId });
    }

    repo.deleteEmptyRun(storedId);
  }
};

const createApp = (dbPath = DB_PATH) => {
  const database = db.init(dbPath);
  repo.init(database);
  db.transaction(repairGameIdentities)();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', routes);
  return app;
};

export default createApp;
