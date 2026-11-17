import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

import pkg from './package.json';

// The SPA and the API share one origin (nginx in Docker, the Vite proxy in development),
// so the session cookie stays HttpOnly + SameSite and no CORS is needed.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version.split('.').slice(0, 2).join('.')) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:8000', changeOrigin: false },
      '/admin': { target: process.env.VITE_API_PROXY ?? 'http://localhost:8000', changeOrigin: false },
      '/static': { target: process.env.VITE_API_PROXY ?? 'http://localhost:8000', changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { bpmn: ['bpmn-js'], flow: ['@xyflow/react'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
});
