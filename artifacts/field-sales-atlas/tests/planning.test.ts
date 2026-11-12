import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripConflicts } from '../src/guidedPlanning';
import { buildCoachingSchedule } from '../src/TripIntelligence';
import { defaultTravelPrefs, newTravelPlan, type TravelPrefs } from '../src/TravelLogic';
import { STARTER_AIRPORTS } from '../src/data';
import type { Board, Manager } from '../src/opsModels';

const manager: Manager = { id: 'manager', name: 'Mapped Manager', baseState: 'FL', lat: 28.5, lon: -81.3, email: '', phone: '', trainer: 'Taylor', homeAirport: 'MCO', cadence: 'Monthly', focus: '' };
const plan = { ...newTravelPlan('MIA'), trainer: 'Taylor', managerIds: [manager.id], departDate: '2026-12-07', returnDate: '2026-12-08', selectedArrival: 'MCO' };
const airport=STARTER_AIRPORTS.find(airport=>airport.iata==='MCO')!;
const prefs:TravelPrefs={...defaultTravelPrefs,roadNetwork:{points:[{id:'MCO',name:airport.name,lat:airport.lat!,lon:airport.lon!},{id:manager.id,name:manager.name,lat:manager.lat!,lon:manager.lon!}],
  matrix:{roadBased:true,durations:[[0,15],[20,0]],distances:[[0,10],[12,0]],evidence:{id:'planning-fixture',provider:'Isolated road fixture',subject:'test',sourceUrl:'',kind:'estimate',state:'current',retrievedAt:new Date().toISOString(),version:'test',scope:'Isolated road durations.',limitation:'Test fixture.'}}}};
const schedule = buildCoachingSchedule(plan, airport, [manager], prefs);

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
  const full = buildCoachingSchedule(shortPlan, airport, [manager], prefs);
  assert.equal(full.unplaced.length, 1);
  assert.ok(tripConflicts(shortPlan, full, {}, 'trainer_a').some(message => message.includes('do not fit')));
});

test('planning without a current road network leaves visits unplaced', () => {
  const result = buildCoachingSchedule(plan, airport, [manager], defaultTravelPrefs);
  assert.equal(result.visits.length, 0);
  assert.equal(result.unplaced.length, 1);
  assert.ok(result.warnings.some(message => /road/i.test(message)));
});
