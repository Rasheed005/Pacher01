import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app is served same-origin in production (Express serves dist/).
// In development, the Vite dev server proxies /api to the Express backend so the
// browser still sees a single origin — session cookies + CSRF keep working.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
