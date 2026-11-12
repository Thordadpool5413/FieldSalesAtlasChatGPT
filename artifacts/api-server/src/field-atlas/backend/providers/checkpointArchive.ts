import { createHash } from 'node:crypto';
import { parquetMetadata, parquetRead, type ColumnData } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

type Row=Record<string,unknown>;
export type CheckpointArchiveReceipt={sourceUrl:string;sha256:string;retrievedAt:string;revision:string};
const dataset='digitalhen/us-airport-wait-times';
const maxBytes=8*1024*1024;
const columns=['airport','terminal','queue_type','hour_et','day_of_week','hour_of_day','p50_wait','p75_wait','p95_wait'];
let cached:{file:ArrayBuffer;receipt:CheckpointArchiveReceipt;expires:number}|undefined;
let downloading:Promise<NonNullable<typeof cached>>|undefined;
let retryAt=0;
const queries=new Map<string,Promise<{rows:Row[];receipt:CheckpointArchiveReceipt}>>();
async function bounded(response:Response,limit:number){
  if(!response.ok||!response.body)throw Error('Published checkpoint archive is unavailable.');
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>limit)throw Error('Published checkpoint archive exceeds the download bound.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>limit){await reader.cancel();throw Error('Published checkpoint archive exceeds the download bound.');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}
  return result;
}
async function archive(){
  if(cached&&cached.expires>Date.now())return cached;
  if(downloading)return downloading;
  if(retryAt>Date.now())throw Error('Published checkpoint archive retry is deferred after a failed validation.');
  downloading=(async()=>{
    const metadata=JSON.parse(new TextDecoder().decode(await bounded(await fetch('https://huggingface.co/api/datasets/'+dataset,{signal:AbortSignal.timeout(8000)}),512*1024)));
    if(metadata.id!==dataset||metadata.cardData?.license!=='cc-by-4.0'||!/^[a-f0-9]{40}$/i.test(metadata.sha||''))
      throw Error('Checkpoint archive identity, revision or reuse license could not be validated.');
    const sourceUrl='https://huggingface.co/datasets/'+dataset+'/resolve/'+metadata.sha+'/data/hourly/hourly.parquet';
    const bytes=await bounded(await fetch(sourceUrl,{signal:AbortSignal.timeout(15000)}),maxBytes);
    const file=bytes.buffer as ArrayBuffer,footer=parquetMetadata(file);
    const fields=footer.schema.map(field=>field.name),time=footer.schema.find(field=>field.name==='hour_et');
    const expanded=footer.row_groups.reduce((sum,group)=>sum+group.columns.reduce((total,column)=>total+Number(column.meta_data?.total_uncompressed_size||0),0),0);
    if(!columns.every(column=>fields.includes(column))||Number(footer.num_rows)<1||Number(footer.num_rows)>1000000
      ||!Number.isFinite(expanded)||expanded>64*1024*1024
      ||time?.logical_type?.type!=='TIMESTAMP'||time.logical_type.isAdjustedToUTC!==false)
      throw Error('Checkpoint archive fields, size or Eastern-local timestamp semantics changed.');
    const receipt={sourceUrl,sha256:createHash('sha256').update(bytes).digest('hex'),retrievedAt:new Date().toISOString(),revision:metadata.sha};
    return cached={file,receipt,expires:Date.now()+6*3600000};
  })().catch(failure=>{retryAt=Date.now()+5*60000;throw failure;}).finally(()=>{downloading=undefined;});
  return downloading;
}

// Only the bounded aggregate file is read. Minute-level archives and booking
// data are never requested. Actual published rows still pass securityHistory's
// numeric, chronology and airport/queue validation before becoming statistics.
export async function checkpointArchiveRows(airport:string,hour:number,weekday:number){
  const snapshot=await archive(),key=snapshot.receipt.sha256+'|'+airport+'|'+hour+'|'+weekday;
  const pending=queries.get(key);if(pending)return pending;
  const task=(async()=>{
    const chunks=new Map<string,ColumnData[]>();
    await parquetRead({file:snapshot.file,compressors,columns,rowFormat:'object',
      filter:{airport:{$eq:airport},hour_of_day:{$eq:hour},day_of_week:{$eq:weekday}},
      onChunk:chunk=>{const own=chunks.get(chunk.columnName)||[];own.push(chunk);chunks.set(chunk.columnName,own);}});
    const value=(column:string,index:number)=>{const chunk=chunks.get(column)?.find(item=>item.rowStart<=index&&item.rowEnd>index);return chunk?.columnData[index-chunk.rowStart];};
    const rows:Row[]=[];
    // Assemble only the matching airport/hour, rather than hundreds of thousands
    // of row objects. This bounds retained memory while sharing a small download.
    for(const chunk of chunks.get('airport')||[])for(let offset=0;offset<chunk.columnData.length;offset++){
      if(chunk.columnData[offset]!==airport)continue;
      const index=chunk.rowStart+offset;
      if(value('hour_of_day',index)!==hour||value('day_of_week',index)!==weekday)continue;
      const stamp=value('hour_et',index);
      if(!(stamp instanceof Date)||!Number.isFinite(stamp.getTime()))continue;
      const row:Row=Object.fromEntries(columns.map(column=>[column,value(column,index)]));
      // The logical timestamp is explicitly NOT UTC. The decoder's Date encodes
      // wall-clock fields; strip its synthetic Z and resolve in Eastern.
      row.hour_et=stamp.toISOString().slice(0,19);rows.push(row);
      if(rows.length>5000)throw Error('Checkpoint query exceeded the bounded matching history.');
    }
    rows.sort((a,b)=>String(b.hour_et).localeCompare(String(a.hour_et)));
    return {receipt:snapshot.receipt,rows:['standard','precheck'].flatMap(queue=>rows.filter(row=>row.queue_type===queue).slice(0,100))};
  })();
  if(queries.size>=24)queries.clear();queries.set(key,task);
  try{return await task;}catch(failure){queries.delete(key);throw failure;}
}
