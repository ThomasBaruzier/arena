import createApp from './src/app.js';
import { PORT } from './src/config.js';
import sse from './src/sse.js';
import { close as closeDb } from './src/db.js';
import * as repo from './src/repository.js';

const app = createApp();
const server = app.listen(PORT, () => console.log(`API on ${PORT}`));

const cleanupInterval = setInterval(() => {
  try {
    const expired = repo.getExpiredRunIds();
    if (expired.length > 0) {
      repo.deleteRuns();
      expired.forEach((row) => sse.broadcast({ type: 'run_delete', run_id: row.id }));
    }

    const staleRuns = repo.getStaleRunIds();
    if (staleRuns.length > 0) {
      repo.markStaleRuns();
      staleRuns.forEach((row) =>
        sse.broadcast({
          type: 'run_update',
          run: { id: row.id, timed_out: 1, is_done: 1 }
        })
      );
    }

    const staleGames = repo.getStaleGameIds();
    if (staleGames.length > 0) {
      repo.markStaleGamesAsCrashed();
      staleGames.forEach((row) =>
        sse.broadcast({
          type: 'game_result',
          id: row.id,
          external_id: row.external_id,
          tournament_id: row.tournament_id,
          winner_color: 4,
          moves: row.moves,
          move_count: row.moves ? row.moves.split(';').length : 0,
          black_id: row.black_id,
          white_id: row.white_id,
          group_id: row.group_id
        })
      );
    }
  } catch (e) {
    console.error('Cleanup error:', e);
  }
}, 5000);

const shutdown = () => {
  clearInterval(cleanupInterval);
  sse.shutdown();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
