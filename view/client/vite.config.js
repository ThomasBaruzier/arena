import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    exclude: ['node_modules', 'e2e'],
    deps: {
      optimizer: {
        web: {
          include: ['react', 'react-dom']
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
