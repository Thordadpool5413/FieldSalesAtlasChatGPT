import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentAnalysisResult} from '../src/analysisSnapshot';
import {reviewedBookings,selectedBookingFlights} from '../src/BookingHandoff';
import {readBookedFlights,storeBookedFlights,readEarlierDeviceBookings,type BookedFlight} from '../src/BookedFlightLogic';
import {connectionMargin,connectionConstraints} from '../shared/travel/readiness';
import type {Evidence} from '../shared/travel/types';

const stamp='2026-11-01T12:00:00Z';
const legs=[{id:'one',carrier:'AA',flightNumber:'100',origin:'MIA',destination:'JFK',departDate:'2026-12-07',departTime:'06:00',arriveDate:'2026-12-07',arriveTime:'09:00',departureZone:'America/New_York',arrivalZone:'America/New_York'},
  {id:'two',carrier:'AA',flightNumber:'101',origin:'JFK',destination:'BOS',departDate:'2026-12-07',departTime:'10:30',arriveDate:'2026-12-07',arriveTime:'11:30',departureZone:'America/New_York',arrivalZone:'America/New_York',connection:{transferMinutes:40,boardingCutoffMinutes:20,ticketRelation:'same-ticket-reported' as const}}];
const checked:BookedFlight={id:'checked',trainerId:'trainer_a',legs,verified:true,source:'manual',createdAt:stamp,updatedAt:stamp,review:{fieldsReviewedAt:stamp,airlineCheckedAt:stamp}};
const context={trainerIds:['trainer_a'],startDate:'2026-12-07',endDate:'2026-12-10'};

test('booking handoff excludes drafts, requires a specific itinerary and preserves all reviewed timing requirements',()=>{
  const draft={...checked,id:'draft',verified:false},other={...checked,id:'other'};
  assert.deepEqual(reviewedBookings([checked,draft,other],context).map(booking=>booking.id),['checked','other']);
  assert.throws(()=>selectedBookingFlights([checked,draft],{},context),/Select one reviewed/);
  assert.throws(()=>selectedBookingFlights([checked,draft],{trainer_a:'draft'},context),/no longer reviewed/);
  const flights=selectedBookingFlights([checked,draft,other],{trainer_a:'checked'},context);
  assert.equal(flights.length,2);assert.deepEqual(flights[1].connection,legs[1].connection);
  assert.deepEqual(flights[0].review,checked.review);assert.equal(flights[0].departureZone,'America/New_York');
  assert.throws(()=>selectedBookingFlights([{...checked,legs:[{...legs[0],arriveTime:''}]}],{trainer_a:'checked'},context),/arrival time/);
});
test('connection what-if and itinerary readiness use the same boarding and transfer margin',()=>{
  assert.equal(connectionMargin(90,{transferMinutes:40,boardingCutoffMinutes:20}),connectionConstraints(legs)[0].marginMinutes);
  assert.equal(connectionMargin(90,{transferMinutes:40,boardingCutoffMinutes:20},30),0);
  assert.equal(connectionMargin(90,{transferMinutes:40}),null);assert.equal(connectionMargin(90,{transferMinutes:-1,boardingCutoffMinutes:20}),null);
});
test('answers and recovery snapshots are unusable after context changes or evidence expiry',()=>{
  const now=Date.now(),value={title:'Saved result'},snapshot={context:'workspace:14|Thursday',result:value};
  const evidence:Evidence={id:'source',provider:'Test',subject:'Test',sourceUrl:'',kind:'observation',state:'current',retrievedAt:new Date(now).toISOString(),expiresAt:new Date(now+1000).toISOString(),version:'test',scope:'Test',limitation:'Test'};
  assert.equal(currentAnalysisResult(snapshot,snapshot.context,[evidence],undefined,now),value);
  assert.equal(currentAnalysisResult(snapshot,'workspace:14|Wednesday',[evidence],undefined,now),null);
  assert.equal(currentAnalysisResult(snapshot,'workspace:15|Thursday',[evidence],undefined,now),null);
  assert.equal(currentAnalysisResult(snapshot,snapshot.context,[evidence],undefined,now+1001),null);
});
test('device bookings stay in their own workspace and older device records require explicit review',()=>{
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const memory=new Map<string,string>(),location={hash:'#workspace='+'a'.repeat(64)};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)||null,setItem:(key:string,value:string)=>memory.set(key,value)}});
  try{
    memory.set('atlas-booked-flight-guardian-v1',JSON.stringify({version:1,records:[checked]}));
    assert.equal(readBookedFlights().length,0);assert.equal(readEarlierDeviceBookings().length,1);
    storeBookedFlights([checked]);assert.equal(readBookedFlights()[0].id,checked.id);
    location.hash='#workspace='+'b'.repeat(64);assert.equal(readBookedFlights().length,0);
    location.hash='#workspace='+'a'.repeat(64);assert.equal(readBookedFlights().length,1);
  }finally{
    if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete (globalThis as {localStorage?:Storage}).localStorage;
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete (globalThis as {window?:Window}).window;
  }
});

test('invalid or missing home-drive preferences remain unknown, including older geographic knobs',async()=>{
  const {safeTravelPrefs}=await import('../src/TravelLogic');
  const prefs=safeTravelPrefs({homeAirports:['MCO','MIA','ATL','BOS'],homeDriveMinutes:{MCO:NaN,MIA:null,ATL:0,BOS:25},roadMultiplier:1.3,assumedRoadMph:47} as never);
  assert.deepEqual(prefs.homeDriveMinutes,{ATL:0,BOS:25});
  assert.equal('roadMultiplier' in prefs,false);assert.equal('assumedRoadMph' in prefs,false);
});

test('bundled airport fallback uses the dated public source instead of list-position size labels',async()=>{
  const {STARTER_AIRPORTS}=await import('../src/data');
  const {CANADA_STARTER_AIRPORTS}=await import('../src/CanadaRegions');
  const {default:source}=await import('../src/airport-reference-source.json');
  assert.equal(STARTER_AIRPORTS.find(airport=>airport.iata==='MIA')?.tier,'Major');
  assert.equal(STARTER_AIRPORTS.find(airport=>airport.iata==='MIA')?.icao,'KMIA');
  assert.equal(CANADA_STARTER_AIRPORTS.find(airport=>airport.iata==='YYZ')?.icao,'CYYZ');
  assert.match(source.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(source.airportCount,STARTER_AIRPORTS.length+CANADA_STARTER_AIRPORTS.length);
  const {readFile}=await import('node:fs/promises');
  assert.equal(await readFile(new URL('../src/airport-reference.json',import.meta.url),'utf8'),await readFile(new URL('../../api-server/src/field-atlas/src/airport-reference.json',import.meta.url),'utf8'));
});
