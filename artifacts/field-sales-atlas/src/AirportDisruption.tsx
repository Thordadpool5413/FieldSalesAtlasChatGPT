
import { AlertTriangle,ArrowRight,CheckCircle2,Clock3,ExternalLink,Plane,RefreshCw,ShieldAlert } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { backupRiskRank } from './fieldExperience';
import type { Airport } from './opsModels';
import { api } from './workspaceApi';

type RiskLevel='critical'|'caution'|'none'|'unknown';
type AirportSignal={
  code:string;level:RiskLevel;headline:string;
  events:Array<{kind:string;reason:string;avgMinutes:number|null;updatedAt:string}>;
};
type Response={
  available:boolean;source:string;sourceUrl:string;checkedAt:string;scope:string;
  airports:AirportSignal[];message?:string;
};
type Candidate={airport:Airport;planningDriveMinutes:number};
type Props={
  origins:string[];arrival:string;gateways:Candidate[];
  onChooseAirport:(code:string)=>void;
  currentQuoteCount?:number;
  hourlyValue?:number;
  onCompareFlights?:()=>void;
  onReviewDeparture?:()=>void;
};
const severity=(risk?:AirportSignal)=>risk?.level==='critical'?2:risk?.level==='caution'?1:0;
const prettyTime=(date:string)=>date?new Date(date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Unknown';
export default function AirportDisruption({origins,arrival,gateways,onChooseAirport,currentQuoteCount=0,
  hourlyValue=0,onCompareFlights,onReviewDeparture}:Props){
  const [data,setData]=useState<Response|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [alertsEnabled,setAlertsEnabled]=useState(false);
  const [alertMessage,setAlertMessage]=useState('');
  const [changed,setChanged]=useState<string[]>([]);
  const [previewCode,setPreviewCode]=useState('');
  useEffect(()=>setPreviewCode(''),[arrival]);
  const previous=useRef<Record<string,RiskLevel>>({});
  const codes=useMemo(()=>[...new Set([
    ...origins,
    arrival,
    ...gateways.slice(0,10).map(g=>g.airport.iata)
  ].filter(code=>/^[A-Z]{3}$/.test(code)))].slice(0,16),[origins.join(','),arrival,gateways.map(g=>g.airport.iata).join(',')]);
  const key=codes.join(',');
  useEffect(()=>{
    if(!key){setData(null);setError('');return;}
    let active=true;
    async function check(){
      setLoading(true);
      try{
        const response=await api.get('/api/travel/disruptions?airports='+encodeURIComponent(key));
        const next=response.data as Response;
        if(!active)return;
        if(next.available){
          const newAlerts=next.airports.filter(s=>severity(s)>severity({level:previous.current[s.code]||'none'} as AirportSignal))
            .map(s=>s.code);
          setChanged(newAlerts);
          if(alertsEnabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&Object.keys(previous.current).length){
            next.airports.filter(s=>newAlerts.includes(s.code)).forEach(s=>{
              try{new Notification('Field Sales Atlas: '+s.code+' disruption',{body:s.headline,tag:'field-atlas-faa-'+s.code});}catch{/* Browser-level notification unavailable. */}
            });
          }
          previous.current=Object.fromEntries(next.airports.map(s=>[s.code,s.level]));
          setData(next);setError('');
        }else{
          setData(next);setChanged([]);
          setError(next.message||'FAA status is unavailable.');
        }
      }catch(e){
        if(!active)return;
        setError(e instanceof Error?e.message:'Airport status check failed.');
        setData({available:false,source:'FAA NAS',sourceUrl:'https://nasstatus.faa.gov/',checkedAt:new Date().toISOString(),scope:'Unknown',airports:[]});
        setChanged([]);
      }finally{if(active)setLoading(false);}
    }
    void check();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},180000);
    return ()=>{active=false;clearInterval(timer);};
  },[key,alertsEnabled]);
  async function enableAlerts(){
    if(typeof Notification==='undefined'){setAlertMessage('This browser does not support page notifications.');return;}
    if(!window.isSecureContext){setAlertMessage('Notifications require a secure HTTPS connection.');return;}
    try{const permission=await Notification.requestPermission();setAlertsEnabled(permission==='granted');setAlertMessage(permission==='granted'?'Alerts enabled while this planning screen is open.':'Notifications were not enabled. FAA monitoring remains available on screen.');}
    catch{setAlertMessage('Browser notification permission could not be requested.');}
  }
  const risks=useMemo(()=>new Map((data?.available?data.airports:[]).map(s=>[s.code,s])),[data]);
  const selected=risks.get(arrival);
  const originAlerts=origins.map(code=>risks.get(code)).filter((x):x is AirportSignal=>!!x&&x.level!=='none');
  const fresh=!!data?.available&&Number.isFinite(Date.parse(data.checkedAt))&&
    Date.now()-Date.parse(data.checkedAt)<=10*60*1000;
  const needsBackup=fresh&&!!arrival&&(selected?.level==='critical'||selected?.level==='caution');
  const critical=selected?.level==='critical';
  const backups=useMemo(()=>{
    if(!needsBackup)return [];
    return gateways.filter(g=>g.airport.iata!==arrival&&g.airport.scheduled).map(g=>({
      ...g,risk:risks.get(g.airport.iata)
    })).filter(g=>g.risk?.level!=='critical')
      .sort((a,b)=>backupRiskRank(a.risk)-backupRiskRank(b.risk)||a.planningDriveMinutes-b.planningDriveMinutes).slice(0,3);
  },[needsBackup,gateways,risks,arrival]);
  const currentGateway=gateways.find(g=>g.airport.iata===arrival);
  const proposal=backups.find(g=>g.airport.iata===previewCode);
  const timeDelta=proposal&&currentGateway?Math.round(proposal.planningDriveMinutes-currentGateway.planningDriveMinutes):null;
  const timeValueDelta=timeDelta===null?null:Math.round(timeDelta/60*Math.max(0,hourlyValue));
  return <section className="travel-panel atlas-nas-monitor" aria-label="FAA airport disruption intelligence">
    <div className="atlas-nas-head">
      <div className="atlas-nas-head-title">
        <span className="atlas-nas-symbol"><ShieldAlert size={19}/></span>
        <div><h3>Airport disruption watch</h3>
          <p>FAA ground stops, delay programs, and airport closures</p></div>
      </div>
      <div className="atlas-nas-actions">
        <span className={'atlas-nas-live'+(!data?.available?' is-offline':'')}>
          <span className="atlas-nas-live-dot"/>
          {loading&&!data?'Checking':data?.available?'FAA data received':'Not available'}
        </span>
        <button type="button" onClick={()=>{
          // Trigger immediate remount-free refresh by requesting one-off current data.
          // The backend caches FAA records for up to two minutes.
          setLoading(true);
          api.get('/api/travel/disruptions?airports='+encodeURIComponent(key))
            .then(response=>{
              const next=response.data as Response;
              setData(next);
              if(next.available){
                setChanged(next.airports.filter(s=>severity(s)>severity({level:previous.current[s.code]||'none'} as AirportSignal)).map(s=>s.code));
                previous.current=Object.fromEntries(next.airports.map(s=>[s.code,s.level]));setError('');
              }else setError(next.message||'Official status unavailable.');
            })
            .catch(e=>{setData(null);setChanged([]);setError(e instanceof Error?e.message:'Refresh failed.');})
            .finally(()=>setLoading(false));
        }} disabled={loading||!key} aria-label="Refresh FAA airport status"><RefreshCw size={16} className={loading?'atlas-spinning':''}/></button>
      </div>
    </div>
    {error&&<div role="alert" className="atlas-nas-unavailable"><AlertTriangle size={17}/> <span>{error} Do not assume airports are operating normally.</span></div>}
    {data?.available&&<div className="atlas-nas-content">
      <div className={'atlas-travel-decision '+(needsBackup?'is-action':'is-monitoring')} role="status">
        <span>{needsBackup?'ACTION RECOMMENDED':!fresh?'SOURCE TIMESTAMP STALE':'CURRENT FAA READINESS'}</span>
        <strong>{needsBackup?(critical?'Review alternate arrival airports':'Airport caution: compare alternatives'):
          !fresh?'Recheck the FAA before using this result':selected?.level==='unknown'?'Arrival airport status unknown':
          selected?.level==='none'?'No airport-wide FAA restriction reported':'Monitor your selected arrival airport'}</strong>
        <p>{needsBackup?'Nearby scheduled-service airport options are ranked by current FAA advisory level and estimated ground travel.':
          !fresh?'The last FAA report is over 10 minutes old, so no automatic airport recommendation is made.':
          'Airport-wide conditions are not individual flight status, availability, or booking confirmation.'}</p>
      </div>
      <div className="atlas-nas-status-grid">
        {[...new Set([...origins,arrival])].filter(Boolean).map(code=>{
          const row=risks.get(code);
          return <div className={'atlas-nas-airport atlas-nas-'+(row?.level||'unknown')} key={code}>
            <div className="atlas-nas-airport-top"><strong>{code}</strong>
              <span>{code===arrival?'Arrival':'Departure'}</span></div>
            <div className="atlas-nas-status-line">
              {!row||row.level==='unknown'?<Clock3 size={15}/>:row.level==='critical'?<AlertTriangle size={15}/>:row.level==='caution'?<Clock3 size={15}/>:<CheckCircle2 size={15}/>}
              <span>{row?.headline||'Airport status not returned. Verify with FAA or your airline.'}</span>
            </div>
            {row?.events?.slice(0,2).map((evt,i)=><p key={i}>{evt.reason||evt.kind}{evt.avgMinutes!=null?' · avg '+evt.avgMinutes+' min':''}</p>)}
            {changed.includes(code)&&<small className="atlas-nas-changed">New or elevated FAA advisory since previous check</small>}
          </div>;
        })}
      </div>
      {originAlerts.length>0&&<p className="atlas-nas-brief">
        <AlertTriangle size={16}/> Review departure options: {originAlerts.map(x=>x.code+' ('+x.headline+')').join(', ')}.
        {onReviewDeparture&&<button type="button" onClick={onReviewDeparture}>Check home airports <ArrowRight size={14}/></button>}
      </p>}
      {needsBackup&&<div className="atlas-nas-backups">
        <div className="atlas-nas-backup-heading">
          <div><strong>Alternate airport plans generated</strong>
            <p>{arrival} has {critical?'a critical FAA advisory':'an FAA caution'}. Options are ranked by reported FAA severity, then estimated ground travel. Flight availability remains unverified.</p></div>
          <Plane size={20}/>
        </div>
        {!backups.length?<p className="atlas-nas-muted">No lower-alert backup is listed among nearby airports. Recheck your airline and the FAA.</p>:backups.map(option=><div className="atlas-nas-backup" key={option.airport.iata}>
          <div><strong>{option.airport.iata}</strong><span>{option.airport.name}</span>
            <small>{option.risk?(option.risk.level==='none'?'No FAA restriction reported':option.risk.level==='unknown'?'FAA status unknown - verify with source':'FAA advisory present'):'Status unavailable - verify before choosing'}</small>
            <small>Ground travel estimate: {Math.round(option.planningDriveMinutes/5)*5} min · not live traffic or flight availability</small></div>
          <button type="button" onClick={()=>setPreviewCode(option.airport.iata)}
            aria-pressed={previewCode===option.airport.iata}>
            Preview change <ArrowRight size={14}/>
          </button>
        </div>)}
        {proposal&&<div className="atlas-nas-proposal" role="region" aria-label="Proposed alternate airport for the draft trip">
          <div className="atlas-nas-proposal-top">
            <div><span>PROPOSED CHANGE · NOT APPLIED</span>
              <h4>{arrival} <ArrowRight size={17}/> {proposal.airport.iata}</h4>
              <p>{proposal.airport.name}</p></div>
            <button type="button" className="atlas-nas-proposal-dismiss" aria-label="Close alternate airport proposal" onClick={()=>setPreviewCode('')}>×</button>
          </div>
          <div className="atlas-nas-proposal-comparison">
            <div><small>Current estimated ground time</small>
              <strong>{currentGateway?Math.round(currentGateway.planningDriveMinutes/5)*5+' min':'Unavailable'}</strong></div>
            <div><small>Alternate estimated ground time</small>
              <strong>{Math.round(proposal.planningDriveMinutes/5)*5} min</strong></div>
            <div><small>Estimated difference</small>
              <strong>{timeDelta===null?'Unknown':timeDelta>0?'+'+timeDelta+' min':timeDelta+' min'}</strong></div>
          </div>
          {timeValueDelta!==null&&hourlyValue>0&&<p className="atlas-nas-time-cost">Time-valued difference: {timeValueDelta>=0?'+':''}${timeValueDelta} at ${Math.round(hourlyValue)}/hour. This is planning value, not added airfare or actual cash expense.</p>}
          <p className="atlas-nas-proposal-note">These are planning estimates, not actual driving times or flight offers. {currentQuoteCount>0?currentQuoteCount+' entered airfare quote'+(currentQuoteCount===1?'':'s')+' may no longer apply. ':''}No saved trip or airline booking changes from this preview.</p>
          <div className="atlas-nas-proposal-actions">
            <button type="button" onClick={()=>setPreviewCode('')}>Keep current</button>
            <button type="button" className="is-primary" onClick={()=>{
              onChooseAirport(proposal.airport.iata);setPreviewCode('');
            }}>Use {proposal.airport.iata} in draft <ArrowRight size={15}/></button>
            {onCompareFlights&&<button type="button" onClick={()=>{onChooseAirport(proposal.airport.iata);onCompareFlights();setPreviewCode('');}}>
              Apply draft & compare flight options <Plane size={14}/>
            </button>}
          </div>
        </div>}
        <p className="atlas-nas-muted">Alternatives refresh while this planning screen is open. Nothing is rebooked, saved, or confirmed without your action.</p>
      </div>}
      <div className="atlas-nas-browser-alert"><button type="button" onClick={enableAlerts} disabled={alertsEnabled}>{alertsEnabled?'Browser alerts enabled':'Enable browser alerts'}</button><small>{alertMessage||'Optional alerts for newly elevated FAA advisories while this screen stays open. Not background push or individual flight tracking.'}</small></div>
      <div className="atlas-nas-foot">
        <span>Checked {prettyTime(data.checkedAt)} · Auto-refresh every 3 min while open · U.S. FAA scope</span>
        <a href="https://nasstatus.faa.gov/" target="_blank" rel="noreferrer">
          FAA source <ExternalLink size={13}/>
        </a>
      </div>
    </div>}
    {!data?.available&&!error&&<p className="atlas-nas-muted">Choose departure and arrival airports to monitor current operational advisories.</p>}
    <div className="atlas-nas-disclaimer">Airport-wide FAA conditions are not flight-status tracking, a guarantee of airline disruption, or a forecast for a future trip. Canadian airports may not be covered.</div>
  </section>;
}
