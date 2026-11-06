import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zonedInstant, elapsedMinutes, inZone, dateRange } from '../shared/travel/time';
import { optimize, validateSolution, type OptimizerInput } from '../backend/travel/optimizer';
import { routeHistory } from '../backend/providers/bts';
import { calendarContents, type Visit } from '../src/opsModels';
import { interpretDeadline } from '../shared/travel/questions';
import { describeEvidence } from '../shared/travel/evidence';
import { withinRoutingCoverage } from '../backend/providers/routingConfig';

test('flight elapsed times respect zones, overnight dates, DST folds and gaps', () => {
  const departure = zonedInstant('2026-12-01', '21:00', 'America/Los_Angeles');
  const arrival = zonedInstant('2026-12-02', '05:00', 'America/New_York');
  assert.equal(elapsedMinutes(departure, arrival), 300);
  assert.equal(inZone(departure, 'America/New_York').date, '2026-12-02');
  assert.throws(() => zonedInstant('2026-03-08', '02:30', 'America/New_York'), /invalid or ambiguous/);
  assert.throws(() => zonedInstant('2026-11-01', '01:30', 'America/New_York'), /invalid or ambiguous/);
  assert.equal(elapsedMinutes(zonedInstant('2026-11-01', '01:30', 'America/New_York', 'earlier'), zonedInstant('2026-11-01', '01:30', 'America/New_York', 'later')), 60);
  assert.throws(() => zonedInstant('2026-02-30', '09:00', 'America/Toronto'));
  assert.deepEqual(dateRange('2026-12-04', '2026-12-07'), ['2026-12-04', '2026-12-07']);
});

test('assistant deadline interpretation is explicit about weekdays, clock times and ambiguity', () => {
  assert.equal(interpretDeadline('Can we finish visits and get home Thursday?', '2026-12-07', '2026-12-11').date, '2026-12-10');
  assert.equal(interpretDeadline('Can we get home by 6pm Thursday?', '2026-12-07', '2026-12-11').time, '18:00');
  assert.equal(interpretDeadline('Can we get home by 18:30 Thursday?', '2026-12-07', '2026-12-11').time, '18:30');
  assert.ok(interpretDeadline('Get home Thursday', '2026-12-07', '2026-12-24').clarification);
  assert.ok(interpretDeadline('Get home Thursday or Friday', '2026-12-07', '2026-12-11').clarification);
  assert.ok(interpretDeadline('What should we buy?', '2026-12-07', '2026-12-11').clarification);
});

test('evidence age remains unknown when absent and a fresh retrieval cannot freshen old observations', () => {
  const now = Date.parse('2026-12-01T12:00:00Z');
  const detail = describeEvidence({ id: 'x', provider: 'test', subject: 'test', sourceUrl: '', kind: 'forecast', state: 'current', observedAt: '2026-12-01T09:00:00Z', retrievedAt: '2026-12-01T11:59:00Z', expiresAt: '2026-12-01T11:00:00Z', version: '1', scope: '', limitation: '' }, now);
  assert.equal(detail.state, 'stale'); assert.equal(detail.observationAgeMinutes, 180); assert.equal(detail.retrievalAgeMinutes, 1);
});

test('regional road coverage excludes holes and points beyond the installed graph', () => {
  const graph = { version: 1 as const, endpoint: 'http://127.0.0.1:5000/', installedAt: '', dataDate: '', sha256: 'a'.repeat(64), regions: ['fixture'], sources: [], image: '',
    polygons: [{ outer: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], holes: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] }] };
  assert.equal(withinRoutingCoverage(3, 3, graph), true); assert.equal(withinRoutingCoverage(1.5, 1.5, graph), false); assert.equal(withinRoutingCoverage(8, 8, graph), false);
});

test('calendar export preserves validated UTC appointments and unresolved visits remain all-day', () => {
  const visit = { id: 'v', managerId: 'm', date: '2026-12-01', startTime: '09:00', endTime: '11:00', timeZone: 'America/New_York', startInstant: '2026-12-01T14:00:00Z', endInstant: '2026-12-01T16:00:00Z', status: 'Planned', objective: 'Coaching · '.repeat(30), stateCode: 'FL', airport: 'MCO' } as Visit;
  const output = calendarContents([visit], [], []);
  assert.match(output, /DTSTART:20261201T140000Z/); assert.match(output, /STATUS:TENTATIVE/);
  assert.ok(output.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  const unresolved = calendarContents([{ ...visit, timeZone: undefined, startInstant: undefined, endInstant: undefined }], [], []);
  assert.match(unresolved, /DTSTART;VALUE=DATE:20261201/);
});

test('real OR-Tools assigns both trainers, enforces ownership, windows, and unreachable roads', async () => {
  const input: OptimizerInput = { jobs: [
    { id: 'a', service: 120, windows: [[60, 100]], allowed: [0], priority: 10 },
    { id: 'b', service: 120, windows: [[60, 100]], allowed: [1], priority: 10 },
    { id: 'island', service: 30, windows: [[60, 200]], allowed: [0, 1], priority: 10 },
  ], vehicles: [{ start: 0, end: 240, trainerId: 'trainer_a', date: '2026-12-01' }, { start: 0, end: 240, trainerId: 'trainer_b', date: '2026-12-01' }],
  durations: [[0, 20, 20, null], [20, 0, 10, null], [20, 10, 0, null], [null, null, null, 0]], horizon: 1000, breakMinutes: 30 };
  const result = await optimize(input);
  assert.match(result.engine, /OR-Tools/);
  for (const solution of result.solutions) {
    assert.deepEqual(solution.unplaced, ['island']); assert.equal(solution.routes.length, 2);
    assert.equal(solution.routes.find(route => route.vehicle === 0)!.visits[0].node, 1);
    const tampered = structuredClone(solution); tampered.routes[0].visits[0].at = 5;
    assert.throws(() => validateSolution(input, tampered), /window/);
  }
  const unavailable = await optimize({ ...input, vehicles: [], jobs: input.jobs.map(job => ({ ...job, allowed: [] })) });
  assert.equal(unavailable.solutions[0].unplaced.length, 3);
});

test('BTS importer preserves null outcomes, verifies schema/month, and replaces a period atomically', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-bts-'));
  try {
    const file = join(directory, 'bts.csv'), output = join(directory, 'bts.sqlite');
    const header = 'FL_DATE,OP_UNIQUE_CARRIER,OP_CARRIER_FL_NUM,ORIGIN,DEST,CRS_DEP_TIME,CANCELLED,DIVERTED,ARR_DELAY\n';
    const rows = Array.from({ length: 40 }, (_, i) => `2026-01-01,AA,${i + 1},MIA,MCO,0900,${i === 0 ? 1 : 0},${i === 1 ? 1 : 0},${i < 3 ? '' : i % 2 ? 20 : -5}`).join('\n');
    writeFileSync(file, header + rows);
    const args = ['scripts/import-bts.py', '--file', file, '--period', '2026-01', '--source-url', 'https://transtats.bts.gov/example.zip', '--output', output];
    let result = spawnSync('python3', args, { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
    result = spawnSync('python3', args, { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
    const connection = new DatabaseSync(output);
    assert.equal(connection.prepare('SELECT count(*) AS n FROM flights').get()!.n, 40);
    assert.equal(connection.prepare('SELECT count(*) AS n FROM flights WHERE arrival_delay IS NULL').get()!.n, 3);
    connection.close();
    const previousDataDir = process.env.ATLAS_DATA_DIR;
    process.env.ATLAS_DATA_DIR = directory;
    try {
      const history = routeHistory('MIA', 'MCO', 'AA');
      assert.equal(history.state, 'historical');
      assert.equal(history.summary!.sampleSize, 40); assert.equal(history.summary!.outcomeSampleSize, 37);
      assert.equal(history.summary!.cancellationRate, 1 / 40);
      assert.equal(history.summary!.onTimeRate, 18 / 37);
      assert.equal(routeHistory('MIA', 'MCO', 'AA', '1').summary!.cancellationRate, null);
      assert.equal(routeHistory('YYZ', 'YVR').state, 'unavailable');
    } finally { if (previousDataDir === undefined) delete process.env.ATLAS_DATA_DIR; else process.env.ATLAS_DATA_DIR = previousDataDir; }
    writeFileSync(file, header + rows.replace('2026-01-01', '2026-02-01'));
    result = spawnSync('python3', args, { encoding: 'utf8' }); assert.notEqual(result.status, 0);
    const unchanged = new DatabaseSync(output, { readOnly: true }); assert.equal(unchanged.prepare('SELECT count(*) AS n FROM flights').get()!.n, 40); unchanged.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
