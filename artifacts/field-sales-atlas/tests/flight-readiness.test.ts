import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionConstraints, createReadinessReport, flightInstants } from '../shared/travel/readiness';
import { elapsedMinutes } from '../shared/travel/time';
import { itineraryValid, connectionReviews, changedBookingFields, readBookedFlights, storeBookedFlights, type BookedFlight, type BookedLeg } from '../src/BookedFlightLogic';

const first:BookedLeg={id:'a',carrier:'AA',flightNumber:'100',origin:'MIA',destination:'JFK',departDate:'2026-12-07',departTime:'06:00',arriveDate:'2026-12-07',arriveTime:'09:00',departureZone:'America/New_York',arrivalZone:'America/New_York'};
const second:BookedLeg={...first,id:'b',flightNumber:'101',origin:'JFK',destination:'BOS',departTime:'10:30',arriveTime:'11:30',connection:{transferMinutes:40,boardingCutoffMinutes:20,ticketRelation:'same-ticket-reported'}};

test('connection margin uses gate processing and boarding cutoff; missing requirements stay unknown',()=>{
  const step=connectionConstraints([first,second])[0];
  assert.equal(step.marginMinutes,30);
  assert.equal(step.latestActionAt,'2026-12-07T14:30:00Z');
  assert.equal(connectionConstraints([first,{...second,connection:undefined}])[0].marginMinutes,null);
  assert.equal(connectionReviews([first,{...second,connection:undefined}])[0].level,'review');
  assert.equal(connectionConstraints([first,{...second,origin:'EWR'}])[0].marginMinutes,null);
});
test('spring DST jump is elapsed time, and ambiguous fall clocks are rejected',()=>{
  const a={...first,departDate:'2026-03-08',arriveDate:'2026-03-08',departTime:'00:30',arriveTime:'01:30'};
  const b={...second,departDate:'2026-03-08',arriveDate:'2026-03-08',departTime:'03:30',arriveTime:'05:00',connection:{transferMinutes:45,boardingCutoffMinutes:20}};
  assert.equal(connectionConstraints([a,b])[0].marginMinutes,-5);
  assert.equal(connectionReviews([a,b])[0].level,'attention');
  assert.equal(itineraryValid([{...first,departDate:'2026-11-01',arriveDate:'2026-11-01',departTime:'01:30',arriveTime:'04:00'}]),false);
});
test('date-line flight can arrive on the previous local date; actual overlap still fails',()=>{
  const leg={...first,origin:'NRT',destination:'HNL',departDate:'2026-12-08',departTime:'00:30',arriveDate:'2026-12-07',arriveTime:'13:30',departureZone:'Asia/Tokyo',arrivalZone:'Pacific/Honolulu'};
  assert.equal(itineraryValid([leg]),true);
  const timed=flightInstants(leg)!;assert.equal(elapsedMinutes(timed.departure,timed.arrival),480);
  assert.equal(itineraryValid([first,{...second,departTime:'08:30'}]),false);
});
test('delay tests expose limiting checkpoints and never turn missing evidence into a successful trip',()=>{
  const flights=[first,second].map(leg=>({...leg,trainerId:'trainer_a'}));
  const report=createReadinessReport(flights,[{id:'trainer_a',name:'Taylor'}],connectionConstraints(flights));
  assert.equal(report.verdict,'needs-information');assert.equal(report.trainers[0].minimumMarginMinutes,30);
  assert.equal(report.trainers[0].tests[0].state,'needs-information'); // Exactly uses the known margin; checks remain unresolved.
  assert.equal(report.trainers[0].tests[1].state,'exceeds-margin');
  assert.equal(report.trainers[0].tests[2].state,'exceeds-margin');
  const resources={trainers:[{trainerId:'trainer_a' as const,transport:'shared-needs-review' as const,equipment:'ready' as const}]};
  assert.equal(createReadinessReport(flights,[{id:'trainer_a',name:'Taylor'}],[],resources).verdict,'attention');
});
test('reviewed and issued are traveler reports; saving a legacy booking does not invent check timestamps or retain a PNR',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),memory=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)||null,setItem:(key:string,value:string)=>memory.set(key,value)}});
  try{
    memory.set('atlas-booked-flight-guardian-v1',JSON.stringify({version:1,records:[{id:'old',trainerId:'trainer_a',legs:[first],verified:true,source:'manual',createdAt:'',updatedAt:'',pnr:'SECRET'}]}));
    const [legacy]=readBookedFlights();assert.equal(legacy.verified,true);assert.equal(legacy.review,undefined);assert.equal(legacy.revision,1);
    const current={...legacy,review:{fieldsReviewedAt:'2026-11-01T12:00:00Z',ticketingConfirmedAt:'2099-01-01T00:00:00Z'},pnr:'SECRET'} as BookedFlight;
    storeBookedFlights([current]);
    const [saved]=readBookedFlights();assert.equal(saved.review?.fieldsReviewedAt,'2026-11-01T12:00:00.000Z');assert.equal(saved.review?.ticketingConfirmedAt,undefined);
    assert.ok(![...memory.values()].join('').includes('SECRET'));
  }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete (globalThis as {localStorage?:Storage}).localStorage;}
});
test('a new confirmation yields explicit field changes without storing the raw message',()=>{
  const changes=changedBookingFields([first,second],[first,{...second,departTime:'11:00'}]);
  assert.deepEqual(changes,['Leg 2 departTime: 10:30 → 11:00']);
  assert.match(changedBookingFields([first],[first,second])[0],/Leg 2 added/);
});
