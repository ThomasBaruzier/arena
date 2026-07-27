import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = process.env.PORT || 3000;
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'games.db');

export const getApiKey = () => {
  const key = process.env.API_KEY?.trim();
  if (!key) throw new Error('API_KEY is required');
  return key;
};
