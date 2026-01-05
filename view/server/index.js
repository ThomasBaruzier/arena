import createApp from './src/app.js';
import { PORT } from './src/config.js';
import sse from './src/sse.js';
import { close as closeDb } from './src/db.js';

const app = createApp();
const server = app.listen(PORT, () => console.log(`API on ${PORT}`));

const shutdown = () => {
  sse.shutdown();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
