import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend port used by `make dev` (packages/app reads PORT, default 3000).
const apiTarget = `http://localhost:${process.env.API_PORT ?? process.env.PORT ?? '3000'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // changeOrigin stays false so the backend sees the browser's Host header,
      // which NIP-98 needs to match the signed URL.
      '/api': { target: apiTarget },
      '/install.sh': { target: apiTarget },
    },
  },
  build: {
    outDir: '../app/public',
    emptyOutDir: true,
  },
});
