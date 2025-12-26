import { defineConfig } from 'vite';

// Port configuration
const BACKEND_PORT = 8765;
const FRONTEND_PORT = 3456;

export default defineConfig({
  server: {
    port: FRONTEND_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
