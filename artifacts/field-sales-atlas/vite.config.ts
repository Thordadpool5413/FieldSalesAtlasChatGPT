import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Keep Vite's local artifact build aligned with the static directory
  // declared by .replit-artifact/artifact.toml.
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist/public',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
    },
  },
  // The API runs as a neighboring artifact during local development. Keep
  // the production browser contract same-origin (/api) and forward Vite's
  // development requests to that service, including long-lived SSE streams.
  server: {
    port: Number(process.env.PORT || 24397),
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.FIELD_ATLAS_API_ORIGIN || 'http://127.0.0.1:8080',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  preview: {
    port: Number(process.env.PORT || 24397),
    strictPort: true,
    host: '0.0.0.0',
  },
});
