import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripConflicts } from '../src/guidedPlanning';
import { buildCoachingSchedule } from '../src/TripIntelligence';
import { airportGateways, defaultTravelPrefs, newTravelPlan } from '../src/TravelLogic';
import { STARTER_AIRPORTS } from '../src/data';
import { CANADA_STARTER_AIRPORTS } from '../src/CanadaRegions';
import type { Board, Manager } from '../src/opsModels';

const manager: Manager = { id: 'manager', name: 'Mapped Manager', baseState: 'FL', lat: 28.5, lon: -81.3, email: '', phone: '', trainer: 'Taylor', homeAirport: 'MCO', cadence: 'Monthly', focus: '' };
const plan = { ...newTravelPlan('MIA'), trainer: 'Taylor', managerIds: [manager.id], departDate: '2026-12-07', returnDate: '2026-12-08', selectedArrival: 'MCO' };
const schedule = buildCoachingSchedule(plan, undefined, [manager], defaultTravelPrefs);

test('guided review detects trainer availability, overlapping trips, and duplicate visits', () => {
  const board: Board = {
    availability: [{ id: 'a', trainerId: 'trainer_a', startDate: '2026-12-07', endDate: '2026-12-08', reason: 'Personal time', notes: '', createdAt: '' }],
    trips: [{ id: 't', title: 'Existing', trainer: 'Taylor', startDate: '2026-12-06', endDate: '2026-12-07', arrivalAirport: 'MCO', status: 'Planned', notes: '', stops: [], createdAt: '', updatedAt: '' }],
    visits: [{ id: 'v', managerId: manager.id, date: schedule.visits[0].date, stateCode: 'FL', airport: 'MCO', objective: '', status: 'Planned' }],
  };
  assert.equal(tripConflicts(plan, schedule, board, 'trainer_a').length, 3);
  assert.equal(tripConflicts(plan, schedule, { ...board, trips: [], visits: [] }, 'trainer_b').length, 0);
});

test('guided review flags an overfull schedule instead of silently dropping a manager', () => {
  const shortPlan = { ...plan, returnDate: plan.departDate, planning: { dayStart: '09:00', dayEnd: '09:30', sessionMinutes: 150 } };
  const full = buildCoachingSchedule(shortPlan, undefined, [manager], defaultTravelPrefs);
  assert.equal(full.unplaced.length, 1);
  assert.ok(tripConflicts(shortPlan, full, {}, 'trainer_a').some(message => message.includes('do not fit')));
});

test('offline airport ranking includes nearby U.S. gateways instead of only Canadian airports', () => {
  assert.ok(STARTER_AIRPORTS.every(airport => Number.isFinite(airport.lat) && Number.isFinite(airport.lon)));
  const gateways = airportGateways([...STARTER_AIRPORTS, ...CANADA_STARTER_AIRPORTS], null, [manager], defaultTravelPrefs);
  assert.equal(gateways[0].airport.iata, 'MCO');
  assert.ok(gateways[0].planningDriveMinutes < 120);
});
