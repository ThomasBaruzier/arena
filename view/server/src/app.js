import express from 'express';
import cors from 'cors';
import * as db from './db.js';
import * as repo from './repository.js';
import createRoutes from './routes.js';
import { DB_PATH, getApiKey } from './config.js';

const createApp = (dbPath = DB_PATH) => {
  const apiKey = getApiKey();
  const database = db.init(dbPath);
  repo.init(database);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', createRoutes(apiKey));
  return app;
};

export default createApp;
