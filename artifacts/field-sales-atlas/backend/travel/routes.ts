import { randomUUID } from 'node:crypto';
import { db, json, error, AppDatabaseError, type RouterMiddleware, type RouterRoutes } from '../runtime/sdk';
import { buildScenarios, scenarioInput, flightInput, type ScenarioBoard } from './scenarios';
import type { ScenarioReport } from '../../shared/travel/types';
import { sourceStatuses, evidenceState } from '../providers/evidence';
import { airportReferenceStatus } from '../providers/airports';
import { queueWatch, watchesFor, cancelWatch } from './watch';
import { historyCoverage, routeHistory } from '../providers/bts';
import { allRecords, planContext, reportTable, changeTable, type SavedReport } from './context';
import { changeInput, reportFlightChange, buildRecovery, approveRecovery } from './recovery';
import { assistantInput, answerTravelQuestion } from './assistant';
import type { FlightChange } from '../../shared/travel/intelligence';
import { connectionStatus, validateConnections } from '../providers/connections';
import { adoptSavedTrips, attachItinerary } from './adopt';
import { publicRoutingStatus } from '../providers/routingConfig';

const reports = (workspaceId: string) => 'atlas_scenarios_' + workspaceId;
export function makeTravelRoutes(deps: {
  workspaceAccess: RouterMiddleware;
  member: (id: string) => Promise<{ workspaceId: string } | null>;
  load: (workspaceId: string) => Promise<ScenarioBoard>;
  tables: (workspaceId: string) => { visits: string };
  extraTables: (workspaceId: string) => { trips: string };
  activityLog: (workspaceId: string, actor: string, action: string, entity: string, summary: string) => Promise<void>;
}): RouterRoutes {
  const access = deps.workspaceAccess;
  return {
    'POST /api/travel/journeys/adopt': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const body = ctx.body as { tripIds?: unknown } | null;
      if (!Array.isArray(body?.tripIds) || !body.tripIds.length || body.tripIds.length > 2 || body.tripIds.some(id => typeof id !== 'string' || id.length > 100)) return error('Choose one or two saved trips.', 400);
      try { return json(await adoptSavedTrips(m.workspaceId, body.tripIds as string[], await deps.load(m.workspaceId)), 201); }
      catch (failure) { return error(failure instanceof Error ? failure.message : 'Could not connect these trips.', 422); }
    }],
    'POST /api/travel/journeys/:id/itinerary': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const parsed = flightInput.array().min(1).max(32).safeParse((ctx.body as { flights?: unknown } | null)?.flights);
      if (!parsed.success) return error('Supply one to 32 complete booking legs.', 400);
      try { const result = await attachItinerary(m.workspaceId, ctx.params.id, parsed.data, await deps.load(m.workspaceId));
        await deps.activityLog(m.workspaceId, ctx.query.trainerId || 'trainer_a', 'updated', 'itinerary-evidence', 'Supplied flight fields connected; appointments unchanged');
        return json(result);
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'Could not attach this itinerary.', 409); }
    }],
    'GET /api/travel/connections': [access, async () => json(await connectionStatus())],
    'POST /api/travel/connections/check': [access, async ctx => {
      const body = ctx.body as { airports?: unknown; checkRouting?: boolean } | null;
      if (!Array.isArray(body?.airports) || !body.airports.length || body.airports.length > 4 || body.airports.some(code => typeof code !== 'string' || !/^[A-Z]{3}$/.test(code))) return error('Choose one to four valid airport codes.', 400);
      try { return json(await validateConnections(body.airports as string[], body.checkRouting === true)); }
      catch (failure) { return error(failure instanceof Error ? failure.message : 'Validation could not complete.', 422); }
    }],
    'GET /api/travel/journeys': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const board = await deps.load(m.workspaceId);
      const saved = await allRecords<SavedReport>(reportTable(m.workspaceId));
      const plans = [], issues: Array<{ id: string; reason: string }> = [];
      for (const item of saved.filter(item => item.approval)) {
        try {
          const plan = await planContext(m.workspaceId, item.id, board);
          if (!(board.trips || []).some(trip => plan.tripIds.includes(trip.id) && trip.status === 'Planned')) continue;
          plans.push({ id: item.id, title: plan.scenario.title, startDate: plan.input.startDate, endDate: plan.input.endDate, arrivalAirport: plan.input.arrivalAirport,
            trainerNames: board.trainerProfiles.filter(profile => plan.input.trainerIds.includes(profile.id)).map(profile => profile.name),
            flightLegs: plan.input.flights, tripIds: plan.tripIds, pendingChange: plan.pendingChange });
        } catch (failure) { issues.push({ id: item.id, reason: failure instanceof Error ? failure.message : 'Saved plan context is incomplete.' }); }
      }
      return json({ plans, issues });
    }],
    'POST /api/travel/changes': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const parsed = changeInput.safeParse(ctx.body);
      if (!parsed.success) return error('Supply valid original flight fields, changed times or cancellation, and the time you checked.', 400);
      try { const result = await reportFlightChange(m.workspaceId, parsed.data, await deps.load(m.workspaceId));
        await deps.activityLog(m.workspaceId, ctx.query.trainerId || 'trainer_a', 'reported', 'flight-change', 'Traveler-reported flight change; calendar unchanged');
        return json(result, 201);
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'Could not report the change.', 409); }
    }],
    'DELETE /api/travel/changes/:id': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const [change] = await db.get<FlightChange>(changeTable(m.workspaceId), [ctx.params.id]);
      if (!change || change.state !== 'pending') return error('Pending change not found.', 404);
      const [changed] = await db.tx.update(changeTable(m.workspaceId), [{ id: change.id, record: { state: 'retracted' }, if: { state: 'pending' } }], { patch: true });
      return changed ? json({ retracted: true }) : error('The change was already resolved. Refresh.', 409);
    }],
    'POST /api/travel/recovery': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const body = ctx.body as { changeId?: string; includeHandoffs?: boolean } | null;
      if (typeof body?.changeId !== 'string' || body.changeId.length > 100) return error('A pending flight change is required.', 400);
      try { return json(await buildRecovery(m.workspaceId, body.changeId, await deps.load(m.workspaceId), body.includeHandoffs === true), 201); }
      catch (failure) { return error(failure instanceof Error ? failure.message : 'Could not build recovery options.', 422); }
    }],
    'POST /api/travel/recovery/:id/approve': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const body = ctx.body as { optionId?: string; acknowledgeConsequences?: boolean; monitor?: boolean } | null;
      if (typeof body?.optionId !== 'string') return error('Choose a reviewed recovery option.', 400);
      try {
        const result = await approveRecovery(m.workspaceId, ctx.params.id, body.optionId, body.acknowledgeConsequences === true, body.monitor === true, await deps.load(m.workspaceId));
        if (!result.replayed) await deps.activityLog(m.workspaceId, ctx.query.trainerId || 'trainer_a', 'rescheduled', 'recovery', result.updatedVisits + ' proposed visits updated after disruption review');
        return json(result, result.replayed ? 200 : 201);
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'Calendar changed. Rebuild recovery options.', 409); }
    }],
    'POST /api/travel/assistant': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId); if (!m) return error('Workspace required.', 403);
      const parsed = assistantInput.safeParse(ctx.body);
      if (!parsed.success) return error('Choose a saved plan and supply a travel question with valid optional deadline fields.', 400);
      try { return json(await answerTravelQuestion(m.workspaceId, parsed.data, await deps.load(m.workspaceId))); }
      catch (failure) { return error(failure instanceof Error ? failure.message : 'Could not calculate an evidence-backed answer.', 422); }
    }],
    'POST /api/travel/scenarios': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId);
      if (!m) return error('Workspace required.', 403);
      const parsed = scenarioInput.safeParse(ctx.body);
      if (!parsed.success) return error('Review the trip inputs: ' + parsed.error.issues.slice(0, 3).map(issue => issue.path.join('.') + ' ' + issue.message).join('; '), 400);
      const revision = db.workspaceRevision(m.workspaceId);
      const board = await deps.load(m.workspaceId);
      if (board.truncated) return error('Complete workspace records are required before optimizing.', 409);
      try {
        parsed.data.flights = parsed.data.flights.map(flight => ({ ...flight, providedAt: flight.providedAt || new Date().toISOString() }));
        const report = await buildScenarios(parsed.data, board, revision);
        if (db.workspaceRevision(m.workspaceId) !== revision) return error('The shared calendar changed while solving. Build a fresh preview.', 409);
        await db.tx.add(reports(m.workspaceId), [{ id: report.id, report, input: parsed.data }]);
        return json(report, 201);
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'Unable to build scenarios.', 422); }
    }],
    'POST /api/travel/scenarios/:id/approve': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId);
      if (!m) return error('Workspace required.', 403);
      const body = ctx.body as { scenarioId?: string; acknowledgeGaps?: boolean; monitor?: boolean } | null;
      const table = reports(m.workspaceId);
      const [saved] = await db.get<SavedReport>(table, [ctx.params.id]);
      if (!saved) return error('Preview not found in this workspace.', 404);
      if (saved.approval) return saved.approval.scenarioId === body?.scenarioId ? json({ ...saved.approval, replayed: true }) : error('A different option from this preview is already scheduled.', 409);
      if (Date.parse(saved.report.expiresAt) <= Date.now()) return error('This preview expired. Build a fresh preview before scheduling.', 409);
      if (saved.report.evidence.some(item => item.state === 'current' && evidenceState(item) !== 'current')) return error('A source snapshot expired since this preview. Build a fresh preview before scheduling.', 409);
      const scenario = saved.report.scenarios.find(option => option.id === body?.scenarioId);
      if (!scenario?.feasible || !scenario.visits.length) return error('Only a complete schedule can be approved. Resolve unplaced visits first.', 400);
      if (scenario.provisional && body?.acknowledgeGaps !== true) return error('Review and acknowledge the evidence gaps before adding this provisional plan.', 400);
      const board = await deps.load(m.workspaceId);
      const now = new Date().toISOString();
      const trips = scenario.trainerIds.map(trainerId => {
        const trainer = board.trainerProfiles.find(profile => profile.id === trainerId)!;
        const visits = scenario.visits.filter(visit => visit.trainerId === trainerId);
        return { id: 'journey_' + randomUUID(), title: scenario.title + ' · ' + trainer.name, trainer: trainer.name, trainerId,
          startDate: visits.map(v => v.date).sort()[0], endDate: visits.map(v => v.date).sort().at(-1)!, arrivalAirport: saved.report.arrivalAirport,
          status: 'Planned', notes: 'Proposed appointments. ' + scenario.gaps.join(' '), scenarioReportId: saved.id,
          evidence: saved.report.evidence, stops: visits, createdAt: now, updatedAt: now };
      });
      const visits = scenario.visits.map(visit => {
        const trip = trips.find(trip => trip.trainerId === visit.trainerId)!;
        return { ...visit, id: 'journey_visit_' + randomUUID(), trainer: trip.trainer, tripId: trip.id, airport: saved.report.arrivalAirport,
          status: 'Planned', objective: 'Proposed coaching appointment; confirm with manager.', outcome: '', source: 'atlas-constraint-planner', updatedAt: now };
      });
      const approval = { scenarioId: scenario.id, tripIds: trips.map(trip => trip.id), scheduledVisits: visits.length };
      try {
        const operations = [db.tx.add(deps.extraTables(m.workspaceId).trips, trips), db.tx.add(deps.tables(m.workspaceId).visits, visits),
          db.tx.update(table, [{ id: saved.id, record: { ...saved, approval }, if: { approval: undefined } }])];
        if (body?.monitor === true) operations.push(queueWatch(m.workspaceId, saved.report, approval.tripIds));
        await db.transact(operations, () => {
          if (db.workspaceRevision(m.workspaceId) !== saved.report.workspaceRevision) throw new AppDatabaseError('AppDatabaseConflict', 'Workspace changed.');
        });
      } catch {
        const [fresh] = await db.get<SavedReport>(table, [saved.id]);
        if (fresh?.approval?.scenarioId === scenario.id) return json({ ...fresh.approval, replayed: true });
        return error('Workspace changed since this preview. Build a fresh preview and review the calendar.', 409);
      }
      await deps.activityLog(m.workspaceId, ctx.query.trainerId === 'trainer_b' ? 'trainer_b' : 'trainer_a', 'scheduled', 'journey', `${visits.length} proposed visits across ${trips.length} trainer trips`);
      return json({ ...approval, replayed: false }, 201);
    }],
    'GET /api/travel/sources': [access, async () => json({ sources: (await sourceStatuses()).filter(item => item.provider !== 'OSRM road routing'), airports: await airportReferenceStatus(), history: historyCoverage(),
      routing: publicRoutingStatus() })],
    'GET /api/travel/history': [access, async ctx => {
      const { origin = '', destination = '', carrier = '', flightNumber = '' } = ctx.query;
      if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || (carrier && !/^[A-Z0-9]{2}$/.test(carrier)) || (flightNumber && !/^\d{1,4}$/.test(flightNumber))) return error('Valid airport codes and optional carrier/flight number are required.', 400);
      return json(routeHistory(origin, destination, carrier, flightNumber));
    }],
    'GET /api/travel/reviews': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId);
      return m ? json({ watches: await watchesFor(m.workspaceId) }) : error('Workspace required.', 403);
    }],
    'DELETE /api/travel/reviews/:id': [access, async ctx => {
      const m = await deps.member(ctx.user!.userId);
      if (!m) return error('Workspace required.', 403);
      return await cancelWatch(m.workspaceId, ctx.params.id) ? json({ stopped: true }) : error('Review watch not found.', 404);
    }],
  };
}
