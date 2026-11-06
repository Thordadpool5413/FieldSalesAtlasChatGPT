/* NOAA / National Weather Service point forecast.
   Public U.S. weather, not flight status or an airline disruption prediction.
   Inputs are airport coordinates; no manager/employee details leave the workspace. */
export type PointForecastPeriod = {
  number:number;
  name:string;
  startTime:string;
  endTime:string;
  isDaytime:boolean;
  temperature:number|null;
  temperatureUnit:string;
  windSpeed:string;
  windDirection:string;
  shortForecast:string;
  probabilityOfPrecipitation:number|null;
  signals:string[];
};
export type PointForecast = {
  available:boolean;
  checkedAt:string;
  issuedAt:string;
  timeZone:string;
  source:string;
  sourceUrl:string;
  scope:string;
  periods:PointForecastPeriod[];
  message:string;
};
const forecastCache=new Map<string,{expires:number;data:PointForecast}>();
const forecastPending=new Map<string,Promise<PointForecast>>();
const txt=(x:unknown,n:number)=>typeof x==='string'?x.slice(0,n):'';
function missing(message:string):PointForecast {
  return {
    available:false,checkedAt:new Date().toISOString(),issuedAt:'',timeZone:'',
    source:'NOAA National Weather Service',
    sourceUrl:'https://www.weather.gov/documentation/services-web-api',
    scope:'U.S. airport point forecast for up to seven days. Not a flight-delay forecast.',
    periods:[],message
  };
}
async function getOfficialJson(url:string){
  const response=await fetch(url,{
    headers:{
      Accept:'application/geo+json',
      'User-Agent':'FieldSalesAtlas/1.0 (public NWS airport travel outlook)'
    },
    signal:AbortSignal.timeout(9000)
  });
  if(!response.ok)throw Error('NWS returned HTTP '+response.status);
  const headerLength=Number(response.headers.get('content-length')||0);
  if(headerLength>1300000)throw Error('NWS forecast response exceeded size limit');
  const raw=await response.text();
  if(raw.length>1300000)throw Error('NWS forecast response exceeded size limit');
  return JSON.parse(raw) as {properties?:Record<string,unknown>};
}
function weatherSignals(detail:string,wind:string,precip:number|null){
  const desc=detail.toLowerCase(),alerts:string[]=[];
  if(/thunderstorm|tornado/.test(desc))alerts.push('Thunderstorm conditions');
  if(/snow|ice|sleet|freezing rain|blizzard/.test(desc))alerts.push('Winter conditions');
  if(/fog/.test(desc))alerts.push('Reduced visibility possible');
  const speeds=(wind.match(/\d+/g)||[]).map(Number);
  if(speeds.length&&Math.max(...speeds)>=25)alerts.push('Wind at least 25 mph');
  if(precip!==null&&precip>=70)alerts.push('High precipitation chance');
  return alerts.slice(0,4);
}
async function loadPoint(lat:number,lon:number):Promise<PointForecast>{
  try{
    // NWS requires a points lookup. The returned forecast address is validated
    // to prevent fetching arbitrary URLs.
    const position=await getOfficialJson(
      'https://api.weather.gov/points/'+lat.toFixed(4)+','+lon.toFixed(4)
    );
    const point=position.properties||{};
    const forecastUrl=txt(point.forecast,400);
    const target=new URL(forecastUrl);
    if(target.protocol!=='https:'||target.hostname!=='api.weather.gov'||
       !/^\/gridpoints\/[A-Za-z0-9]+\/\d+,\d+\/forecast$/.test(target.pathname))
      throw Error('Unexpected NWS forecast address');
    const response=await getOfficialJson(target.toString());
    const properties=response.properties||{};
    const rows=Array.isArray(properties.periods)?properties.periods:[];
    if(!rows.length) return missing('NWS has not published a forecast for this airport point.');
    const periods:PointForecastPeriod[]=[];
    for(const value of rows.slice(0,16)){
      if(!value||typeof value!=='object')continue;
      const r=value as Record<string,unknown>;
      const probability=r.probabilityOfPrecipitation;
      const precipitationValue=probability&&typeof probability==='object'?
        (probability as Record<string,unknown>).value:null;
      const pct=typeof precipitationValue==='number'?precipitationValue:NaN;
      const chance=Number.isFinite(pct)?Math.max(0,Math.min(100,Math.round(pct))):null;
      const temp=typeof r.temperature==='number'?r.temperature:NaN;
      const wind=txt(r.windSpeed,60);
      const summary=txt(r.shortForecast,200);
      periods.push({
        number:Number.isFinite(Number(r.number))?Number(r.number):periods.length+1,
        name:txt(r.name,50),startTime:txt(r.startTime,44),endTime:txt(r.endTime,44),
        isDaytime:r.isDaytime===true,
        temperature:Number.isFinite(temp)?temp:null,
        temperatureUnit:txt(r.temperatureUnit,8),
        windSpeed:wind,windDirection:txt(r.windDirection,12),
        shortForecast:summary,
        probabilityOfPrecipitation:chance,
        signals:weatherSignals(summary+' '+txt(r.detailedForecast,1100),wind,chance)
      });
    }
    if(!periods.length)return missing('The official forecast is empty for this airport.');
    return {
      available:true,checkedAt:new Date().toISOString(),
      issuedAt:txt(properties.updateTime||properties.generatedAt,44),
      timeZone:txt(point.timeZone,80),
      source:'NOAA National Weather Service',
      sourceUrl:'https://api.weather.gov/',
      scope:'Weather outlook for the airport point. Not airline flight status, cancellation probability or road conditions.',
      periods,message:''
    };
  }catch{
    return missing('The National Weather Service forecast could not be retrieved for this airport. No forecast has been assumed.');
  }
}
export async function nwsAirportForecast(lat:number,lon:number):Promise<PointForecast>{
  const key=lat.toFixed(2)+','+lon.toFixed(2);
  const now=Date.now();
  const cached=forecastCache.get(key);
  if(cached&&cached.expires>now)return cached.data;
  const existing=forecastPending.get(key);
  if(existing)return existing;
  const call=loadPoint(lat,lon).then(data=>{
    if(forecastCache.size>=120)forecastCache.clear();
    forecastCache.set(key,{expires:Date.now()+(data.available?900000:60000),data});
    return data;
  }).finally(()=>forecastPending.delete(key));
  forecastPending.set(key,call);
  return call;
}
