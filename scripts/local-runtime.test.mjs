import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: server.address().port, close: () => new Promise(resolve => server.close(resolve)), server };
}

function start(webPort, apiPort, dataDirectory) {
  const child = spawn(process.execPath, ['scripts/start-local.mjs', '--preview'], {
    cwd: root,
    env: { ...process.env, PORT: String(webPort), ATLAS_API_PORT: String(apiPort), ATLAS_DATA_DIR: dataDirectory, ATLAS_MAINTENANCE_TOKEN: "runtime-test-token-with-at-least-thirty-two-characters" },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = once(child, 'exit');
  return { child, exited, output: () => output };
}

async function ready(runtime, url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(runtime.child.exitCode, null, runtime.output());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(400) });
      if (response.ok) return;
    } catch { /* Service is still starting. */ }
    await delay(100);
  }
  assert.fail(`Runtime did not become ready.\n${runtime.output()}`);
}

async function stopped(runtime) {
  let timer;
  try {
    return await Promise.race([
      runtime.exited,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Runtime did not stop.\n${runtime.output()}`)), 12000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function portClosed(port) {
  const check = net.createServer();
  check.listen(port, '127.0.0.1');
  await once(check, 'listening');
  await new Promise(resolve => check.close(resolve));
}

test('combined preview serves the built UI and API, preserves records, and stops both services', { timeout: 60000 }, async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'atlas-runtime-'));
  const web = await reservePort(), api = await reservePort();
  await web.close(); await api.close();
  let runtime;
  const base = `http://127.0.0.1:${web.port}`;
  try {
    runtime = start(web.port, api.port, dataDirectory);
    await ready(runtime, `${base}/api/_healthcheck`);
    assert.match(await (await fetch(base)).text(), /Field Sales Atlas/);
    const build = await fetch(`${base}/build-info.json`);
    assert.match(build.headers.get('content-type'), /application\/json/);
    const info = await build.json();
    assert.equal(info.app, 'Field Sales Atlas');
    assert.ok(info.revision === null || /^[a-f0-9]{40}$/.test(info.revision));
    assert.ok(Number.isFinite(Date.parse(info.builtAt)));
    const backendInfo = await (await fetch(`${base}/api/build-info`)).json();
    assert.equal(backendInfo.mode, 'build');
    assert.match(backendInfo.revision, /^[a-f0-9]{40}$/);
    const contract = await (await fetch(`${base}/api/openapi.json`)).json();
    assert.ok(contract.paths['/api/operations']);
    assert.deepEqual(contract.paths['/api/operations'].get.security, [{ workspaceLink: [] }]);
    const maintenance = await fetch(`${base}/api/maintenance/run`, { method: 'POST', headers: { Authorization: 'Bearer incorrect' } });
    assert.equal(maintenance.status, 403);


    const created = await fetch(`${base}/api/guest/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(created.status, 201);
    const { workspaceKey } = await created.json();
    const saved = await fetch(`${base}/api/managers?workspaceKey=${workspaceKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Runtime persistence check', baseState: 'FL' }),
    });
    assert.equal(saved.status, 201);
    runtime.child.kill('SIGTERM');
    assert.equal((await stopped(runtime))[0], 0, runtime.output());
    await portClosed(web.port); await portClosed(api.port);

    runtime = start(web.port, api.port, dataDirectory);
    await ready(runtime, `${base}/api/_healthcheck`);
    const records = await (await fetch(`${base}/api/operations?workspaceKey=${workspaceKey}`)).json();
    assert.ok(records.managers.some(manager => manager.name === 'Runtime persistence check'));
  } finally {
    if (runtime && runtime.child.exitCode === null) { runtime.child.kill('SIGTERM'); await stopped(runtime); }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('a service startup failure stops its companion and leaves the occupied port alone', { timeout: 30000 }, async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'atlas-runtime-failure-'));
  const occupied = await reservePort(), web = await reservePort();
  await web.close();
  const runtime = start(web.port, occupied.port, dataDirectory);
  try {
    const [code] = await stopped(runtime);
    assert.notEqual(code, 0, runtime.output());
    assert.equal(occupied.server.listening, true);
    await portClosed(web.port);
  } finally {
    if (runtime.child.exitCode === null) { runtime.child.kill('SIGTERM'); await stopped(runtime); }
    await occupied.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('online SQLite backup preserves WAL records and the restore verifier rejects tampering', { timeout: 20000 }, async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { execFileSync } = await import('node:child_process');
  const { readFile, writeFile } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'atlas-backup-test-'));
  const source = join(directory, 'source'), target = join(directory, 'backups');
  const { mkdir } = await import('node:fs/promises'); await mkdir(source);
  const connection = new DatabaseSync(join(source, 'atlas.sqlite'));
  try {
    connection.exec("PRAGMA journal_mode=WAL; CREATE TABLE records(collection TEXT,id TEXT,document TEXT); INSERT INTO records VALUES ('fixture','1','{\"saved\":true}');");
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/backup-data.mjs', target], { cwd: root, env: { ...process.env, ATLAS_DATA_DIR: source }, encoding: 'utf8' }));
    const restored = new DatabaseSync(join(result.directory, 'atlas.sqlite'), { readOnly: true });
    try { assert.equal(restored.prepare('SELECT document FROM records').get().document, '{"saved":true}'); } finally { restored.close(); }
    const check = JSON.parse(execFileSync(process.execPath, ['scripts/verify-backup.mjs', result.directory], { cwd: root, encoding: 'utf8' }));
    assert.equal(check.state, 'restore-verified');
    const manifestPath = join(result.directory, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.files[0].sha256 = '0'.repeat(64); await writeFile(manifestPath, JSON.stringify(manifest));
    assert.throws(() => execFileSync(process.execPath, ['scripts/verify-backup.mjs', result.directory], { cwd: root, stdio: 'pipe' }), /Command failed/);
  } finally { connection.close(); await rm(directory, { recursive: true, force: true }); }
});
