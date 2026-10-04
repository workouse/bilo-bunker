import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev only: the UI runs on Vite's default port and proxies /api to the backend
// (default PORT 3000). The Host header is preserved (no changeOrigin) so the
// URL the browser signs for NIP-98 matches what the backend reconstructs.
const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: devApiTarget,
      },
    },
  },
  build: {
    outDir: '../app/public',
    emptyOutDir: true,
  },
});
