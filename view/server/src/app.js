import express from 'express';
import cors from 'cors';
import * as db from './db.js';
import * as repo from './repository.js';
import routes from './routes.js';
import { DB_PATH } from './config.js';

const createApp = (dbPath = DB_PATH) => {
  const database = db.init(dbPath);
  repo.init(database);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', routes);
  return app;
};

export default createApp;
