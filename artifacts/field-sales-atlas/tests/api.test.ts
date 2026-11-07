import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const directory = mkdtempSync(join(tmpdir(), 'atlas-api-'));
process.env.ATLAS_DATA_DIR = directory;
const { handler } = await import('../../api-server/src/field-atlas/backend/index');
const { db } = await import('../../api-server/src/field-atlas/backend/runtime/sdk');
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

test('demo creation is isolated from real workspace records and has two configured trainers', async () => {
  const original = await workspace();
  await addManager(original, 'Real Manager');
  const demo = await request('POST', '/api/demo/create', original, {});
  assert.equal(demo.status, 201);
  const sample = (await request('GET', '/api/operations', demo.data.workspaceKey)).data;
  assert.equal(sample.team.name, 'Field Sales Atlas demo');
  assert.equal(sample.managers.length, 3);
  assert.equal(sample.trainerProfiles.length, 2);
  assert.ok(sample.trainerProfiles.every((profile: { homeAirports: string[] }) => profile.homeAirports.length));
  const real = (await request('GET', '/api/operations', original)).data;
  assert.notEqual(sample.team.id, real.team.id);
  assert.deepEqual(real.managers.map((manager: { name: string }) => manager.name), ['Real Manager']);
  assert.equal(real.assignments.length, 0);
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

test('concurrent approvals with distinct IDs cannot double-book the same trainer snapshot', async () => {
  const key = await workspace(), manager = await addManager(key);
  const board = (await request('GET', '/api/operations', key)).data;
  const itinerary = { expectedRevision: board.revision, title: 'Concurrent approval', trainer: 'Trainer 1', trainerId: 'trainer_a',
    startDate: '2026-12-07', endDate: '2026-12-08', arrivalAirport: 'MCO',
    stops: [{ managerId: manager.id, stateCode: 'FL', date: '2026-12-07', startTime: '09:00', endTime: '11:00' }] };
  const results = await Promise.all([1, 2].map(() => request('POST', '/api/travel/commit', key, { ...itinerary, requestId: randomUUID() })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const fresh = (await request('GET', '/api/operations', key)).data;
  assert.equal(fresh.trips.length, 1); assert.equal(fresh.visits.length, 1);
});

test('manual visit creation also rejects a simultaneous duplicate', async () => {
  const key = await workspace(), manager = await addManager(key);
  const body = { managerId: manager.id, date: '2026-12-07', stateCode: 'FL', trainer: 'Trainer 1', status: 'Planned' };
  const results = await Promise.all([request('POST', '/api/visits', key, body), request('POST', '/api/visits', key, body)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal((await request('GET', '/api/operations', key)).data.visits.length, 1);
});

async function demoScenario() {
  const key = (await request('POST', '/api/demo/create', undefined, {})).data.workspaceKey;
  const board = (await request('GET', '/api/operations', key)).data;
  const managers = board.managers.filter((person: { baseState: string }) => person.baseState === 'FL');
  // Assign the second Florida manager to the partner to require two trainer routes.
  const second = managers[1];
  await request('PUT', '/api/managers/' + second.id, key, { ...second, trainer: 'Morgan', expectedUpdatedAt: second.updatedAt });
  const result = await request('POST', '/api/travel/scenarios', key, { managerIds: managers.map((person: { id: string }) => person.id), trainerIds: ['trainer_a', 'trainer_b'],
    startDate: '2026-12-07', endDate: '2026-12-11', arrivalAirport: 'MCO', checkPublicSources: false });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return { key, report: result.data, board };
}

test('joint preview shows evidence gaps; approval is isolated, atomic, timezone aware and replay safe', async () => {
  const { key, report } = await demoScenario();
  const option = report.scenarios[0];
  assert.equal(option.feasible, true); assert.equal(option.trainerIds.length, 2); assert.equal(option.provisional, true);
  assert.equal(option.budget.complete, false); assert.equal(option.budget.items[0].amount, null);
  assert.ok(option.gaps.some((gap: string) => gap.includes('road-routing')));
  assert.equal((await request('GET', '/api/operations', key)).data.trips.length, 0);
  const stranger = await workspace();
  const path = '/api/travel/scenarios/' + report.id + '/approve';
  assert.equal((await request('POST', path, stranger, { scenarioId: option.id, acknowledgeGaps: true })).status, 404);
  assert.equal((await request('POST', path, key, { scenarioId: option.id })).status, 400);
  const body = { scenarioId: option.id, acknowledgeGaps: true, monitor: true };
  const results = await Promise.all([request('POST', path, key, body), request('POST', path, key, body)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  const board = (await request('GET', '/api/operations', key)).data;
  assert.equal(board.trips.length, 2); assert.equal(board.visits.length, 2);
  assert.ok(board.visits.every((visit: { trainerId: string; startInstant: string; timeZone: string }) => visit.trainerId && visit.startInstant.endsWith('Z') && visit.timeZone === 'America/New_York'));
  const visit = board.visits[0];
  assert.equal((await request('PUT', '/api/visits/' + visit.id, key, { ...visit, date: '2026-12-12', expectedUpdatedAt: visit.updatedAt })).status, 409);
  assert.equal((await request('PUT', '/api/visits/' + visit.id, key, { ...visit, status: 'Completed', outcome: 'Coaching completed', expectedUpdatedAt: visit.updatedAt })).status, 200);
  const completed = (await request('GET', '/api/operations', key)).data.visits.find((row: { id: string }) => row.id === visit.id);
  assert.equal(completed.startInstant, visit.startInstant); assert.equal(completed.trainerId, visit.trainerId);
  const watches = (await request('GET', '/api/travel/reviews', key)).data.watches;
  assert.equal(watches.length, 1);
  assert.equal((await request('DELETE', '/api/travel/reviews/' + watches[0].id, stranger)).status, 404);
  assert.equal((await request('DELETE', '/api/travel/reviews/' + watches[0].id, key)).status, 200);
  assert.equal((await request('POST', path, key, { ...body, scenarioId: report.scenarios[1].id })).status, 409);
});

test('availability changes invalidate a solved preview without partial calendar writes', async () => {
  const { key, report } = await demoScenario();
  await request('POST', '/api/trainer-availability', key, { id: randomUUID(), trainerId: 'trainer_b', startDate: '2026-12-07', endDate: '2026-12-11', reason: 'Personal time', notes: '' });
  const result = await request('POST', '/api/travel/scenarios/' + report.id + '/approve', key, { scenarioId: report.scenarios[0].id, acknowledgeGaps: true });
  assert.equal(result.status, 409);
  const board = (await request('GET', '/api/operations', key)).data;
  assert.equal(board.trips.length, 0); assert.equal(board.visits.length, 0);
});

test('public-source freshness uses observation time, quarantines schema failures and retains evidence on outages', async () => {
  const { source } = await import('../../api-server/src/field-atlas/backend/providers/evidence');
  const originalFetch = globalThis.fetch;
  let mode: 'old' | 'current' | 'invalid' | 'offline' = 'old';
  globalThis.fetch = (async () => {
    if (mode === 'offline') throw new Error('offline');
    return new Response(JSON.stringify(mode === 'invalid' ? {} : { at: new Date(Date.now() - (mode === 'old' ? 86400000 : 0)).toISOString(), value: 'validated observation' }));
  }) as typeof fetch;
  try {
    const spec = { provider: 'Fixture official', subject: randomUUID(), url: 'https://official.example/fixture', kind: 'observation' as const,
      scope: 'Test source', ttlMs: 120000, maxAgeMs: 10 * 60000, version: 'test',
      parse(value: unknown) { const row = value as { at: string; value: string }; if (!row.at || !row.value) throw new Error('schema'); return { data: row.value, observedAt: row.at }; } };
    const old = await source(spec); assert.equal(old.evidence.state, 'stale');
    mode = 'current'; const freshSpec = { ...spec, subject: randomUUID() };
    const fresh = await source(freshSpec); assert.equal(fresh.evidence.state, 'current'); assert.equal(fresh.data, 'validated observation');
    const cachedSpec = { ...spec, subject: randomUUID() };
    const cached = await source(cachedSpec);
    await db.tx.update('atlas_public_evidence_v1', [{ id: cached.evidence.id, record: {
      retryAfter: new Date(Date.now() + 60000).toISOString(),
      result: { ...cached, evidence: { ...cached.evidence, expiresAt: '2000-01-01T00:00:00Z' } },
    } }], { patch: true });
    const expiredCache = await source(cachedSpec);
    assert.equal(expiredCache.evidence.state, 'stale');
    assert.match(expiredCache.evidence.limitation, /current status is unknown/i);
    mode = 'offline';
    // Expire the retry cache without modifying the validated observation timestamp.
    await db.tx.update('atlas_public_evidence_v1', [{ id: fresh.evidence.id, record: { retryAfter: '2000-01-01T00:00:00Z' } }], { patch: true });
    const outage = await source(freshSpec); assert.equal(outage.evidence.state, 'stale'); assert.equal(outage.evidence.observedAt, fresh.evidence.observedAt); assert.equal(outage.data, fresh.data);
    mode = 'invalid'; const invalid = await source({ ...spec, subject: randomUUID() }); assert.equal(invalid.evidence.state, 'unavailable'); assert.equal(invalid.data, null);
  } finally { globalThis.fetch = originalFetch; }
});

test('Canadian GeoMet observations validate the live field schema and keep empty, stale, and invalid results distinct', async () => {
  const { canadianObservations } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  let mode: 'fresh' | 'empty' | 'stale' | 'malformed' = 'fresh';
  let requestedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    if (mode === 'malformed') return new Response(JSON.stringify({ type: 'FeatureCollection', features: {} }));
    if (mode === 'empty') return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }));
    const observedAt = new Date(now - (mode === 'stale' ? 3 * 3600000 : 60000)).toISOString();
    return new Response(JSON.stringify({ type: 'FeatureCollection', features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-79.574133, 43.963525] },
      properties: { obs_date_tm: observedAt, 'date_tm-value': observedAt, 'stn_nam-value': 'KING CITY NORTH', air_temp: 9.4 },
    }] }));
  }) as typeof fetch;
  const lat = 43.6777, lon = -79.6248;
  try {
    const fresh = await canadianObservations(lat, lon);
    assert.equal(fresh.evidence.provider, 'ECCC GeoMet');
    assert.equal(fresh.evidence.state, 'current');
    assert.equal(fresh.evidence.observedAt, new Date(now - 60000).toISOString());
    assert.match(fresh.data?.[0]?.title || '', /KING CITY NORTH/);
    assert.match(new URL(requestedUrl).searchParams.get('sortby') || '', /^-/);

    mode = 'empty';
    const empty = await canadianObservations(lat + .01, lon);
    assert.equal(empty.evidence.state, 'partial');
    assert.deepEqual(empty.data, []);
    assert.match(empty.evidence.limitation, /status is unknown/i);

    mode = 'stale';
    const stale = await canadianObservations(lat + .02, lon);
    assert.equal(stale.evidence.state, 'stale');
    assert.match(stale.evidence.limitation, /current status is unknown/i);

    mode = 'malformed';
    const malformed = await canadianObservations(lat + .03, lon);
    assert.equal(malformed.evidence.state, 'unavailable');
    assert.equal(malformed.data, null);
    assert.match(malformed.evidence.limitation, /status is unknown/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('ECCC city forecasts use the nearest published city and keep missing or stale forecast coverage unknown', async () => {
  const { canadianForecast } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  let mode: 'fresh' | 'empty' | 'stale' | 'malformed' = 'fresh';
  let requestedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    if (mode === 'malformed') return new Response(JSON.stringify({ type: 'FeatureCollection', features: {} }));
    if (mode === 'empty') return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }));
    const timestamp = new Date(now - (mode === 'stale' ? 13 * 3600000 : 60000)).toISOString();
    const city = (name: string, coordinates: number[]) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {
        name: { en: name }, lastUpdated: timestamp, forecastGroup: {
          timestamp: { en: timestamp },
          forecasts: [{ period: { textForecastName: { en: 'Today' } }, textSummary: { en: `${name} forecast fixture.` } }],
        },
      },
    });
    return new Response(JSON.stringify({ type: 'FeatureCollection', features: [
      city('KING CITY', [-79.526, 43.928]),
      city('FARTHER CITY', [-78.9, 44.3]),
    ] }));
  }) as typeof fetch;
  const lat = 43.6777, lon = -79.6248;
  try {
    const fresh = await canadianForecast(lat, lon);
    assert.equal(fresh.evidence.provider, 'ECCC City Page Weather');
    assert.equal(fresh.evidence.kind, 'forecast');
    assert.equal(fresh.evidence.state, 'current');
    assert.equal(fresh.evidence.observedAt, new Date(now - 60000).toISOString());
    assert.match(fresh.data?.[0]?.detail || '', /KING CITY regional forecast/);
    assert.doesNotMatch(fresh.data?.[0]?.detail || '', /FARTHER CITY/);
    assert.match(new URL(requestedUrl).pathname, /citypageweather-realtime/);
    assert.match(fresh.evidence.scope, /regional forecast/i);
    assert.match(fresh.evidence.limitation, /period validity timestamps/i);

    mode = 'empty';
    const empty = await canadianForecast(lat + .01, lon);
    assert.equal(empty.evidence.state, 'partial');
    assert.deepEqual(empty.data, []);
    assert.match(empty.evidence.limitation, /coverage is unknown/i);

    mode = 'stale';
    const stale = await canadianForecast(lat + .02, lon);
    assert.equal(stale.evidence.state, 'stale');
    assert.match(stale.evidence.limitation, /current status is unknown/i);

    mode = 'malformed';
    const malformed = await canadianForecast(lat + .03, lon);
    assert.equal(malformed.evidence.state, 'unavailable');
    assert.equal(malformed.data, null);
    assert.match(malformed.evidence.limitation, /status is unknown/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('ECCC warning results include only unexpired active warnings and never imply an all-clear', async () => {
  const { canadianWarnings } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  let mode: 'active' | 'empty' | 'stale' | 'malformed' = 'active';
  let requestedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    if (mode === 'malformed') return new Response(JSON.stringify({ type: 'FeatureCollection', features: {} }));
    const timestamp = new Date(now - (mode === 'stale' ? 3 * 3600000 : 60000)).toISOString();
    if (mode === 'empty') return new Response(JSON.stringify({ type: 'FeatureCollection', features: [], timeStamp: timestamp }));
    const alert = (overrides: Record<string, unknown> = {}) => ({
      type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-64, 44], [-63, 44], [-63, 45], [-64, 44]]] }, properties: {
        alert_type: 'warning', status_en: 'active', alert_name_en: 'Heavy rainfall warning',
        feature_name_en: 'Example County', alert_text_en: 'Heavy rainfall is possible.',
        publication_datetime: timestamp,
        validity_datetime: new Date(now - 60000).toISOString(),
        event_end_datetime: new Date(now + 4 * 3600000).toISOString(),
        expiration_datetime: new Date(now + 3 * 3600000).toISOString(),
        ...overrides,
      },
    });
    return new Response(JSON.stringify({ type: 'FeatureCollection', timeStamp: timestamp, features: [
      alert(),
      alert({ alert_name_en: 'Expired warning', expiration_datetime: new Date(now - 1000).toISOString() }),
      alert({ alert_name_en: 'Ended warning', status_en: 'ended' }),
      alert({ alert_name_en: 'Watch, not warning', alert_type: 'watch' }),
    ] }));
  }) as typeof fetch;
  const lat = 44.2, lon = -63.6;
  try {
    const fresh = await canadianWarnings(lat, lon);
    assert.equal(fresh.evidence.provider, 'ECCC Weather Alerts');
    assert.equal(fresh.evidence.kind, 'observation');
    assert.equal(fresh.evidence.state, 'current');
    assert.equal(fresh.evidence.observedAt, new Date(now - 60000).toISOString());
    assert.equal(fresh.data?.length, 1);
    assert.match(fresh.data?.[0]?.title || '', /Example County/);
    assert.match(new URL(requestedUrl).pathname, /weather-alerts/);
    assert.equal(new URL(requestedUrl).searchParams.get('limit'), '100');
    assert.match(fresh.evidence.scope, /regional/i);

    mode = 'empty';
    const empty = await canadianWarnings(lat + .01, lon);
    assert.equal(empty.evidence.state, 'current');
    assert.deepEqual(empty.data, []);
    assert.match(empty.evidence.limitation, /not an all-clear/i);

    mode = 'stale';
    const stale = await canadianWarnings(lat + .02, lon);
    assert.equal(stale.evidence.state, 'stale');
    assert.match(stale.evidence.limitation, /current status is unknown/i);

    mode = 'malformed';
    const malformed = await canadianWarnings(lat + .03, lon);
    assert.equal(malformed.evidence.state, 'unavailable');
    assert.equal(malformed.data, null);
    assert.match(malformed.evidence.limitation, /status is unknown/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('Canadian airports request ECCC forecasts and warnings even when only the country is known', async () => {
  const { publicAirportEvidence } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.includes('/swob-realtime/')) return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }));
    if (url.includes('/citypageweather-realtime/')) return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }));
    if (url.includes('/weather-alerts/')) return new Response(JSON.stringify({ type: 'FeatureCollection', features: [], timeStamp: new Date().toISOString() }));
    throw new Error('Unexpected provider URL: ' + url);
  }) as typeof fetch;
  const unique = Number.parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) / 0xffffffff;
  const lat = 45.4 + unique / 100, lon = -75.7 - unique / 100;
  try {
    const results = await publicAirportEvidence({ iata: 'FIX', lat, lon, country: 'CA' });
    assert.deepEqual(results.map(result => result.evidence.provider).sort(), ['ECCC City Page Weather', 'ECCC GeoMet', 'ECCC Weather Alerts']);
    assert.ok(requested.some(url => url.includes('citypageweather-realtime')));
    assert.ok(requested.some(url => url.includes('weather-alerts')));
    assert.ok(requested.every(url => url.includes('api.weather.gc.ca')));
  } finally { globalThis.fetch = originalFetch; }
});

test('road matrices preserve unreachable pairs and failed providers fall back with an explicit warning', async () => {
  const { roadMatrix } = await import('../../api-server/src/field-atlas/backend/providers/routing');
  const originalFetch = globalThis.fetch, originalRouting = process.env.ATLAS_ROUTING_URL;
  process.env.ATLAS_ROUTING_URL = 'https://routing.example/';
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ code: 'Ok', durations: [[0, 120], [null, 0]], distances: [[0, 1000], [null, 0]] }))) as typeof fetch;
    const result = await roadMatrix([{ id: 'fixture1', name: 'a', lat: 28.5, lon: -81.3 }, { id: 'fixture2', name: 'b', lat: 28.6, lon: -81.4 }]);
    assert.equal(result.roadBased, true); assert.equal(result.durations[0][1], 2); assert.equal(result.durations[1][0], null);
    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    const fallback = await roadMatrix([{ id: 'fixture3', name: 'c', lat: 29.5, lon: -81.3 }, { id: 'fixture4', name: 'd', lat: 29.6, lon: -81.4 }]);
    assert.equal(fallback.roadBased, false); assert.equal(fallback.evidence.state, 'partial'); assert.match(fallback.evidence.limitation, /cannot establish/);
  } finally { globalThis.fetch = originalFetch; if (originalRouting === undefined) delete process.env.ATLAS_ROUTING_URL; else process.env.ATLAS_ROUTING_URL = originalRouting; }
});

test('expired previews are rejected and durable review failures stay incomplete without duplicate work', async () => {
  const { key, report, board } = await demoScenario();
  await db.tx.update('atlas_scenarios_' + board.team.id, [{ id: report.id, record: { report: { ...report, expiresAt: '2000-01-01T00:00:00Z' } } }], { patch: true });
  assert.equal((await request('POST', '/api/travel/scenarios/' + report.id + '/approve', key, { scenarioId: report.scenarios[0].id, acknowledgeGaps: true })).status, 409);
  const { queueWatch, runTravelReviews } = await import('../../api-server/src/field-atlas/backend/travel/watch');
  await queueWatch(board.team.id, { ...report, endDate: '2099-01-01' }, []);
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('offline'); }) as typeof fetch;
  try {
    await runTravelReviews(); const firstCalls = calls;
    const first = (await request('GET', '/api/travel/reviews', key)).data.watches[0];
    assert.equal(first.state, 'incomplete'); assert.match(first.review.message, /could not be verified/);
    await runTravelReviews(); assert.equal(calls, firstCalls);
    assert.equal((await request('GET', '/api/travel/reviews', key)).data.watches[0].review.id, first.review.id);
  } finally { globalThis.fetch = originalFetch; }
});

async function approvedAirPlan() {
  const key = (await request('POST', '/api/demo/create', undefined, {})).data.workspaceKey;
  let board = (await request('GET', '/api/operations', key)).data;
  const people = board.managers.filter((person: { baseState: string }) => person.baseState === 'FL');
  const partner = people.find((person: { name: string }) => person.name.includes('Casey'));
  await request('PUT', '/api/managers/' + partner.id, key, { ...partner, trainer: 'Morgan', expectedUpdatedAt: partner.updatedAt });
  const flights = [
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '100', origin: 'MIA', destination: 'MCO', departDate: '2026-12-07', departTime: '06:00', arriveDate: '2026-12-07', arriveTime: '07:00' },
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '101', origin: 'MCO', destination: 'MIA', departDate: '2026-12-10', departTime: '19:00', arriveDate: '2026-12-10', arriveTime: '20:00' },
    { trainerId: 'trainer_b', carrier: 'AA', flightNumber: '200', origin: 'CLT', destination: 'MCO', departDate: '2026-12-07', departTime: '06:00', arriveDate: '2026-12-07', arriveTime: '07:30' },
    { trainerId: 'trainer_b', carrier: 'AA', flightNumber: '201', origin: 'MCO', destination: 'CLT', departDate: '2026-12-10', departTime: '19:00', arriveDate: '2026-12-10', arriveTime: '20:45' },
  ];
  const report = await request('POST', '/api/travel/scenarios', key, { managerIds: people.map((person: { id: string }) => person.id), trainerIds: ['trainer_a', 'trainer_b'], startDate: '2026-12-07', endDate: '2026-12-10', arrivalAirport: 'MCO', flights });
  assert.equal(report.status, 201, JSON.stringify(report.data));
  const option = report.data.scenarios.find((option: { feasible: boolean }) => option.feasible); assert.ok(option);
  const approval = await request('POST', '/api/travel/scenarios/' + report.data.id + '/approve', key, { scenarioId: option.id, acknowledgeGaps: true });
  assert.equal(approval.status, 201, JSON.stringify(approval.data));
  board = (await request('GET', '/api/operations', key)).data;
  return { key, report: report.data, board, flights };
}

test('travel assistant calculates both home arrivals, cites its evidence, and never edits the calendar', async () => {
  const { key, report, board } = await approvedAirPlan();
  const answer = await request('POST', '/api/travel/assistant', key, { reportId: report.id, question: 'Can we finish these visits and get home Thursday?' });
  assert.equal(answer.status, 200, JSON.stringify(answer.data)); assert.equal(answer.data.verdict, 'provisional');
  assert.equal(answer.data.deadlineDate, '2026-12-10'); assert.equal(answer.data.trainers.length, 2);
  assert.ok(answer.data.trainers.every((trainer: { meetsDeadline: boolean }) => trainer.meetsDeadline));
  assert.equal(answer.data.trainers.find((trainer: { id: string }) => trainer.id === 'trainer_a').homeLocal, '2026-12-10 21:45');
  const evidenceIds = new Set(answer.data.evidence.map((item: { id: string }) => item.id));
  assert.ok(answer.data.claims.every((claim: { evidenceIds: string[] }) => claim.evidenceIds.length > 0 && claim.evidenceIds.every(id => evidenceIds.has(id))));
  const after = (await request('GET', '/api/operations', key)).data;
  assert.deepEqual(after.visits, board.visits); assert.equal(after.revision, board.revision);
  const late = await request('POST', '/api/travel/assistant', key, { reportId: report.id, question: 'Can we get home by 6pm Thursday?' });
  assert.equal(late.data.verdict, 'not-with-current-itinerary');
  const stranger = await workspace(); assert.equal((await request('POST', '/api/travel/assistant', stranger, { reportId: report.id, question: 'Get home Thursday' })).status, 422);
});

test('reported cancellation compares handoffs and atomically updates pending visits without inventing flights', async () => {
  const { key, report, board, flights } = await approvedAirPlan();
  const body = { id: randomUUID(), reportId: report.id, originalLeg: flights[0], status: 'canceled', checkedAt: new Date().toISOString(), notes: 'Traveler checked airline app.' };
  const change = await request('POST', '/api/travel/changes', key, body); assert.equal(change.status, 201, JSON.stringify(change.data));
  assert.equal(change.data.evidence.kind, 'traveler');
  assert.equal((await request('POST', '/api/travel/changes', key, body)).data.id, change.data.id);
  assert.deepEqual((await request('GET', '/api/operations', key)).data.visits, board.visits);
  const recovery = await request('POST', '/api/travel/recovery', key, { changeId: change.data.id, includeHandoffs: true });
  assert.equal(recovery.status, 201, JSON.stringify(recovery.data)); assert.equal(recovery.data.options.length, 2);
  assert.ok(recovery.data.impacts.some((impact: { level: string }) => impact.level === 'affected'));
  const keep = recovery.data.options[0], share = recovery.data.options[1];
  for(const option of recovery.data.options){
    const ids=new Set(option.evidence.map((item:{id:string})=>item.id));
    assert.ok(option.readiness.constraints.every((step:{evidenceIds:string[]})=>step.evidenceIds.every(id=>ids.has(id))));
  }
  assert.equal(keep.scenario.feasible, false); assert.equal(share.scenario.feasible, true);
  assert.ok(share.scenario.visits.every((visit: { trainerId: string }) => visit.trainerId === 'trainer_b'));
  const path = '/api/travel/recovery/' + recovery.data.id + '/approve';
  assert.equal((await request('POST', path, key, { optionId: share.id })).status, 409);
  const approval = await request('POST', path, key, { optionId: share.id, acknowledgeConsequences: true });
  assert.equal(approval.status, 201, JSON.stringify(approval.data));
  assert.equal((await request('POST', path, key, { optionId: share.id, acknowledgeConsequences: true })).data.replayed, true);
  const after = (await request('GET', '/api/operations', key)).data;
  assert.deepEqual(after.visits.map((visit: { id: string }) => visit.id).sort(), board.visits.map((visit: { id: string }) => visit.id).sort());
  assert.ok(after.visits.every((visit: { trainerId: string }) => visit.trainerId === 'trainer_b'));
  assert.equal(after.managers.find((person: { name: string }) => person.name.includes('Jordan')).trainer, 'Taylor');
  const planResponse = (await request('GET', '/api/travel/journeys', key)).data;
  const plans = planResponse.plans; assert.ok(plans.length, JSON.stringify(planResponse));
  assert.equal(plans[0].pendingChange, undefined);
});

test('recovery approval rejects new calendar constraints and leaves both trainers untouched', async () => {
  const { key, report, board, flights } = await approvedAirPlan();
  const change = await request('POST', '/api/travel/changes', key, { id: randomUUID(), reportId: report.id, originalLeg: flights[0], status: 'canceled', checkedAt: new Date().toISOString() });
  const recovery = await request('POST', '/api/travel/recovery', key, { changeId: change.data.id, includeHandoffs: true });
  assert.equal(recovery.status, 201, JSON.stringify(recovery.data));
  await request('POST', '/api/trainer-availability', key, { id: randomUUID(), trainerId: 'trainer_b', startDate: '2026-12-07', endDate: '2026-12-10', reason: 'Personal time', notes: '' });
  const result = await request('POST', '/api/travel/recovery/' + recovery.data.id + '/approve', key, { optionId: recovery.data.options[1].id, acknowledgeConsequences: true });
  assert.equal(result.status, 409); assert.deepEqual((await request('GET', '/api/operations', key)).data.visits, board.visits);
});

test('assistant reports missing return evidence and clarifies unsupported/ambiguous questions', async () => {
  const { key, report } = await demoScenario();
  const approved = await request('POST', '/api/travel/scenarios/' + report.id + '/approve', key, { scenarioId: report.scenarios[0].id, acknowledgeGaps: true });
  assert.equal(approved.status, 201);
  const answer = await request('POST', '/api/travel/assistant', key, { reportId: report.id, question: 'Can we finish these visits and get home Thursday?' });
  assert.equal(answer.status, 200, JSON.stringify(answer.data)); assert.equal(answer.data.verdict, 'unknown');
  assert.ok(answer.data.trainers.every((trainer: { meetsDeadline: boolean | null }) => trainer.meetsDeadline === null));
  assert.ok(answer.data.missing.some((item: string) => item.includes('no usable return flight')));
  const unsupported = await request('POST', '/api/travel/assistant', key, { reportId: report.id, question: 'Book a hotel for us.' });
  assert.equal(unsupported.data.verdict, 'clarification');
});

test('existing guided trips can connect to journey analysis without changing the legacy draft-plan API', async () => {
  const key = (await request('POST', '/api/demo/create', undefined, {})).data.workspaceKey;
  const board = (await request('GET', '/api/operations', key)).data;
  const person = board.managers.find((person: { name: string }) => person.name.includes('Jordan'));
  const committed = await request('POST', '/api/travel/commit', key, { requestId: randomUUID(), title: 'Existing guided trip', trainer: 'Taylor', trainerId: 'trainer_a',
    startDate: '2026-12-07', endDate: '2026-12-10', arrivalAirport: 'MCO', stops: [{ managerId: person.id, stateCode: 'FL', date: '2026-12-08', startTime: '09:00', endTime: '11:30', location: 'Orlando' }] });
  assert.equal(committed.status, 201);
  const before = (await request('GET', '/api/operations', key)).data;
  const adopted = await request('POST', '/api/travel/journeys/adopt', key, { tripIds: [committed.data.trip.id] });
  assert.equal(adopted.status, 201, JSON.stringify(adopted.data));
  const journeys = await request('GET', '/api/travel/journeys', key); assert.equal(journeys.data.plans.length, 1);
  assert.deepEqual((await request('GET', '/api/operations', key)).data.visits, before.visits);
  assert.equal((await request('GET', '/api/travel/plans', key)).data.plans.length, 0);
  const flights = [
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '1', origin: 'MIA', destination: 'MCO', departDate: '2026-12-07', departTime: '06:00', arriveDate: '2026-12-07', arriveTime: '07:00' },
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '2', origin: 'MCO', destination: 'MIA', departDate: '2026-12-10', departTime: '19:00', arriveDate: '2026-12-10', arriveTime: '20:00' },
  ];
  assert.equal((await request('POST', '/api/travel/journeys/' + adopted.data.reportId + '/itinerary', key, { flights })).status, 200);
  assert.equal((await request('GET', '/api/travel/journeys', key)).data.plans[0].flightLegs.length, 2);
});

test('live connection parsers validate source identity/validity and empty feeds cannot manufacture all-clear status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const text = String(url), now = new Date().toISOString();
    if (text.includes('airport-events')) return new Response('[]');
    if (text.includes('/metar')) return new Response(JSON.stringify([{ icaoId: 'KFIX', rawOb: 'KFIX fixture', obsTime: Date.now() / 1000 }]));
    if (text.includes('/taf')) return new Response(JSON.stringify([{ icaoId: 'KFIX', rawTAF: 'TAF fixture', issueTime: Date.now() / 1000, validTimeFrom: Date.now() / 1000, validTimeTo: Date.now() / 1000 + 7200 }]));
    return new Response(JSON.stringify({ features: [] }));
  }) as typeof fetch;
  try {
    const { faa, metar, taf, nws } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
    assert.equal((await faa('FIX')).evidence.state, 'partial');
    assert.equal((await metar('KFIX')).evidence.state, 'current');
    const forecast = await taf('KFIX'); assert.equal(forecast.evidence.state, 'current'); assert.ok(forecast.evidence.validTo);
    assert.equal((await nws(12.345, 67.891)).evidence.state, 'partial');
  } finally { globalThis.fetch = originalFetch; }
});

test('return-flight cancellation keeps field access while the assistant marks the home journey unresolved', async () => {
  const { key, report, flights } = await approvedAirPlan();
  const change = await request('POST', '/api/travel/changes', key, { id: randomUUID(), reportId: report.id, originalLeg: flights[1], status: 'canceled', checkedAt: new Date().toISOString() });
  assert.equal(change.status, 201);
  const recovery = await request('POST', '/api/travel/recovery', key, { changeId: change.data.id, includeHandoffs: false });
  assert.equal(recovery.status, 201, JSON.stringify(recovery.data)); assert.equal(recovery.data.options[0].scenario.feasible, true);
  const answer = await request('POST', '/api/travel/assistant', key, { reportId: report.id, question: 'Can we finish and get home Thursday?' });
  assert.equal(answer.status, 200, JSON.stringify(answer.data)); assert.equal(answer.data.verdict, 'unknown');
  assert.equal(answer.data.trainers.find((trainer: { id: string }) => trainer.id === 'trainer_a').meetsDeadline, null);
});

test('recovery preserves completed coaching history when only the remaining visit moves to the partner', async () => {
  const { key, report, board, flights } = await approvedAirPlan();
  const completed = board.visits.find((visit: { trainerId: string }) => visit.trainerId === 'trainer_b');
  assert.equal((await request('PUT', '/api/visits/' + completed.id, key, { ...completed, status: 'Completed', outcome: 'Done', expectedUpdatedAt: completed.updatedAt })).status, 200);
  const before = (await request('GET', '/api/operations', key)).data.visits.find((visit: { id: string }) => visit.id === completed.id);
  const change = await request('POST', '/api/travel/changes', key, { id: randomUUID(), reportId: report.id, originalLeg: flights[0], status: 'canceled', checkedAt: new Date().toISOString() });
  const recovery = await request('POST', '/api/travel/recovery', key, { changeId: change.data.id, includeHandoffs: true });
  assert.equal(recovery.status, 201, JSON.stringify(recovery.data));
  const chosen = recovery.data.options.find((option: { scenario: { feasible: boolean } }) => option.scenario.feasible); assert.ok(chosen);
  const approval = await request('POST', '/api/travel/recovery/' + recovery.data.id + '/approve', key, { optionId: chosen.id, acknowledgeConsequences: true });
  assert.equal(approval.status, 201, JSON.stringify(approval.data));
  const after = (await request('GET', '/api/operations', key)).data.visits.find((visit: { id: string }) => visit.id === completed.id);
  assert.deepEqual(after, before);
});

test('journey readiness uses both trainers and saves resource checks without editing appointments; stale updates fail', async () => {
  const {key,report,board}=await approvedAirPlan();
  const path='/api/travel/journeys/'+report.id;
  const before=await request('GET',path+'/readiness',key);
  assert.equal(before.status,200,JSON.stringify(before.data));
  assert.equal(before.data.readiness.trainers.length,2);
  assert.ok(before.data.readiness.constraints.some((item:{kind:string})=>item.kind==='visit'));
  assert.ok(before.data.readiness.constraints.some((item:{kind:string})=>item.kind==='departure'));
  assert.equal(before.data.readiness.verdict,'needs-information');
  const requirements={trainers:[
    {trainerId:'trainer_a',transport:'shared-needs-review',equipment:'ready',pickup:{date:'2026-12-07',time:'08:00',timeZone:'America/New_York',processingMinutes:90}},
    {trainerId:'trainer_b',transport:'independent',equipment:'ready'},
  ]};
  const body={requirements,expectedItineraryVersion:before.data.itineraryVersion,expectedWorkspaceRevision:before.data.workspaceRevision};
  assert.equal((await request('PUT',path+'/requirements',key,body)).status,200);
  const after=await request('GET',path+'/readiness',key);
  assert.equal(after.status,200,JSON.stringify(after.data));
  assert.equal(after.data.readiness.verdict,'attention');
  assert.equal(after.data.readiness.constraints.find((item:{kind:string})=>item.kind==='pickup').marginMinutes,-30);
  assert.ok(after.data.readiness.checks.some((item:{state:string;label:string})=>item.state==='attention'&&item.label==='Ground transport access'));
  const current=(await request('GET','/api/operations',key)).data;
  assert.deepEqual(current.visits,board.visits);
  assert.equal((await request('PUT',path+'/requirements',key,body)).status,409);
  const second=await workspace();
  assert.notEqual((await request('GET',path+'/readiness',second)).status,200);
  assert.equal((await request('GET',path+'/readiness')).status,403);
  const journeys=(await request('GET','/api/travel/journeys',key)).data.plans;
  assert.deepEqual(journeys.find((item:{id:string})=>item.id===report.id).requirements,requirements);
  const legs=journeys.find((item:{id:string})=>item.id===report.id).flightLegs;
  const replacement=legs.map((leg:{trainerId:string})=>leg.trainerId==='trainer_a'?{...leg,departTime:'05:30'}:leg);
  assert.equal((await request('POST',path+'/itinerary',key,{flights:replacement,expectedItineraryVersion:after.data.itineraryVersion})).status,200);
  const revised=(await request('GET',path+'/readiness',key)).data;
  assert.equal(revised.requirements.trainers[0].equipment,'unknown');
  assert.equal(revised.requirements.trainers[0].transport,'shared-needs-review');
  assert.equal(revised.requirements.trainers[1].transport,'independent');
});

test('readiness input rejects future verification, uses exact zones and guards replacement against stale itinerary versions', async () => {
  const {key,report,flights}=await approvedAirPlan();
  const invalid=await request('POST','/api/travel/itinerary/readiness',key,{flights:[{...flights[0],review:{airlineCheckedAt:'2099-01-01T00:00:00Z'}}]});
  assert.equal(invalid.status,400);
  const dated={...flights[0],origin:'NRT',destination:'HNL',departDate:'2026-12-08',departTime:'00:30',arriveDate:'2026-12-07',arriveTime:'13:30',departureZone:'Asia/Tokyo',arrivalZone:'Pacific/Honolulu'};
  const result=await request('POST','/api/travel/itinerary/readiness',key,{flights:[dated]});
  assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.flights[0].arrivalZone,'Pacific/Honolulu');
  const path='/api/travel/journeys/'+report.id;
  const snapshot=(await request('GET',path+'/readiness',key)).data;
  const updated=flights.map((flight:Record<string,unknown>,index:number)=>({...flight,...(index===0?{departTime:'05:30'}:{})}));
  assert.equal((await request('POST',path+'/itinerary',key,{flights:updated,expectedItineraryVersion:snapshot.itineraryVersion})).status,200);
  assert.equal((await request('POST',path+'/itinerary',key,{flights,expectedItineraryVersion:snapshot.itineraryVersion})).status,409);
});

test('Canadian observations use actual GeoMet fields, reject old/future times and preserve the oldest included observation', async () => {
  const {parseCanadianObservations}=await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
  const now=Date.parse('2026-11-06T12:00:00Z');
  const feature=(time:string,name:string)=>({properties:{obs_date_tm:time,'stn_nam-value':name}});
  const data=parseCanadianObservations({features:[feature('2026-11-06T11:50:00Z','Toronto'),feature('2026-11-06T11:40:00Z','Nearby'),feature('2020-01-01T00:00:00Z','Old'),feature('2026-11-06T13:00:00Z','Future')]},now);
  assert.equal(data.data.length,2);assert.equal(data.data[0].title,'Toronto');assert.equal(data.observedAt,'2026-11-06T11:40:00.000Z');
  assert.throws(()=>parseCanadianObservations({features:[feature('2020-01-01T00:00:00Z','Old')]},now),/No recent/);
});

test('recovery refuses a known missed pickup deadline and preserves the calendar',async()=>{
  const {key,report,flights}=await approvedAirPlan(),path='/api/travel/journeys/'+report.id;
  const initial=(await request('GET',path+'/readiness',key)).data;
  assert.equal((await request('PUT',path+'/requirements',key,{expectedItineraryVersion:initial.itineraryVersion,expectedWorkspaceRevision:initial.workspaceRevision,requirements:{trainers:[{trainerId:'trainer_a',transport:'independent',equipment:'ready',pickup:{date:'2026-12-07',time:'08:00',timeZone:'America/New_York',processingMinutes:90}}]}})).status,200);
  const before=(await request('GET','/api/operations',key)).data;
  const change=await request('POST','/api/travel/changes',key,{id:randomUUID(),reportId:report.id,originalLeg:flights[1],replacementLeg:{...flights[1],departTime:'20:00',arriveTime:'21:00'},status:'delayed',checkedAt:new Date().toISOString(),notes:''});
  assert.equal(change.status,201,JSON.stringify(change.data));
  const preview=await request('POST','/api/travel/recovery',key,{changeId:change.data.id,includeHandoffs:false});
  assert.equal(preview.status,201,JSON.stringify(preview.data));assert.equal(preview.data.options[0].scenario.feasible,true);
  const approve=await request('POST','/api/travel/recovery/'+preview.data.id+'/approve',key,{optionId:preview.data.options[0].id,acknowledgeConsequences:true});
  assert.equal(approve.status,409);assert.match(approve.data.error,/journey requirement/);
  assert.deepEqual((await request('GET','/api/operations',key)).data.visits,before.visits);
});
