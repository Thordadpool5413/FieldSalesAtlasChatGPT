import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const directory = mkdtempSync(join(tmpdir(), 'atlas-api-'));
process.env.ATLAS_DATA_DIR = directory;
process.env.NODE_ENV = 'test';
process.env.ATLAS_TEST_FIXTURES = '1';
const {routingFixture}=await import('./support/routing-fixture.mjs');
const testRouting=await routingFixture();
process.env.ATLAS_ROUTING_PROVIDER='osrm';
process.env.ATLAS_ROUTING_URL=testRouting.origin;
let cleanPostgres: (() => Promise<void>) | undefined;
if (process.env.ATLAS_DATABASE_ENGINE === 'postgres') {
  if (!process.env.ATLAS_TEST_POSTGRES_URL) throw Error('PostgreSQL API tests require ATLAS_TEST_POSTGRES_URL for an isolated test schema.');
  const { createPostgresPool } = await import('../../../lib/db/src/driver');
  const admin = createPostgresPool({ connectionString: process.env.ATLAS_TEST_POSTGRES_URL });
  const schema = 'atlas_api_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.ATLAS_TEST_POSTGRES_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  process.env.DATABASE_URL = url.toString();
  cleanPostgres = async () => { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); };
}
const { handler } = await import('../../api-server/src/field-atlas/backend/index');
const { db } = await import('../../api-server/src/field-atlas/backend/runtime/sdk');
const {seedTestReference}=await import('./support/seed-reference');
await seedTestReference();
after(async () => { await db.close(); await cleanPostgres?.(); await testRouting.close(); rmSync(directory, { recursive: true, force: true }); });

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

test('airport brief selects country products, preserves normalized evidence and enforces workspace access', async () => {
  const key = await workspace();
  assert.equal((await request('GET', '/api/travel/airports/YYZ/brief')).status, 403);
  assert.equal((await request('GET', '/api/travel/airports/bad-code/brief', key)).status, 400);
  const [head] = await db.get<{ checksum: string }>('atlas_airport_reference_global', ['_head']);
  const checksum = head?.checksum || 'brief-fixture';
  if (!head) await db.tx.update('atlas_airport_reference_global', [{ id: '_head', record: { checksum, count: 2, retrievedAt: new Date().toISOString() } }]);
  await db.tx.update('atlas_airport_reference_global', ['CA', 'US'].map((country, index) => ({ id: index ? 'XUS' : 'XCA', record: {
    iata: index ? 'XUS' : 'XCA', name: country + ' fixture airport', icao: index ? 'KXUS' : 'CXCA', country,
    state: index ? 'FL' : 'ON', lat: index ? 28.432 : 43.831, lon: index ? -81.312 : -79.613, referenceVersion: checksum,
  } })));
  const original = globalThis.fetch, calls: string[] = [], now = new Date().toISOString();
  globalThis.fetch = async input => {
    const url = new URL(String(input)); calls.push(url.href);
    if (url.pathname.endsWith('/metar')) return new Response(JSON.stringify([{ icaoId: url.searchParams.get('ids'), obsTime: now, rawOb: 'METAR fixture', fltCat: 'IFR' }]));
    if (url.pathname.endsWith('/taf')) return new Response(JSON.stringify([{ icaoId: url.searchParams.get('ids'), issueTime: now, rawTAF: 'TAF fixture', validTimeFrom: now, validTimeTo: new Date(Date.now() + 3600000).toISOString() }]));
    if (url.pathname.includes('swob-realtime')) return new Response(JSON.stringify({ features: [{ properties: { obs_date_tm: now, stn_nam: 'Regional fixture' } }] }));
    if (url.pathname.includes('citypageweather-realtime')) return new Response(JSON.stringify({ features: [{ geometry: { type: 'Point', coordinates: [-79.61, 43.83] }, properties: {
      name: { en: 'Test City' }, forecastGroup: { timestamp: now, forecasts: [{ period: { textForecastName: { en: 'Tonight' } }, textSummary: { en: 'Regional snow showers.' } }] },
    } }] }));
    if (url.pathname.includes('weather-alerts')) return new Response(JSON.stringify({ timeStamp: now, features: [] }));
    if (url.hostname === 'nasstatus.faa.gov') return new Response(JSON.stringify([{ airportId: 'XUS', sourceTimeStamp: now }]));
    if (url.pathname.startsWith('/alerts/')) return new Response(JSON.stringify({ updated: now, features: [] }));
    if (url.pathname.startsWith('/points/')) return new Response(JSON.stringify({ properties: { forecast: 'https://api.weather.gov/gridpoints/TEST/1,1/forecast', timeZone: 'America/New_York' } }));
    if (url.pathname.endsWith('/forecast')) return new Response(JSON.stringify({ properties: { updateTime: now, periods: [{ number: 1, name: 'Today', startTime: now, endTime: new Date(Date.now() + 3600000).toISOString(), detailedForecast: 'Sunny.', shortForecast: 'Sunny' }] } }));
    throw Error('Unexpected URL ' + url.hostname);
  };
  try {
    const ca = await request('GET', '/api/travel/airports/XCA/brief', key);
    assert.equal(ca.status, 200); assert.equal(ca.data.airport.country, 'CA');
    assert.deepEqual(ca.data.products.map((row: { evidence: { provider: string } }) => row.evidence.provider), ['NOAA Aviation Weather', 'NOAA TAF', 'ECCC GeoMet', 'ECCC City Page Weather', 'ECCC Weather Alerts']);
    assert.ok(ca.data.products.every((row: { evidence: { state: string } }) => row.evidence.state === 'current'));
    assert.ok(calls.every(url => !url.includes('api.weather.gov') && !url.includes('nasstatus.faa.gov')));
    const us = await request('GET', '/api/travel/airports/XUS/brief', key);
    assert.equal(us.status, 200);
    assert.ok(us.data.products.some((row: { evidence: { provider: string } }) => row.evidence.provider === 'NWS alerts'));
    assert.ok(!us.data.products.some((row: { evidence: { provider: string } }) => row.evidence.provider.startsWith('ECCC')));
    assert.equal((await request('GET', '/api/travel/airports/ZZZ/brief', key)).status, 404);
  } finally {
    globalThis.fetch = original;
    await db.delete('atlas_airport_reference_global', ['XCA', 'XUS', ...(!head ? ['_head'] : [])]);
  }
});

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
  const demo = await request('POST', '/api/testing/workspace', original, {});
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

test('normal runtimes expose no demo creation or fixture records and new workspaces remain empty',async()=>{
  const fixture=await request('POST','/api/testing/workspace',undefined,{});
  const previous=process.env.ATLAS_TEST_FIXTURES;
  process.env.ATLAS_TEST_FIXTURES='0';
  try{
    assert.equal((await request('POST','/api/demo/create',undefined,{})).status,410);
    assert.equal((await request('POST','/api/testing/workspace',undefined,{})).status,404);
    assert.equal((await request('GET','/api/operations',fixture.data.workspaceKey)).status,410);
    const board=(await request('GET','/api/operations',await workspace())).data;
    for(const field of ['managers','visits','assignments','coaching','trips'])assert.equal(board[field].length,0);
    assert.ok(board.trainerProfiles.every((profile:{homeAirports:string[];homeDriveMinutes:Record<string,number>})=>profile.homeAirports.length===0&&Object.keys(profile.homeDriveMinutes).length===0));
  }finally{process.env.ATLAS_TEST_FIXTURES=previous;}
});

test('travel preference updates preserve an unknown home-drive time rather than manufacturing zero',async()=>{
  const key=await workspace();
  const response=await request('PUT','/api/travel/preferences?slot=trainer_a',key,{homeAirports:['MCO','MIA'],homeDriveMinutes:{MIA:35},roadMultiplier:1.3,assumedRoadMph:47});
  assert.equal(response.status,200);assert.deepEqual(response.data.preferences.homeDriveMinutes,{MIA:35});
  assert.equal('roadMultiplier' in response.data.preferences,false);assert.equal('assumedRoadMph' in response.data.preferences,false);
});

test('road comparisons use saved workspace locations and unknown road routes produce no timing recommendations',async()=>{
  const key=(await request('POST','/api/testing/workspace',undefined,{})).data.workspaceKey;
  const board=(await request('GET','/api/operations',key)).data;
  const managerIds=board.managers.filter((person:{baseState:string})=>person.baseState==='FL').map((person:{id:string})=>person.id);
  const body={managerIds,airportCodes:['MCO']};
  assert.equal((await request('POST','/api/travel/road-planning',undefined,body)).status,403);
  assert.equal((await request('POST','/api/travel/road-planning',await workspace(),body)).status,422);
  const working=await request('POST','/api/travel/road-planning',key,body);
  assert.equal(working.status,200);assert.equal(working.data.available,true);assert.equal(working.data.network.matrix.roadBased,true);
  assert.ok(working.data.gateways.every((gateway:{planningDriveMinutes:number;firstLegMinutes:number})=>gateway.planningDriveMinutes>0&&gateway.firstLegMinutes>0));
  const previous=process.env.ATLAS_ROUTING_URL;process.env.ATLAS_ROUTING_URL=testRouting.origin+'/unavailable-fixture';
  try{
    const failed=await request('POST','/api/travel/road-planning',key,body);
    assert.equal(failed.status,200);assert.equal(failed.data.available,false);assert.deepEqual(failed.data.gateways,[]);
    const scenario=await request('POST','/api/travel/scenarios',key,{...body,trainerIds:['trainer_a'],startDate:'2026-12-07',endDate:'2026-12-08',arrivalAirport:'MCO'});
    assert.equal(scenario.status,201);assert.equal(scenario.data.routingVerified,false);assert.ok(scenario.data.scenarios.every((option:{feasible:boolean;visits:unknown[]})=>!option.feasible&&option.visits.length===0));
  }finally{process.env.ATLAS_ROUTING_URL=previous;}
});

test('checkpoint history preserves validated historical rows through outages and never manufactures a missing percentile',async()=>{
  const {securityHistory}=await import('../../api-server/src/field-atlas/backend/securityHistory');
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async input=>{
    if(!String(input).startsWith('https://datasets-server.huggingface.co/'))throw Error('Published archive unavailable in isolated fallback contract');
    calls++;
    const queue=String(input).includes('precheck')?'precheck':'standard';
    const row={airport:'MCO',queue_type:queue,terminal:'A',p50_wait:0,p75_wait:10,p95_wait:null,hour_et:'2026-11-01T08:00:00-05:00'};
    return new Response(JSON.stringify({rows:[{row},{row:{...row,terminal:'bad',p50_wait:''}},{row:{...row,hour_et:'invalid'}}]}));
  };
  try{
    const first=await securityHistory('MCO','2026-11-15',8);
    assert.equal(first.available,true);assert.equal(first.state,'historical');assert.equal(first.rows.length,2);
    assert.ok(first.rows.every(row=>row.historicalMedianPosted===0&&row.typicalHourlyP95===null&&row.hourRecords===1));
    const cached=await securityHistory('MCO','2026-11-22',8);assert.equal(calls,2);assert.equal(cached.localDate,'2026-11-22');
    const stored=await db.list<{id:string;result:{etWeekday:number;etHour:number}}>('atlas_checkpoint_history_v3');
    const receipt=stored.items.find(row=>row.result?.etWeekday===0&&row.result.etHour===8)!;assert.ok(receipt);
    await db.tx.update('atlas_checkpoint_history_v3',[{id:receipt.id,record:{retryAfter:'2000-01-01T00:00:00Z'}}],{patch:true});
    globalThis.fetch=async()=>{throw Error('Checkpoint archive unavailable');};
    const stale=await securityHistory('MCO','2026-11-29',8);
    assert.equal(stale.available,true);assert.equal(stale.state,'stale');assert.equal(stale.checkedAt,first.checkedAt);
    assert.deepEqual(stale.rows,first.rows);assert.match(stale.message,/previously validated historical/);
  }finally{globalThis.fetch=original;}
});

test('checkpoint history refuses an ambiguous daylight-saving hour without fetching guessed records',async()=>{
  const {securityHistory}=await import('../../api-server/src/field-atlas/backend/securityHistory');
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No request should be made for an ambiguous hour');};
  try{
    const result=await securityHistory('MCO','2026-11-01',1);
    assert.equal(result.available,false);assert.equal(result.rows.length,0);assert.match(result.message,/ambiguous.*daylight-saving/);
  }finally{globalThis.fetch=original;}
});

test('unsupported checkpoint airports use the same validated response contract and an empty hour never becomes midnight',async()=>{
  const key=await workspace();
  for(const query of ['','&hour='])assert.equal((await request('GET','/api/travel/security-history?airport=YYZ&date=2026-12-03'+query,key)).status,400);
  const response=await request('GET','/api/travel/security-history?airport=YYZ&date=2026-12-03&hour=8',key);
  const {securityHistorySchema}=await import('../src/SecurityHistoryData');
  assert.equal(response.status,200);assert.equal(securityHistorySchema.safeParse(response.data).success,true);
  assert.equal(response.data.available,false);assert.equal(response.data.localDate,'2026-12-03');assert.equal(response.data.localHour,8);assert.deepEqual(response.data.rows,[]);
});

test('checkpoint upgrades retry legacy failures instead of hiding the repaired source until an old cooldown expires',async()=>{
  const {securityHistory}=await import('../../api-server/src/field-atlas/backend/securityHistory');
  const id=createHash('sha256').update('checkpoint-v3|MCO|6|14').digest('hex');
  await db.tx.update('atlas_checkpoint_history_v3',[{id,record:{queryVersion:3,retryAfter:new Date(Date.now()+86400000).toISOString(),lastFailure:{available:false,message:'Previous strategy failed'}}}]);
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(String(input));if(url.hostname!=='datasets-server.huggingface.co')throw Error('Use isolated viewer contract');
    const queue=url.searchParams.get('where')!.includes('precheck')?'precheck':'standard';
    return new Response(JSON.stringify({rows:[{row:{airport:'MCO',queue_type:queue,terminal:'Recovery contract',hour_et:'2026-11-07T14:00:00',p50_wait:10,p75_wait:15,p95_wait:null}}]}));
  };
  try{
    const recovered=await securityHistory('MCO','2026-11-14',14);
    assert.equal(recovered.available,true);assert.equal(recovered.rows.length,2);
    const [saved]=await db.get<{queryVersion:number}>('atlas_checkpoint_history_v3',[id]);assert.equal(saved!.queryVersion,4);
  }finally{globalThis.fetch=original;}
});

test('checkpoint percentiles keep their own coverage when only part of the historical sample reports p95',async()=>{
  const {securityHistory}=await import('../../api-server/src/field-atlas/backend/securityHistory');
  const {securityHistorySchema}=await import('../src/SecurityHistoryData');
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(String(input));if(url.hostname!=='datasets-server.huggingface.co')throw Error('Use isolated archive contract');
    const queue=url.searchParams.get('where')!.includes('precheck')?'precheck':'standard';
    return new Response(JSON.stringify({rows:[
      {hour_et:'2026-11-05T11:00:00',p50_wait:5,p75_wait:10,p95_wait:20},
      {hour_et:'2026-10-29T11:00:00',p50_wait:90,p75_wait:100,p95_wait:null},
      {hour_et:'2026-10-22T11:00:00',p50_wait:90,p75_wait:100,p95_wait:null},
    ].map(row=>({row:{...row,airport:'SFO',queue_type:queue,terminal:'Partial-percentile contract'}}))}));
  };
  try{
    const report=await securityHistory('SFO','2026-11-12',8);
    assert.equal(report.available,true);assert.equal(report.rows[0].hourRecords,3);
    assert.equal(report.rows[0].typicalHourlyP75,100);assert.equal(report.rows[0].typicalHourlyP95,20);assert.equal(report.rows[0].p95Records,1);
    assert.equal(securityHistorySchema.safeParse(report).success,true);
  }finally{globalThis.fetch=original;}
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
  const key = (await request('POST', '/api/testing/workspace', undefined, {})).data.workspaceKey;
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

test('journeys check every supplied itinerary airport and refresh opted-in monitoring when flights change', async () => {
  const { key, board } = await demoScenario();
  const flights = [
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '10', origin: 'MIA', destination: 'ATL', departDate: '2026-12-07', departTime: '05:00', arriveDate: '2026-12-07', arriveTime: '06:30' },
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '11', origin: 'ATL', destination: 'MCO', departDate: '2026-12-07', departTime: '08:00', arriveDate: '2026-12-07', arriveTime: '09:30' },
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '12', origin: 'MCO', destination: 'MIA', departDate: '2026-12-10', departTime: '19:00', arriveDate: '2026-12-10', arriveTime: '20:00' },
    { trainerId: 'trainer_b', carrier: 'AA', flightNumber: '20', origin: 'CLT', destination: 'MCO', departDate: '2026-12-07', departTime: '06:00', arriveDate: '2026-12-07', arriveTime: '07:30' },
  ];
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Provider outage fixture'); };
  try {
    const result = await request('POST', '/api/travel/scenarios', key, { managerIds: board.managers.filter((person: { baseState: string }) => person.baseState === 'FL').map((person: { id: string }) => person.id), trainerIds: ['trainer_a', 'trainer_b'],
      startDate: '2026-12-07', endDate: '2026-12-10', arrivalAirport: 'MCO', flights, checkPublicSources: true });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.deepEqual(new Set(result.data.checkedAirports), new Set(['MCO', 'MIA', 'ATL', 'CLT']));
    for (const code of result.data.checkedAirports) assert.ok(result.data.evidence.some((row: { provider: string; subject: string }) => row.provider === 'FAA NAS' && row.subject === code), code);
    assert.ok(result.data.scenarios[0].gaps.some((gap: string) => gap.includes('ATL: no current forecast')));
    const option = result.data.scenarios.find((row: { feasible: boolean }) => row.feasible); assert.ok(option);
    const approval = await request('POST', '/api/travel/scenarios/' + result.data.id + '/approve', key, { scenarioId: option.id, acknowledgeGaps: true, monitor: true });
    assert.equal(approval.status, 201, JSON.stringify(approval.data));
    const before = (await request('GET', '/api/travel/reviews', key)).data.watches[0];
    assert.deepEqual(new Set(before.airports), new Set(['MCO', 'MIA', 'ATL', 'CLT']));
    await db.tx.update('atlas_journey_watches_v1', [{ id: before.id, record: { airports: null } }], { patch: true });
    const { runTravelReviews } = await import('../../api-server/src/field-atlas/backend/travel/watch');
    await runTravelReviews();
    const legacyReview = (await request('GET', '/api/travel/reviews', key)).data.watches[0];
    assert.deepEqual(new Set(legacyReview.airports), new Set(['MCO', 'MIA', 'ATL', 'CLT']));
    const plans = (await request('GET', '/api/travel/journeys', key)).data.plans;
    const replaced = flights.map(flight => ({ ...flight, origin: flight.origin === 'ATL' ? 'DTW' : flight.origin, destination: flight.destination === 'ATL' ? 'DTW' : flight.destination }));
    const saved = await request('POST', '/api/travel/journeys/' + result.data.id + '/itinerary', key, { flights: replaced, expectedItineraryVersion: plans[0].itineraryVersion });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const updated = (await request('GET', '/api/travel/reviews', key)).data.watches[0];
    assert.deepEqual(new Set(updated.airports), new Set(['MCO', 'MIA', 'DTW', 'CLT']));
    assert.equal(updated.state, 'queued'); assert.equal(updated.review, null);
  } finally { globalThis.fetch = original; }
});

test('joint preview shows evidence gaps; approval is isolated, atomic, timezone aware and replay safe', async () => {
  const { key, report } = await demoScenario();
  const option = report.scenarios[0];
  assert.equal(option.feasible, true); assert.equal(option.trainerIds.length, 2); assert.equal(option.provisional, true);
  assert.equal(option.budget.complete, false); assert.equal(option.budget.items[0].amount, null);
  assert.equal(report.routingVerified,true);
  assert.ok(option.gaps.some((gap: string) => gap.includes('no imported arrival flight')));
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

test('Canadian surface measurements retain units, zero values and source quality without fabricating missing numbers', async () => {
  const { parseCanadianObservations } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
  const now = Date.now();
  const parsed = parseCanadianObservations({ features: [{ properties: { obs_date_tm: new Date(now).toISOString(), stn_nam: 'Test station',
    air_temp: 0, 'air_temp-uom': '°C', 'air_temp-qa': 100,
    rel_hum: null, 'rel_hum-uom': '%',
    avg_wnd_spd_10m_pst10mts: 23.2, 'avg_wnd_spd_10m_pst10mts-uom': 'km/h', 'avg_wnd_spd_10m_pst10mts-data_flag-value': 1,
    avg_wnd_dir_10m_pst10mts: 276, 'avg_wnd_dir_10m_pst10mts-uom': '°',
    stn_pres: 999, 'stn_pres-uom': 'hPa', 'stn_pres-qa': -1,
  } }] }, now);
  assert.match(parsed.data[0].detail, /Air temperature: 0 °C \(source quality code 100\)/);
  assert.match(parsed.data[0].detail, /10-minute mean wind: 23.2 km\/h/);
  assert.ok(!parsed.data[0].detail.includes('Relative humidity'));
  assert.ok(!parsed.data[0].detail.includes('Station pressure'));
  assert.match(parsed.limitation, /not an independent quality assessment/);
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
  const key = (await request('POST', '/api/testing/workspace', undefined, {})).data.workspaceKey;
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
  const key = (await request('POST', '/api/testing/workspace', undefined, {})).data.workspaceKey;
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

test('legacy aviation rejects another station and stale observations; full TAF survives both APIs', async () => {
  const original = globalThis.fetch;
  const longTaf = 'TAF KZZB ' + 'FM090600 22015KT P6SM SCT025 '.repeat(20) + 'TEMPO 0908/0910 3SM SHRA BKN012';
  globalThis.fetch = async input => {
    const url = String(input);
    const station = new URL(url).searchParams.get('ids');
    if (url.includes('/metar')) return new Response(JSON.stringify([{ icaoId: station === 'KZZA' ? 'KJFK' : station, rawOb: 'METAR ' + station, obsTime: Date.now() / 1000 - 4 * 3600, fltCat: 'VFR' }]));
    return new Response(JSON.stringify(station === 'KZZB' ? [{ icaoId: station, rawTAF: longTaf, issueTime: Date.now() / 1000, validTimeFrom: Date.now() / 1000, validTimeTo: Date.now() / 1000 + 7200 }] : []));
  };
  try {
    const wrong = (await request('GET', '/api/travel/aviation/KZZA')).data;
    assert.equal(wrong.available, false); assert.equal(wrong.observation, null);
    const partial = (await request('GET', '/api/travel/aviation/KZZB')).data;
    assert.equal(partial.observation, null); assert.equal(partial.forecast.raw, longTaf);
    assert.equal(partial.evidence[0].state, 'stale');
    const { taf } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
    assert.equal((await taf('KZZB')).data?.[0].detail, longTaf);
  } finally { globalThis.fetch = original; }
});

test('legacy NWS shares evidence validation and does not treat an undated empty response as clear', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ features: [] }));
  try {
    const { nwsPointAlerts } = await import('../../api-server/src/field-atlas/backend/nwsAlerts');
    const result = await nwsPointAlerts(35.111, -80.222);
    assert.equal(result.available, false); assert.equal(result.evidence?.state, 'partial');
    assert.match(result.message, /timestamp/);
    globalThis.fetch = async () => new Response(JSON.stringify({ updated: new Date().toISOString(), features: [] }));
    const published = await nwsPointAlerts(35.112, -80.223);
    assert.equal(published.available, true); assert.equal(published.evidence?.state, 'current');
    assert.match(published.evidence!.limitation, /source publication time/);
    assert.doesNotMatch(published.evidence!.limitation, /timestamp was not supplied/);
  } finally { globalThis.fetch = original; }
});

test('both NWS forecast APIs retain source fields and full detail while validating every period', async () => {
  const original = globalThis.fetch, now = Date.now(), detail = 'Full official detail. '.repeat(30);
  const offsetStart = new Date(now).toISOString().replace('Z', '+00:00');
  globalThis.fetch = async input => new Response(JSON.stringify(String(input).includes('/points/')
    ? { properties: { forecast: 'https://api.weather.gov/gridpoints/ZZZ/1,2/forecast', timeZone: 'America/New_York' } }
    : { properties: { updateTime: new Date(now).toISOString(), periods: [{ number: 1, name: 'Tonight', startTime: offsetStart, endTime: new Date(now + 3600000).toISOString(), temperature: 65, temperatureUnit: 'F', windSpeed: '5 mph', windDirection: 'NW', shortForecast: 'Clear', detailedForecast: detail }] } }));
  try {
    const { nwsForecast } = await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
    const { nwsAirportForecast } = await import('../../api-server/src/field-atlas/backend/nwsForecast');
    assert.equal((await nwsForecast(35.333, -80.444)).data?.[0].detail, detail);
    const legacy = await nwsAirportForecast(35.333, -80.444);
    assert.equal(legacy.available, true); assert.equal(legacy.periods[0].temperature, 65);
    assert.equal(legacy.periods[0].startTime, offsetStart);
    assert.equal(legacy.evidence?.state, 'current'); assert.equal(legacy.timeZone, 'America/New_York');
  } finally { globalThis.fetch = original; }
});

test('airport snapshot migration joins map and planner and preserves staleness on repeated reads', async () => {
  const key = await workspace();
  const original = globalThis.fetch;
  const codes = Array.from({ length: 150 }, (_, i) => 'Q' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26));
  const rows = codes.map(iata => ({ iata, name: iata + ' fixture', lat: 28, lon: -81, state: 'FL', country: 'US', icao: 'K' + iata, scheduled: true, tier: 'Major' }));
  const checkedAt = '2000-01-01T00:00:00.000Z';
  const legacy = 'atlas_public_airports_snapshot', canonical = 'atlas_airport_reference_global';
  await db.delete(canonical,['_head','_refresh']);
  await db.tx.update(legacy, [
    { id: 'head', record: { revision: 'fixture', checkedAt, count: rows.length, chunks: 2 } },
    { id: 'part_0', record: { revision: 'fixture', airports: rows.slice(0, 80) } },
    { id: 'part_1', record: { revision: 'fixture', airports: rows.slice(80) } },
  ]);
  globalThis.fetch = async () => { throw new Error('Offline fixture'); };
  try {
    const first = (await request('GET', '/api/airports/curated', key)).data;
    const second = (await request('GET', '/api/airports/curated', key)).data;
    assert.equal(first.stale, true); assert.equal(second.stale, true);
    assert.equal(second.checkedAt, checkedAt); assert.equal(second.airports.length, 150);
    const { lookupAirports } = await import('../../api-server/src/field-atlas/backend/providers/airports');
    assert.equal((await lookupAirports(['QAA']))[0].name, 'QAA fixture');
  } finally {
    globalThis.fetch = original;
    await db.delete(legacy, ['head', 'part_0', 'part_1']);
    await db.delete(canonical, [...codes, '_head', '_refresh']);
    await seedTestReference();
  }
});

test('durable maintenance leases prevent concurrent work and restart replay, and catch up across DST', async () => {
  const { runDurableJob, dailyMaintenanceKey } = await import('../../api-server/src/field-atlas/backend/runtime/jobs');
  const id = 'fixture-' + randomUUID(); let calls = 0;
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  const first = runDurableJob(id, '2026-11-08', async () => { calls++; await waiting; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await runDurableJob(id, '2026-11-08', async () => { calls++; }), false);
  finish(); assert.equal(await first, true);
  assert.equal(await runDurableJob(id, '2026-11-08', async () => { calls++; }), false);
  assert.equal(calls, 1);
  assert.equal(dailyMaintenanceKey(new Date('2026-11-08T10:59:00Z')), '2026-11-07');
  assert.equal(dailyMaintenanceKey(new Date('2026-11-08T11:00:00Z')), '2026-11-08');
  assert.equal(dailyMaintenanceKey(new Date('2026-07-01T09:59:00Z')), '2026-06-30');
});

test('runtime route contract matches actual registered routes and access middleware', async () => {
  const { apiContract } = await import('../../api-server/src/api-contract');
  const contract = apiContract();
  assert.ok(Object.keys(contract.paths).length > 60);
  assert.deepEqual((contract.paths['/api/operations'].get as { security: unknown }).security, [{ workspaceLink: [] }]);
  assert.deepEqual((contract.paths['/api/travel/aviation/{icao}'].get as { security: unknown }).security, []);
  for (const { route } of handler.routeManifest) assert.ok(contract.paths[route.split(' ')[1].replace(/:([A-Za-z0-9_]+)/g, '{$1}')]);
});

test('source diagnostics paginate all stations and retain only the latest check per provider and subject', async () => {
  const prefix = 'status-fixture-' + randomUUID();
  const table = 'atlas_public_evidence_v1', ids = Array.from({ length: 125 }, (_, i) => prefix + i);
  const retrievedAt = new Date().toISOString();
  const base = { provider: prefix, sourceUrl: 'https://example.org/', kind: 'observation', state: 'partial', retrievedAt, version: 'fixture', scope: 'Fixture', limitation: 'Fixture' };
  await db.tx.update(table, ids.map((id, i) => ({ id, record: { lastAttemptAt: '2026-11-08T12:00:00Z', result: { data: [], evidence: { ...base, id, subject: String(i) } } } })));
  await db.tx.update(table, [{ id: prefix + '-newer', record: { lastAttemptAt: '2026-11-08T13:00:00Z', result: { data: [], evidence: { ...base, id: prefix + '-newer', subject: '0', version: 'newer' } } } }]);
  try {
    const { sourceStatuses } = await import('../../api-server/src/field-atlas/backend/providers/evidence');
    const results = (await sourceStatuses()).filter(row => row.provider === prefix);
    assert.equal(results.length, 125); assert.equal(results.find(row => row.subject === '0')?.version, 'newer');
  } finally { await db.delete(table, [...ids, prefix + '-newer']); }
});

test('FAA mapping preserves array notices, cause, delay and effective periods while leaving stale and omitted airports unknown',async()=>{
  const original=globalThis.fetch,key=await workspace(),now=Date.now();
  const issued=new Date(now-60000).toISOString(),old=new Date(now-5*3600000).toISOString();
  const start=new Date(now+3600000).toISOString(),end=new Date(now+4*3600000).toISOString();
  globalThis.fetch=async()=>new Response(JSON.stringify([
    {airportId:'ZZA',sourceTimeStamp:issued,groundDelay:[{reason:'Weather contract',avgDelayMinutes:35}],airportConfig:{sourceTimeStamp:issued,arrivalRate:40}},
    ...['ZZC','ZZD'].map((airportId,index)=>({airportId,sourceTimeStamp:index?issued:undefined,
      groundDelay:{impactingCondition:'Low ceilings contract',avgDelay:80,sourceTimeStamp:index?old:issued,startTime:start,endTime:end,advisoryUrl:'https://www.fly.faa.gov/adv/adv_otherdis.jsp?advn=28'},
      airportConfig:{arrivalRate:34,arrivalRunwayConfig:'04L',departureRunwayConfig:'04R',sourceTimeStamp:old}})),
    {airportId:'ZZE',groundDelay:{reason:'Undated notice contract',avgDelay:15,advisoryUrl:'https://untrusted.invalid/'},airportConfig:{sourceTimeStamp:issued,arrivalRate:30}}]));
  try{
    const result=await request('GET','/api/travel/disruptions?airports=ZZA,ZZB,ZZC,ZZD,ZZE',key);
    assert.equal(result.status,200);
    const [array,omitted,fresh,aged,undated]=result.data.airports;
    assert.equal(array.level,'critical');assert.equal(array.events[0].avgMinutes,35);
    assert.equal(omitted.level,'unknown');assert.equal(omitted.evidence.state,'partial');
    assert.equal(fresh.evidence.observedAt,issued);assert.equal(fresh.level,'critical');
    assert.equal(fresh.events[0].reason,'Low ceilings contract');assert.equal(fresh.events[0].avgMinutes,80);
    assert.equal(fresh.events[0].validFrom,start);assert.equal(fresh.events[0].validTo,end);
    assert.equal(new URL(fresh.events[0].advisoryUrl).hostname,'www.fly.faa.gov');
    assert.equal(aged.level,'unknown');assert.equal(aged.evidence.state,'stale');
    assert.equal(aged.events[0].avgMinutes,80);assert.equal(aged.config.updatedAt,old);
    assert.equal(undated.evidence.state,'partial');assert.equal(undated.level,'unknown');
    assert.equal(undated.events[0].advisoryUrl,'');
  }finally{globalThis.fetch=original;}
});

test('normalized station observations keep actual visibility, wind direction, gusts and missing values',async()=>{
  const original=globalThis.fetch,now=new Date().toISOString();
  globalThis.fetch=async input=>{const code=new URL(String(input)).searchParams.get('ids');return new Response(JSON.stringify([{icaoId:code,rawOb:'METAR contract',obsTime:now,fltCat:'MVFR',wspd:0,wgst:22,wdir:'VRB',visib:'6+',temp:0} ]));};
  try{
    const {metar}=await import('../../api-server/src/field-atlas/backend/providers/publicTravel');
    const {flightAirportData}=await import('../src/FlightAirportData');
    const product=await metar('KZZC');assert.equal(product.evidence.state,'current');
    const projected=flightAirportData({airport:{iata:'ZZC',name:'Isolated station'},checkedAt:now,products:[product]});
    assert.deepEqual(projected.aviation.observation,{reportTime:now,category:'MVFR',raw:'METAR contract',windKnots:0,windGustKnots:22,windDirection:'Variable',visibility:'6+',temperatureC:0});
    globalThis.fetch=async()=>new Response(JSON.stringify([{icaoId:'KZZD',rawOb:'METAR missing fields',obsTime:now,fltCat:'VFR',wspd:null,wgst:'unknown',wdir:null,visib:null,temp:null}]));
    const missing=(await metar('KZZD')).data![0].observation!;
    assert.equal(missing.visibility,null);assert.equal(missing.windKnots,null);assert.equal(missing.temperatureC,null);assert.equal(missing.windGustKnots,null);
  }finally{globalThis.fetch=original;}
});

test('full source scan includes each historical dataset and flags an incomplete checkpoint sample', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'flyerintel.com') return new Response(JSON.stringify({ meta: { dataset: url.pathname.split('/').at(-1)!.replace('.json', ''), license: 'CC BY 4.0', period: { start: '2026-08-01', end: '2026-08-31' } }, rows: [] }));
    if (url.hostname === 'datasets-server.huggingface.co') {
      if (url.searchParams.get('where')?.includes('precheck')) throw Error('Fixture unavailable queue');
      const weekday=Number(url.searchParams.get('where')?.match(/"day_of_week"=(\d)/)?.[1]);
      const hour=Number(url.searchParams.get('where')?.match(/"hour_of_day"=(\d+)/)?.[1]);
      const historical=new Date();historical.setUTCDate(historical.getUTCDate()-7);while(historical.getUTCDay()!==weekday)historical.setUTCDate(historical.getUTCDate()-1);
      return new Response(JSON.stringify({ rows: [{ row: { airport: 'MCO', queue_type: 'standard', terminal: 'A', p50_wait: 10, p75_wait: 15, p95_wait: 20, hour_et:historical.toISOString().slice(0,10)+'T'+String(hour).padStart(2,'0')+':00:00' } }], partial: false, num_rows_total: 1 }));
    }
    return new Response('{}');
  };
  try {
    const { refreshPublicSourceStatus } = await import('../../api-server/src/field-atlas/backend/index');
    const now = new Date().toISOString();
    await refreshPublicSourceStatus({ type: 'cron', name: 'fixture', scheduledTime: now, invokedTime: now });
    const [health] = await db.get<{ sources: Array<{ id: string; available: boolean; details: string }> }>('atlas_public_source_health', ['current']);
    assert.equal(health!.sources.filter(row => row.id.startsWith('flyerintel:')).length, 4);
    const checkpoint = health!.sources.find(row => row.id === 'checkpoint-history')!;
    assert.equal(checkpoint.available, false); assert.match(checkpoint.details, /1 historical queue groups/);
    assert.match(checkpoint.details, /PreCheck historical queue feed unavailable/);
  } finally { globalThis.fetch = original; }
});

test('hosted routing validates units and unreachable pairs, protects its key and hides private routes from shared diagnostics', async () => {
  const { roadMatrix } = await import('../../api-server/src/field-atlas/backend/providers/routing');
  const { sourceStatuses } = await import('../../api-server/src/field-atlas/backend/providers/evidence');
  const original = globalThis.fetch;
  const previousProvider = process.env.ATLAS_ROUTING_PROVIDER, previousKey = process.env.ATLAS_ORS_API_KEY;
  process.env.ATLAS_ROUTING_PROVIDER = 'openrouteservice'; process.env.ATLAS_ORS_API_KEY = 'synthetic-server-key';
  const points = [{ id: 'home', name: 'Home', lat: 28.42941, lon: -81.30901 }, { id: 'visit', name: 'Visit', lat: 28.53831, lon: -81.37921 }];
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'https://api.openrouteservice.org/v2/matrix/driving-car');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'synthetic-server-key');
    assert.deepEqual(JSON.parse(String(init?.body)).locations, [[-81.30901, 28.42941], [-81.37921, 28.53831]]);
    return new Response(JSON.stringify({ durations: [[0, 901], [null, 0]], distances: [[0, 1609.344], [null, 0]] }));
  };
  try {
    const route = await roadMatrix(points);
    assert.equal(route.roadBased, true); assert.equal(route.durations[0][1], 16); assert.equal(route.distances[0][1], 1); assert.equal(route.durations[1][0], null);
    assert.ok(!JSON.stringify(route).includes('synthetic-server-key'));
    await roadMatrix(points); assert.equal(calls, 1);
    assert.ok(!(await sourceStatuses()).some(evidence => evidence.provider.includes('road routing')));
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    const failed = await roadMatrix(points.map(p => ({ ...p, lat: p.lat + .01 })));
    assert.equal(failed.roadBased, false); assert.match(failed.evidence.limitation, /HTTP 429/);
    globalThis.fetch = async () => new Response(JSON.stringify({ durations: [[0, -10], [0, 0]], distances: [[0, 1], [1, 0]] }));
    assert.equal((await roadMatrix(points.map(p => ({ ...p, lat: p.lat + .02 })))).roadBased, false);
  } finally {
    globalThis.fetch = original;
    if (previousProvider === undefined) delete process.env.ATLAS_ROUTING_PROVIDER; else process.env.ATLAS_ROUTING_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.ATLAS_ORS_API_KEY; else process.env.ATLAS_ORS_API_KEY = previousKey;
  }
});

test('aircraft observations require workspace access and honor the production gate without a provider request', async () => {
  const previousMode = process.env.NODE_ENV, previousApproval = process.env.ADSB_LOL_PRODUCTION_APPROVED;
  const previousDeployment = process.env.REPLIT_DEPLOYMENT;
  const original = globalThis.fetch;
  const key = await workspace();
  process.env.NODE_ENV = 'production'; delete process.env.ADSB_LOL_PRODUCTION_APPROVED;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('No provider call expected.'); };
  try {
    assert.equal((await request('GET', '/api/travel/live-aircraft?airport=MCO')).status, 403);
    assert.equal((await request('GET', '/api/travel/live-aircraft?airport=invalid', key)).status, 400);
    assert.equal((await request('GET', '/api/travel/live-aircraft?airport=ZZZ', key)).status, 404);
    const result = await request('GET', '/api/travel/live-aircraft?airport=MCO', key);
    assert.equal(result.status, 200); assert.equal(result.data.available, false);
    assert.equal(result.data.evidence.state, 'unavailable'); assert.equal(calls, 0);
    assert.match(result.data.message, /disabled in production/);
    process.env.NODE_ENV = 'development'; process.env.REPLIT_DEPLOYMENT = '1';
    const published = await request('GET', '/api/travel/live-aircraft?airport=MCO', key);
    assert.equal(published.data.available, false); assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousApproval === undefined) delete process.env.ADSB_LOL_PRODUCTION_APPROVED; else process.env.ADSB_LOL_PRODUCTION_APPROVED = previousApproval;
    if (previousDeployment === undefined) delete process.env.REPLIT_DEPLOYMENT; else process.env.REPLIT_DEPLOYMENT = previousDeployment;
  }
});

test('aircraft API preserves unknown numbers and rejects unknown or old positions without inventing flight status', async () => {
  const original = globalThis.fetch;
  const previousMode = process.env.NODE_ENV;
  const key = await workspace(); process.env.NODE_ENV = 'development';
  let calls = 0;
  const row = { hex: 'a1b2c3', lat: 28.429, lon: -81.309, seen_pos: 1, flight: ' DAL123 ', alt_baro: null, gs: null, track: '' };
  globalThis.fetch = async input => {
    calls++; assert.match(String(input), /^https:\/\/api\.adsb\.lol\/v2\/lat\//);
    return new Response(JSON.stringify({ now: Date.now() - 30000, ac: [row,
      { ...row, hex: 'a1b2c4', seen_pos: null }, { ...row, hex: 'a1b2c5', seen_pos: 100 },
      { ...row, hex: 'a1b2c6', lat: null }, { ...row, hex: 'a1b2c7', lon: false },
      { ...row, hex: 'a1b2c8', lat: 33.64, lon: -84.42 }] }));
  };
  try {
    const result = await request('GET', '/api/travel/live-aircraft?airport=MCO', key);
    assert.equal(result.status, 200); assert.equal(result.data.available, true);
    assert.equal(result.data.aircraft.length, 1);
    assert.equal(result.data.aircraft[0].callsign, 'DAL123');
    for (const name of ['altitudeFt', 'groundSpeedKnots', 'trackDegrees']) assert.equal(result.data.aircraft[0][name], null);
    assert.ok(result.data.aircraft[0].lastPositionSeconds >= 31);
    assert.match(result.data.evidence.limitation, /do not confirm an airline/);
    const { GetLiveAircraftResponse } = await import('../../../lib/api-zod/src/generated/api');
    assert.equal(GetLiveAircraftResponse.safeParse(result.data).success, true);
    await request('GET', '/api/travel/live-aircraft?airport=MCO', key); assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(JSON.stringify({ now: Date.now() - 600000, ac: [] }));
    const stale = await request('GET', '/api/travel/live-aircraft?airport=ATL', key);
    assert.equal(stale.data.available, false); assert.equal(stale.data.evidence.state, 'stale');
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    const failed = await request('GET', '/api/travel/live-aircraft?airport=LAX', key);
    assert.equal(failed.data.available, false); assert.equal(failed.data.evidence.state, 'unavailable');
    globalThis.fetch = async () => new Response(JSON.stringify({ now: Date.now() + 60000, ac: [] }));
    const future = await request('GET', '/api/travel/live-aircraft?airport=ORD', key);
    assert.equal(future.data.available, false); assert.equal(future.data.evidence.state, 'unavailable');
    globalThis.fetch = async () => new Response(JSON.stringify({ ac: [{ ...row, lat: 25.793, lon: -80.291 }] }));
    const undated = await request('GET', '/api/travel/live-aircraft?airport=MIA', key);
    assert.equal(undated.data.available, false); assert.equal(undated.data.evidence.state, 'partial');
    assert.equal(undated.data.aircraft[0].lastPositionSeconds, null);
  } finally {
    globalThis.fetch = original;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }
});
