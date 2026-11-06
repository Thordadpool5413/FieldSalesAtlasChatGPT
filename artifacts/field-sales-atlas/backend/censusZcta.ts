import {inflateRawSync} from 'node:zlib';

export type CensusZcta={code:string;lat:number;lon:number;landSqMiles:number|null};
type Dataset={records:CensusZcta[];sourceYear:number;sourceUrl:string;indexedAt:string};
const sources=[
  {year:2026,url:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_zcta_national.zip'},
  {year:2025,url:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip'},
];
let cache:{until:number;data:Dataset}|null=null;
let pending:Promise<Dataset>|null=null;

// Parse the standard ZIP central directory, not local headers that may use data descriptors.
function extractZipText(bytes:Buffer){
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  }
  if(end<0)throw Error('Invalid Census ZIP archive');
  const count=bytes.readUInt16LE(end+10);
  let offset=bytes.readUInt32LE(end+16);
  if(count<1||count>12||offset>=bytes.length)throw Error('Invalid Census ZIP index');
  for(let i=0;i<count;i++){
    if(offset+46>bytes.length||bytes.readUInt32LE(offset)!==0x02014b50)
      throw Error('Census ZIP directory corrupt');
    const method=bytes.readUInt16LE(offset+10);
    const compressed=bytes.readUInt32LE(offset+20);
    const expanded=bytes.readUInt32LE(offset+24);
    const n=bytes.readUInt16LE(offset+28),x=bytes.readUInt16LE(offset+30),
      comment=bytes.readUInt16LE(offset+32);
    const local=bytes.readUInt32LE(offset+42);
    if(offset+46+n+x+comment>bytes.length)throw Error('Invalid ZIP filename');
    const name=bytes.subarray(offset+46,offset+46+n).toString('utf8');
    offset+=46+n+x+comment;
    if(!name.toLowerCase().endsWith('.txt'))continue;
    if(compressed<=0||compressed>2500000||expanded>15000000||
      local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)
      throw Error('Unsafe Census ZIP archive member');
    const begin=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    if(begin+compressed>bytes.length)throw Error('Census ZIP file truncated');
    const data=bytes.subarray(begin,begin+compressed);
    const decoded=method===0?data:
      method===8?inflateRawSync(data,{maxOutputLength:15000000}):null;
    if(!decoded||decoded.length>15000000)
      throw Error('Unsupported Census ZIP compression');
    return decoded.toString('utf8');
  }
  throw Error('National Census ZIP archive is missing its data file');
}
function parse(text:string){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  const columns=lines[0]?.split('|').map(v=>v.trim().toUpperCase())||[];
  const id=columns.indexOf('GEOID'),latitude=columns.indexOf('INTPTLAT'),
    longitude=columns.indexOf('INTPTLONG'),sqmi=columns.indexOf('ALAND_SQMI');
  if(id<0||latitude<0||longitude<0)throw Error('Census ZCTA schema changed');
  const records:CensusZcta[]=[],seen=new Set<string>();
  for(const line of lines.slice(1)){
    const row=line.split('|'),code=String(row[id]||'').trim();
    const lat=Number(row[latitude]),lon=Number(row[longitude]);
    if(!/^\d{5}$/.test(code)||seen.has(code)||!Number.isFinite(lat)||
      !Number.isFinite(lon)||lat<17||lat>73||lon< -180||lon> -60)continue;
    seen.add(code);
    const area=sqmi<0?NaN:Number(row[sqmi]);
    records.push({
      code,lat,lon,
      landSqMiles:Number.isFinite(area)&&area>=0?Math.round(area*10)/10:null
    });
    if(records.length>50000)throw Error('Unexpected ZCTA count');
  }
  if(records.length<10000)throw Error('Census national ZCTA data incomplete');
  return records.sort((a,b)=>a.code.localeCompare(b.code));
}
async function load(year:number,url:string):Promise<Dataset>{
  const response=await fetch(url,{
    headers:{Accept:'application/zip','User-Agent':'FieldSalesAtlas/1.0 (Census reference index)'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok||Number(response.headers.get('content-length')||0)>2500000)
    throw Error('Census archive unavailable');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<1000||bytes.byteLength>2500000)throw Error('Census archive oversized');
  const records=parse(extractZipText(Buffer.from(bytes)));
  return {records,sourceYear:year,sourceUrl:url,indexedAt:new Date().toISOString()};
}
async function censusIndex():Promise<Dataset>{
  if(cache&&cache.until>Date.now())return cache.data;
  if(pending)return pending;
  pending=(async()=>{
    let failure:unknown;
    for(const source of sources){
      try{
        const data=await load(source.year,source.url);
        cache={until:Date.now()+86400000,data};
        return data;
      }catch(err){failure=err;}
    }
    throw failure instanceof Error?failure:Error('Census index unavailable');
  })().finally(()=>{pending=null;});
  return pending;
}
export async function searchCensusZctas(prefix:string){
  const dataset=await censusIndex();
  const results=dataset.records.filter(row=>row.code.startsWith(prefix)).slice(0,18);
  return {
    available:true,prefix,results,indexedCount:dataset.records.length,
    source:'U.S. Census Bureau Gazetteer',sourceUrl:dataset.sourceUrl,
    sourceYear:dataset.sourceYear,checkedAt:dataset.indexedAt,
    scope:'2020 Census-based ZIP Code Tabulation Areas; not USPS delivery ZIPs or postal boundaries.'
  };
}
export async function resolveCensusZcta(code:string){
  const dataset=await censusIndex();
  const area=dataset.records.find(r=>r.code===code);
  if(!area)return {found:false,code,message:'No Census ZCTA exists for this identifier.',
    source:'U.S. Census Bureau Gazetteer',sourceYear:dataset.sourceYear};
  let stateCode:string|null=null,county:string|null=null;
  let locationStatus='Census state and county could not be confirmed for this internal point.';
  try{
    const url='https://geocoding.geo.census.gov/geocoder/geographies/coordinates?'+
      new URLSearchParams({x:String(area.lon),y:String(area.lat),
        benchmark:'Public_AR_Current',vintage:'Current_Current',format:'json'}).toString();
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'FieldSalesAtlas/1.0 (Census internal point lookup)'},
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)throw Error('Census geocoder unavailable');
    const raw=await response.text();
    if(raw.length>650000)throw Error('Census geocoder response too large');
    const parsed=JSON.parse(raw) as {result?:{geographies?:Record<string,unknown>}};
    const geo=parsed.result?.geographies||{};
    const states=Array.isArray(geo.States)?geo.States as Record<string,unknown>[]:[];
    const counties=Array.isArray(geo.Counties)?geo.Counties as Record<string,unknown>[]:[];
    const candidate=String(states[0]?.STUSAB||'').toUpperCase();
    if(/^[A-Z]{2}$/.test(candidate))stateCode=candidate;
    county=typeof counties[0]?.NAME==='string'?counties[0].NAME.slice(0,100):null;
    if(stateCode)locationStatus='State identified by the ZCTA internal point, not the entire Census area.';
  }catch{
    locationStatus='State lookup unavailable. The reference coordinates remain available.';
  }
  return {
    found:true,...area,stateCode,county,locationStatus,
    source:'U.S. Census Bureau Gazetteer',sourceUrl:dataset.sourceUrl,
    sourceYear:dataset.sourceYear,
    scope:'Census ZCTA reference point, not a USPS postal ZIP or an address.'
  };
}
