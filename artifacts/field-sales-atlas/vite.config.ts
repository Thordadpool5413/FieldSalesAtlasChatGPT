import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIdentity } from '../../scripts/build-identity.mjs';

export default defineConfig({
  plugins: [react(), {
    name: 'atlas-build-identity',
    configureServer(server) {
      server.middlewares.use('/build-info.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(buildIdentity(server.config.root, 'development')));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/build-info.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try { res.end(readFileSync(resolve(server.config.root, server.config.build.outDir, 'build-info.json'), 'utf8')); }
        catch { res.statusCode = 503; res.end(JSON.stringify({ app: 'Field Sales Atlas', revision: null, builtAt: null, mode: 'unavailable', limitation: 'Build metadata is missing. Rebuild the web application.' })); }
      });
    },
  }],
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
