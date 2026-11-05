import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const directory = mkdtempSync(join(tmpdir(), 'atlas-api-'));
process.env.ATLAS_DATA_DIR = directory;
const { handler } = await import('../backend/index');
const { db } = await import('../backend/runtime/sdk');
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

async function request(method: string, path: string, key?: string, body?: unknown) {
  const url = new URL(path, 'http://localhost');
  if (key) url.searchParams.set('workspaceKey', key);
  const response = await handler(new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  return { status: response.status, data: await response.json() };
}
async function workspace() {
  const result = await request('POST', '/api/guest/create', undefined, {});
  assert.equal(result.status, 201);
  assert.match(result.data.workspaceKey, /^[0-9a-f]{64}$/);
  return result.data.workspaceKey as string;
}
async function addManager(key: string, name = 'Alex Manager') {
  assert.equal((await request('POST', '/api/managers', key, { name, baseState: 'FL', trainer: 'Trainer 1' })).status, 201);
  return (await request('GET', '/api/operations', key)).data.managers[0];
}

test('health works without credentials; private API rejects missing and invalid workspace links', async () => {
  assert.equal((await request('GET', '/api/_healthcheck')).data.status, 'ready');
  assert.equal((await request('GET', '/api/operations')).status, 403);
  assert.equal((await request('GET', '/api/operations', 'f'.repeat(64))).status, 403);
  assert.equal((await request('GET', '/api/not-found')).status, 404);
  const malformed = await handler(new Request('http://localhost/api/guest/create', { method: 'POST', body: '{' }));
  assert.equal(malformed.status, 400);
});

test('workspace data is isolated and stale edits cannot overwrite a newer manager', async () => {
  const first = await workspace(), second = await workspace();
  const manager = await addManager(first);
  assert.equal((await request('GET', '/api/operations', second)).data.managers.length, 0);
  assert.equal((await request('PUT', '/api/managers/' + manager.id, second, { name: 'Cross-tenant' })).status, 404);
  const update = { ...manager, name: 'Updated Alex', expectedUpdatedAt: manager.updatedAt };
  assert.equal((await request('PUT', '/api/managers/' + manager.id, first, update)).status, 200);
  const stale = await request('PUT', '/api/managers/' + manager.id, first, { ...update, expectedUpdatedAt: '2000-01-01T00:00:00Z' });
  assert.equal(stale.status, 409);
  assert.equal((await request('GET', '/api/operations', first)).data.managers[0].name, 'Updated Alex');
});

test('trainer invitation binds attribution, shares records, and stops working when revoked', async () => {
  const owner = await workspace();
  const invitation = await request('POST', '/api/workspace/trainer-links', owner, { seat: 'trainer_b' });
  assert.equal(invitation.status, 201);
  const guest = invitation.data.workspaceKey;
  assert.equal((await request('GET', '/api/operations?trainerId=trainer_a', guest)).data.accessSeat, 'trainer_b');
  assert.equal((await request('POST', '/api/workspace/trainer-links', guest, { seat: 'trainer_a' })).status, 403);
  await addManager(guest, 'Shared Manager');
  const board = (await request('GET', '/api/operations', owner)).data;
  assert.equal(board.managers[0].name, 'Shared Manager');
  assert.equal(board.activity.find((entry: { entity: string }) => entry.entity === 'manager').actor, 'trainer_b');
  assert.equal((await request('DELETE', '/api/workspace/trainer-links/' + invitation.data.linkId, owner)).status, 200);
  assert.equal((await request('GET', '/api/operations', guest)).status, 403);
});

test('committing an itinerary creates its trip and visit together; replay is idempotent', async () => {
  const key = await workspace(), manager = await addManager(key);
  const itinerary = {
    requestId: randomUUID(), title: 'Florida field week', trainer: 'Trainer 1',
    startDate: '2026-12-01', endDate: '2026-12-02', arrivalAirport: 'MCO',
    stops: [{ managerId: manager.id, stateCode: 'FL', date: '2026-12-01', startTime: '09:00', endTime: '11:00', location: 'Orlando' }],
  };
  assert.equal((await request('POST', '/api/travel/commit', key, itinerary)).status, 201);
  const replay = await request('POST', '/api/travel/commit', key, itinerary);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  const board = (await request('GET', '/api/operations', key)).data;
  assert.equal(board.trips.length, 1);
  assert.equal(board.visits.length, 1);
  assert.equal(board.visits[0].tripId, board.trips[0].id);
  assert.equal((await request('POST', '/api/travel/commit', key, { ...itinerary, title: 'Changed itinerary' })).status, 409);
  assert.equal((await request('DELETE', '/api/trips/' + board.trips[0].id, key)).status, 200);
  const after = (await request('GET', '/api/operations', key)).data;
  assert.equal(after.trips.length, 0);
  assert.equal(after.visits[0].status, 'Canceled');
});

test('availability blocks are idempotent and prevent scheduling an unavailable trainer', async () => {
  const key = await workspace(), manager = await addManager(key);
  const block = { id: randomUUID(), trainerId: 'trainer_a', startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Personal time', notes: '' };
  assert.equal((await request('POST', '/api/trainer-availability', key, block)).status, 201);
  assert.equal((await request('POST', '/api/trainer-availability', key, block)).data.replayed, true);
  const result = await request('POST', '/api/travel/commit', key, {
    requestId: randomUUID(), title: 'Blocked trip', trainer: 'Trainer 1',
    startDate: block.startDate, endDate: block.endDate, arrivalAirport: 'MCO',
    stops: [{ managerId: manager.id, stateCode: 'FL', date: block.startDate, startTime: '09:00', endTime: '11:00' }],
  });
  assert.equal(result.status, 409);
  assert.equal((await request('GET', '/api/operations', key)).data.trips.length, 0);
});

test('backup export excludes capability keys and restores into a separate workspace', async () => {
  const key = await workspace();
  await addManager(key);
  const backup = (await request('GET', '/api/backup/export', key)).data;
  assert.equal(backup.format, 'field-sales-atlas-operations-backup');
  assert.ok(!JSON.stringify(backup).includes(key));
  const started = await request('POST', '/api/backup/restore/start', key, { format: backup.format, schemaVersion: 2, sessionId: randomUUID(), counts: backup.counts, sourceHash: 'a'.repeat(64) });
  assert.equal(started.status, 201, JSON.stringify(started.data));
  const sessionId = started.data.sessionId;
  for (const [category, records] of Object.entries(backup.records)) {
    if (!(records as unknown[]).length) continue;
    const chunk = await request('POST', '/api/backup/restore/chunk', key, { sessionId, category, index: 0, records });
    assert.equal(chunk.status, 200, JSON.stringify(chunk.data));
  }
  const finished = await request('POST', '/api/backup/restore/finish', key, { sessionId });
  assert.equal(finished.status, 200, JSON.stringify(finished.data));
  assert.notEqual(finished.data.workspaceKey, key);
  const restored = (await request('GET', '/api/operations', finished.data.workspaceKey)).data;
  const original = (await request('GET', '/api/operations', key)).data;
  assert.notEqual(restored.team.id, original.team.id);
  assert.equal(restored.managers[0].name, original.managers[0].name);
});
