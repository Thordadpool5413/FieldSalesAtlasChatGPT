import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const fixture=await readFile(new URL('./fixtures/checkpoint-hourly.parquet',import.meta.url));
async function isolatedArchive(){return import('../../api-server/src/field-atlas/backend/providers/checkpointArchive.ts?isolate='+randomUUID());}
const meta={id:'digitalhen/us-airport-wait-times',cardData:{license:'cc-by-4.0'},sha:'a'.repeat(40)};

test('direct checkpoint archives preserve Eastern wall-clock times, null percentiles and revision-pinned source receipts',async()=>{
  const original=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=async input=>{calls.push(String(input));return String(input).includes('/api/datasets/')?new Response(JSON.stringify(meta)):new Response(fixture);};
  try{
    const {checkpointArchiveRows}=await isolatedArchive();
    const report=await checkpointArchiveRows('MCO',8,4);
    assert.equal(report.rows.length,1);assert.equal(report.rows[0].hour_et,'2026-11-05T08:00:00');
    assert.equal(report.rows[0].p50_wait,0);assert.equal(report.rows[0].p95_wait,null);
    assert.match(report.receipt.sha256,/^[a-f0-9]{64}$/);assert.equal(report.receipt.revision,meta.sha);
    assert.ok(calls[1].includes('/resolve/'+meta.sha+'/'));
    assert.equal((await checkpointArchiveRows('MCO',9,4)).rows.length,0);assert.equal(calls.length,2);
  }finally{globalThis.fetch=original;}
});
test('an unverified archive license never downloads or produces checkpoint recommendations',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({...meta,cardData:{license:'unknown'}}));};
  try{await assert.rejects((await isolatedArchive()).checkpointArchiveRows('MCO',8,4),/identity.*license/);assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});
test('a changed UTC timestamp schema is rejected instead of shifting the airport query by hours',async()=>{
  const original=globalThis.fetch,bytes=await readFile(new URL('./fixtures/checkpoint-hourly-unexpected-utc.parquet',import.meta.url));
  globalThis.fetch=async input=>String(input).includes('/api/datasets/')?new Response(JSON.stringify(meta)):new Response(bytes);
  try{await assert.rejects((await isolatedArchive()).checkpointArchiveRows('MCO',8,4),/timestamp semantics changed/);}
  finally{globalThis.fetch=original;}
});
