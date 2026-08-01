import cors from 'cors';
import express from 'express';
import { DB_PATH, getApiKey } from './config.js';
import * as db from './db.js';
import * as repository from './repository.js';
import createRoutes from './routes.js';

const createApp = (dbPath = DB_PATH) => {
  const apiKey = getApiKey();
  const database = db.init(dbPath);

  repository.init(database);

  const app = express();

  app.use(
    cors({
      exposedHeaders: ['X-Arena-Generation']
    })
  );

  app.use((req, res, next) => {
    res.setHeader('X-Arena-Generation', db.getGeneration());
    next();
  });

  app.use(
    express.json({
      limit: '10mb'
    })
  );

  app.use('/api', createRoutes(apiKey));

  return app;
};

export default createApp;
