import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { pipeline } from 'node:stream/promises';
import { openEvents, closeEvents } from '../backend/runtime/events';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
const production = process.argv.includes('--production');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);
const { handler, refreshPublicSourceStatus } = await import('../backend/index');
const { db } = await import('../backend/runtime/sdk');
const dist = resolve(root, 'dist');
if (production && !existsSync(resolve(dist, 'index.html'))) throw new Error('Run npm run build before npm start.');

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

async function apiRequest(request: IncomingMessage, response: ServerResponse, pathname: string) {
  const method = request.method || 'GET';
  const origin = request.headers.origin;
  if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && new URL(origin).host !== request.headers.host)) {
    response.writeHead(403).end('Cross-site API access is not allowed.');
    return;
  }
  if (pathname === '/api/events' && method === 'GET') { openEvents(response); return; }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) { response.writeHead(413).end('Request body too large.'); return; }
    chunks.push(Buffer.from(chunk));
  }
  // Use a fixed internal origin: API routing only depends on method/path, never the Host header.
  const result = await handler(new Request(new URL(request.url || '/', 'http://localhost'), {
    method, ...(chunks.length && !['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}),
  }));
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400).end(); return; }
  let file = resolve(dist, '.' + decoded);
  if (!file.startsWith(dist + sep) && file !== dist) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(decoded)) { response.writeHead(404).end('File not found.'); return; }
    file = resolve(dist, 'index.html');
  }
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  response.setHeader('Cache-Control', file.startsWith(resolve(dist, 'assets') + sep) ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (request.method === 'HEAD') { response.end(); return; }
  await pipeline(createReadStream(file), response);
}

const server = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const work = pathname.startsWith('/api/')
    ? apiRequest(request, response, pathname)
    : production ? serveStatic(request, response, pathname)
      : new Promise<void>(resolveRequest => vite!.middlewares(request, response, () => { response.writeHead(404).end(); resolveRequest(); }));
  void work.catch(() => {
    console.error('HTTP request could not be completed.');
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;

const vite = production ? null : await (await import('vite')).createServer({
  root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa',
});

// Preserve the export's daily 06:00 America/New_York public-source health check.
let lastScan = '';
let scanning = false;
const schedule = setInterval(() => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour !== '06' || parts.minute !== '00' || day === lastScan || scanning) return;
  lastScan = day;
  scanning = true;
  const now = new Date().toISOString();
  void refreshPublicSourceStatus({ type: 'cron', name: 'field-atlas-daily-source-health', scheduledTime: now, invokedTime: now })
    .finally(() => { scanning = false; });
}, 30000);
schedule.unref();

server.listen(port, host, () => console.log(`Field Sales Atlas listening on ${host}:${port} (${production ? 'production' : 'development'})`));
server.on('error', failure => { console.error(failure.message); process.exitCode = 1; });
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(schedule);
  closeEvents();
  server.close(() => { void vite?.close().finally(() => { db.close(); }); if (!vite) db.close(); });
  setTimeout(() => process.exit(), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
