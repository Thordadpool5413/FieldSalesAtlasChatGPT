import {
CalendarDays,ChevronDown,CircleAlert,
CloudLightning,
CloudRain,
CloudSun,
ExternalLink,RefreshCw,ShieldCheck,Wind
} from 'lucide-react';
import { useEffect,useState } from 'react';
import type { Airport } from './opsModels';
import './TravelForecast.css';
import { api } from './workspaceApi';

type AviationWeatherData={
  icao:string;source:string;checkedAt:string;available:boolean;message:string;
  observation?:null|{
    reportTime:string|null;category:string;raw:string;
    windKnots:number|null;visibility:string|null;temperatureC:number|null
  };
  forecast?:null|{raw:string;validFrom:string|null;validTo:string|null};
};
type Period={
  number:number;name:string;startTime:string;endTime:string;
  isDaytime:boolean;temperature:number|null;temperatureUnit:string;
  windSpeed:string;windDirection:string;shortForecast:string;
  probabilityOfPrecipitation:number|null;signals:string[];
};
type Outlook={
  available:boolean;checkedAt:string;issuedAt:string;timeZone:string;
  source:string;sourceUrl:string;scope:string;periods:Period[];message:string;
};
function localTime(iso:string){
  if(!iso)return 'Time unavailable';
  const d=new Date(iso);
  return Number.isNaN(d.getTime())?'Time unavailable':d.toLocaleString(undefined,{
    month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
  });
}
function windowDate(iso:string){
  // Official NWS periods include their own local UTC offset.
  return iso.slice(0,10);
}
export default function AviationWeather({
  airport,travelDate
}:{airport?:Airport;travelDate?:string}){
  const [station,setStation]=useState('');
  const [weather,setWeather]=useState<AviationWeatherData|null>(null);
  const [outlook,setOutlook]=useState<Outlook|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const icao=station||airport?.icao||'';
  const coordinates=typeof airport?.lat==='number'&&
    Number.isFinite(airport.lat)&&typeof airport.lon==='number'&&
    Number.isFinite(airport.lon);
  const stationAvailable=/^[A-Z]{4}$/.test(icao.trim().toUpperCase());
  const canCheck=stationAvailable||coordinates;
  useEffect(()=>{
    setStation('');setWeather(null);setOutlook(null);setError('');
  },[airport?.iata,airport?.icao,airport?.lat,airport?.lon]);

  async function check(){
    if(!canCheck){
      setError('Select an airport with coordinates or enter a valid ICAO station.');
      return;
    }
    setBusy(true);setError('');setWeather(null);setOutlook(null);
    const stationRequest=stationAvailable?
      api.get('/api/travel/aviation/'+icao.trim().toUpperCase()):Promise.resolve(null);
    const outlookRequest=coordinates?
      api.get('/api/travel/point-forecast?lat='+airport!.lat+'&lon='+airport!.lon):
      Promise.resolve(null);
    try{
      const [observation,point]=await Promise.allSettled([stationRequest,outlookRequest]);
      if(observation.status==='fulfilled'&&observation.value)
        setWeather(observation.value.data as AviationWeatherData);
      if(point.status==='fulfilled'&&point.value)
        setOutlook(point.value.data as Outlook);
      if((stationAvailable&&observation.status==='rejected')||
         (coordinates&&point.status==='rejected')){
        setError('Some official weather information could not be loaded. Unavailable data is not treated as clear weather.');
      }
    }finally{setBusy(false);}
  }
  const matching=Boolean(travelDate&&outlook?.periods.some(p=>windowDate(p.startTime)===travelDate));
  const weatherSignals=outlook?.periods.filter(p=>p.signals.length)||[];
  const selectedPeriods=outlook?.periods.filter(p=>windowDate(p.startTime)===travelDate)||[];
  const weatherAtArrival=selectedPeriods.flatMap(p=>p.signals).filter((v,i,a)=>a.indexOf(v)===i);

  return <section className='travel-panel travel-weather-panel fsa-destination-weather'>
    <div className='travel-section-line'>
      <div>
        <h3>Destination Weather Intelligence</h3>
        <p>Current aviation conditions plus the official seven-day forecast for your selected airport.</p>
      </div>
      <CloudSun size={22}/>
    </div>
    <div className='travel-weather-body'>
      <div className='travel-weather-check'>
        <label htmlFor='travel-weather-station'>ICAO weather station</label>
        <input id='travel-weather-station' maxLength={4}
          placeholder='e.g. KMCO' value={icao}
          onChange={e=>{setStation(e.target.value.toUpperCase().replace(/[^A-Z]/g,''));setWeather(null);}}
        />
        <button className='op-btn tiny' type='button' onClick={check}
          disabled={busy||!canCheck}
          aria-label={busy?'Retrieving official airport weather':'Check current weather and seven-day outlook'}>
          <RefreshCw size={15} className={busy?'fsa-weather-spin':''}/>
          {busy?'Checking official sources…':'Check weather + outlook'}
        </button>
      </div>
      {!airport?.icao&&<p className='travel-microcopy'>
        If this airport has no ICAO station in the directory, its point forecast may still be available from its coordinates.
      </p>}
      {error&&<p className='travel-note caution' role='alert'><CircleAlert size={14}/>{error}</p>}
      {weather&&(weather.available?<>
        <div className='travel-weather-summary'>
          <span className='travel-weather-station'>{weather.icao}</span>
          {weather.observation?.category&&<span className='travel-weather-category'>{weather.observation.category}</span>}
          <span>{weather.observation?.reportTime||'Observation time unavailable'}</span>
        </div>
        {weather.observation&&<>
          <div className='travel-weather-facts'>
            <span>Wind<strong>{weather.observation.windKnots!=null?weather.observation.windKnots+' kt':'Unknown'}</strong></span>
            <span>Visibility<strong>{weather.observation.visibility||'Unknown'}</strong></span>
            <span>Temperature<strong>{weather.observation.temperatureC!=null?weather.observation.temperatureC+' °C':'Unknown'}</strong></span>
          </div>
          {weather.observation.raw&&<p className='travel-weather-raw'>{weather.observation.raw}</p>}
        </>}
        {weather.forecast?.raw&&<details className='travel-weather-forecast'>
          <summary>Terminal aviation forecast (TAF) <ChevronDown size={14}/></summary>
          <p>{weather.forecast.raw}</p>
        </details>}
        <small>{weather.source} · checked {localTime(weather.checkedAt)}. Check each observation timestamp.</small>
      </>:<p className='travel-note caution'><CircleAlert size={14}/>{weather.message||'No current aviation observation.'}</p>)}
      {busy&&<div className='fsa-outlook-loading' role='status'>
        <RefreshCw className='fsa-weather-spin' size={18}/>
        Retrieving official National Weather Service forecast…
      </div>}
      {outlook&&<section className='fsa-outlook' aria-labelledby='fsa-outlook-title'>
        <header className='fsa-outlook-head'>
          <div>
            <span className='fsa-outlook-kicker'><CalendarDays size={15}/> AIRPORT POINT FORECAST</span>
            <h4 id='fsa-outlook-title'>{airport?.iata||'Selected airport'} · Seven-day outlook</h4>
            <p>{outlook.available
              ?'Official forecast periods for the airport coordinate, not a prediction of airline operations.'
              :'No official NWS forecast is currently available for this location.'}</p>
          </div>
          <a href='https://www.weather.gov/documentation/services-web-api'
            target='_blank' rel='noreferrer'>NWS source <ExternalLink size={14}/></a>
        </header>
        {outlook.available?<>
          {travelDate&&<div className={'fsa-outlook-trip-date '+(matching?'in-range':'out-of-range')}>
            <CalendarDays size={17}/>
            <span>Travel begins <strong>{travelDate}</strong></span>
            <span>{matching
              ?weatherAtArrival.length?'Conditions to review: '+weatherAtArrival.join(', '):'No heuristic weather flags in published periods'
              :'Outside published NWS forecast window. Do not infer future conditions.'}</span>
          </div>}
          <div className='fsa-outlook-periods' role='list'
            aria-label='Official day and night forecast periods. Scroll horizontally to inspect all days.'>
            {outlook.periods.map(period=>{
              const active=Boolean(travelDate&&windowDate(period.startTime)===travelDate);
              return <article key={period.number} role='listitem'
                className={'fsa-outlook-period'+(active?' is-travel-day':'')+(period.signals.length?' has-conditions':'')}>
                <span className='fsa-outlook-period-time'>{period.name||windowDate(period.startTime)}</span>
                <strong>{period.temperature===null?'—':period.temperature+'°'+period.temperatureUnit}</strong>
                <span className='fsa-outlook-period-summary'>{period.shortForecast||'Forecast text unavailable'}</span>
                <span className='fsa-outlook-wind'><Wind size={13}/>{period.windSpeed||'Wind unavailable'} {period.windDirection}</span>
                {period.probabilityOfPrecipitation!==null&&<span className='fsa-outlook-precip'>
                  <CloudRain size={13}/>{period.probabilityOfPrecipitation}% precip.
                </span>}
                {period.signals.length>0&&<span className='fsa-outlook-signal'>
                  <CloudLightning size={13}/>{period.signals[0]}
                </span>}
              </article>;
            })}
          </div>
          <div className='fsa-outlook-summary'>
            <span><ShieldCheck size={17}/>{outlook.source} · Retrieved {localTime(outlook.checkedAt)}</span>
            <span>{weatherSignals.length} forecast period{weatherSignals.length===1?'':'s'} with weather cues for review</span>
          </div>
        </>:<p className='fsa-outlook-unavailable'><CircleAlert size={17}/>
          {outlook.message||'No U.S. NWS point forecast exists for this airport.'}
        </p>}
      </section>}
      <p className='travel-microcopy'>
        Weather cues come from public forecast text and simple transparent thresholds.
        They are not airline cancellation probabilities, flight availability, confirmed road conditions,
        or an alternative to checking FAA advisories and airline alerts.
      </p>
    </div>
  </section>;
}
