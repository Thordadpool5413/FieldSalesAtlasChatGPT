import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = fileURLToPath(new URL('../artifacts/field-sales-atlas/', import.meta.url));
const apiEntry = fileURLToPath(new URL('../artifacts/api-server/dist/index.mjs', import.meta.url));
const viteEntry = fileURLToPath(new URL('../artifacts/field-sales-atlas/node_modules/vite/bin/vite.js', import.meta.url));
const preview = process.argv.includes('--preview');
const webPort = Number(process.env.PORT || 24397);
const apiPort = Number(process.env.ATLAS_API_PORT || 8080);
if (![webPort, apiPort].every(port => Number.isInteger(port) && port > 0 && port <= 65535) || webPort === apiPort) {
  console.error('PORT and ATLAS_API_PORT must be distinct valid ports.');
  process.exit(1);
}

const children = [];
const running = new Set();
let stopping = false;
let resultCode = 0;
let killTimer;

function signal(child, name) {
  if (!child.pid) return;
  try {
    child.kill(name);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  resultCode = code;
  for (const child of children) signal(child, 'SIGTERM');
  killTimer = setTimeout(() => {
    // Both service processes are direct children, so shutdown reaches them.
    for (const child of children) signal(child, 'SIGKILL');
    process.exit(resultCode);
  }, 6000);
}

function start(name, args, env, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  children.push(child);
  running.add(child);
  child.on('error', error => {
    console.error(`${name} could not start: ${error.message}`);
    running.delete(child);
    stop(1);
  });
  child.on('exit', (code, exitSignal) => {
    running.delete(child);
    if (!stopping) {
      console.error(`${name} stopped (${exitSignal || code}); stopping the other service.`);
      stop(code || 1);
    }
    if (!running.size) {
      clearTimeout(killTimer);
      process.exit(resultCode);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('API', ['--use-env-proxy', '--enable-source-maps', apiEntry], {
  PORT: String(apiPort), NODE_ENV: preview ? 'production' : 'development',
});
start('Web', [viteEntry, ...(preview ? ['preview'] : []), '--host', '0.0.0.0'], {
  PORT: String(webPort),
  FIELD_ATLAS_API_ORIGIN: `http://127.0.0.1:${apiPort}`,
}, webRoot);
console.log(`Field Sales Atlas: web port ${webPort}, API port ${apiPort}.`);
