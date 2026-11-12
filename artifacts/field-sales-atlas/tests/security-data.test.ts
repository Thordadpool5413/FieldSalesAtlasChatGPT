import { test } from 'node:test';
import assert from 'node:assert/strict';
import { securityHistorySchema } from '../src/SecurityHistoryData';
import { forecastOverlapsDate } from '../src/FlightAirportData';
const report={state:'historical',available:true,checkedAt:'2026-11-12T16:00:00Z',airport:'MCO',localDate:'2026-11-12',localHour:14,etHour:14,etWeekday:4,timezone:'America/New_York',
  rows:[{terminal:'Isolated contract',queue:'standard',hourRecords:12,historicalMedianPosted:0,typicalHourlyP75:10,typicalHourlyP95:null,observedStart:'2026-10-01T18:00:00Z',observedEnd:'2026-11-05T19:00:00Z'}],
  requestedQueues:['standard','precheck'],limitations:[],source:'Contract only',sourceUrl:'https://huggingface.co/datasets/digitalhen/us-airport-wait-times',attribution:'Contract only',license:'CC BY 4.0',message:''};
test('checkpoint presentation accepts real zero readings and absent percentiles, rejects malformed or inconsistent reports',()=>{
  assert.equal(securityHistorySchema.safeParse(report).success,true);
  for(const change of [{rows:[]},{checkedAt:'not a timestamp'},{rows:[{...report.rows[0],hourRecords:0}]},{rows:[{...report.rows[0],historicalMedianPosted:20}]},{rows:[{...report.rows[0],observedStart:'2026-12-01T00:00:00Z'}]}])assert.equal(securityHistorySchema.safeParse({...report,...change}).success,false);
  assert.equal(securityHistorySchema.safeParse({...report,available:false,state:'unavailable',rows:[]}).success,true);
  assert.equal(securityHistorySchema.safeParse({...report,rows:[{...report.rows[0],p95Records:1,typicalHourlyP95:5}]}).success,true);
  assert.equal(securityHistorySchema.safeParse({...report,rows:[{...report.rows[0],p95Records:13}]}).success,false);
});
test('travel-date weather includes preceding overnight periods and excludes periods ending at midnight',()=>{
  const overnight={startTime:'2026-11-11T18:00:00-05:00',endTime:'2026-11-12T06:00:00-05:00'};
  assert.equal(forecastOverlapsDate(overnight,'2026-11-12'),true);
  assert.equal(forecastOverlapsDate({...overnight,endTime:'2026-11-12T00:00:00-05:00'},'2026-11-12'),false);
  assert.equal(forecastOverlapsDate(overnight,'2026-11-13'),false);
  assert.equal(forecastOverlapsDate({...overnight,endTime:'invalid'},'2026-11-12'),false);
  assert.equal(forecastOverlapsDate({startTime:'2026-11-01T00:00:00-04:00',endTime:'2026-11-01T06:00:00-05:00'},'2026-11-01'),true);
});
