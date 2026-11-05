import {
ArrowRight,
Check,Clock3,
ExternalLink,
History,Info,
Plus,RefreshCw,ShieldCheck,
Trash2
} from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { useOp } from './Operations';
import { today } from './opsModels';
import './SecurityHistory.css';
import { api } from './workspaceApi';

type Queue = 'standard'|'precheck';
type Stats = {
  terminal:string;queue:Queue;hourRecords:number;
  historicalMedianPosted:number;typicalHourlyP75:number;typicalHourlyP95:number;
  observedStart:string;observedEnd:string;
};
type Report = {
  available:boolean;checkedAt:string;airport:string;localDate:string;localHour:number;
  etHour:number|null;etWeekday:number|null;timezone:string;
  rows:Stats[];requestedQueues:Queue[];limitations:string[];
  source:string;sourceUrl:string;attribution:string;license:string;message:string;
};
type Personal = {
  id:string;airport:string;terminal:string;queue:Queue;
  minutes:number;date:string;
};
// Airport options are candidate archive queries, not proof of published coverage.
 // The backend response determines whether usable rows actually exist.
const covered=['JFK','EWR','PHL','MCO','MIA','BOS','LGA','BWI','DCA','IAD',
  'DTW','CLT','CLE','PIT','CVG','CMH','JAX','DFW','IAH','HOU','MSP','STL',
  'DEN','SLC','SEA','SFO','SAN','PDX','LAS','PHX'];
const validCodes=new Set(covered);
const legacyPersonalKey='atlas-personal-security-experiences-v1';
function readPersonal(storageKey:string):Personal[]{
  try{
    // Preserve the previous device records under trainer A; other trainer seats start separately.
    const raw=localStorage.getItem(storageKey)||
      (storageKey.endsWith('trainer_a')?localStorage.getItem(legacyPersonalKey):null);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter((entry:Personal)=>entry&&typeof entry.id==='string'&&
      /^[A-Z]{3}$/.test(entry.airport) &&
      (entry.queue==='standard'||entry.queue==='precheck') &&
      Number.isFinite(entry.minutes)&&entry.minutes>0&&entry.minutes<300
    ).slice(0,80);
  }catch{return [];}
}
function median(nums:number[]):number|null{
  if(!nums.length)return null;
  const values=[...nums].sort((a,b)=>a-b);
  const middle=Math.floor(values.length/2);
  return Math.round(values.length%2?values[middle]:(values[middle-1]+values[middle])/2);
}
function hourLabel(hour:number){
  const time=new Date(2001,0,1,hour);
  return time.toLocaleTimeString('en-US',{hour:'numeric'});
}
export default function SecurityHistory({airport}:{airport:string}){
  const ctx=useOp();
  const personalKey=legacyPersonalKey+'-'+ctx.activeTrainerId;
  const [selected,setSelected]=useState(validCodes.has(airport)?airport:'MCO');
  const [date,setDate]=useState(today());
  const [hour,setHour]=useState(8);
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [buffer,setBuffer]=useState(35);
  const [personal,setPersonal]=useState(()=>readPersonal(personalKey));
  const [showLog,setShowLog]=useState(false);
  const [minutes,setMinutes]=useState(25);
  const [terminal,setTerminal]=useState('');
  const [queue,setQueue]=useState<Queue>('standard');
  const [feedback,setFeedback]=useState('');
  const code=selected;
  useEffect(()=>{if(validCodes.has(airport))setSelected(airport);},[airport]);
  const currentPersonal=useMemo(()=>personal.filter(row=>row.airport===code),[personal,code]);
  const queuePersonal=useMemo(()=>currentPersonal.filter(row=>row.queue===queue),[currentPersonal,queue]);
  useEffect(()=>{setReport(null);setError('');setFeedback('');},[code,date,hour]);
  useEffect(()=>{
    try{localStorage.setItem(personalKey,JSON.stringify(personal.slice(0,80)));}
    catch{/* Device storage unavailable */ }
  },[personal,personalKey]);
  async function check(){
    if(loading)return;
    setLoading(true);setError('');setFeedback('');setReport(null);
    const params=new URLSearchParams({airport:code,date,hour:String(hour)});
    try{
      const res=await api.get('/api/travel/security-history?'+params.toString());
      setReport(res.data as Report);
    }catch(err){
      setError(err instanceof Error?err.message:'The historical airport data could not be read.');
    }finally{setLoading(false);}
  }
  function addPersonal(){
    if(!Number.isFinite(minutes)||minutes<1||minutes>240){
      setFeedback('Enter a measured security-line time from 1 to 240 minutes.');
      return;
    }
    const record:Personal={
      id:typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Date.now().toString(),
      airport:code,terminal:terminal.trim().slice(0,45),queue,
      minutes:Math.round(minutes),date:today()
    };
    setPersonal(old=>[record,...old].slice(0,80));
    setFeedback('Your experience was saved on this device only.');
    setShowLog(false);
  }
  function deletePersonal(id:string){
    setPersonal(old=>old.filter(record=>record.id!==id));
    setFeedback('Personal record deleted from this device.');
  }
  const memory=median(queuePersonal.map(record=>record.minutes));
  return <section className="sh-root" aria-label="Airport checkpoint intelligence">
    <header className="sh-head">
      <div>
        <span className="sh-overline"><History size={15}/> FREE CHECKPOINT HISTORY</span>
        <h2>Airport Security Memory</h2>
        <p>Study posted checkpoint waits at the airport and time you plan to arrive.
          Record your own experience to learn a personal airport buffer.</p>
      </div>
      <ShieldCheck size={29}/>
    </header>
    <div className="sh-query">
      <label>Airport
        <select value={code} onChange={event=>setSelected(event.target.value)}>
          {covered.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>Airport local date (selects historical weekday)
        <input type="date" value={date} onChange={event=>setDate(event.target.value)}/>
      </label>
      <label>Checkpoint arrival time
        <select value={hour} onChange={event=>setHour(Number(event.target.value))}>
          {Array.from({length:24},(_,i)=><option key={i} value={i}>{hourLabel(i)}</option>)}
        </select>
      </label>
      <button className="sh-run" disabled={loading} onClick={()=>void check()}>
        {loading?<RefreshCw size={17}/>:<History size={17}/>}
        {loading?'Reading history…':'Analyze checkpoint history'} <ArrowRight size={16}/>
      </button>
    </div>
    {airport&&/^[A-Z]{3}$/.test(airport)&&!validCodes.has(airport)&&
      <p className="sh-note"><Info size={14}/>
        Your route's departure airport {airport} is not in the lookup selector.
        The separate {code} query is not a substitute for your actual departure airport.
        Availability is verified only when the archive returns records.
      </p>}
    {error&&<p className="sh-error" role="alert">{error}</p>}
    {report&&!report.available&&<div className="sh-error sh-empty-source" role="status">
      <div><strong>No usable checkpoint history returned for {code}</strong>
        <p>{report.message ||
          'No historical posted waits could be matched for this weekday and time.'}</p>
        <small>Unsupported, unavailable and empty sample results are not an estimate of zero minutes.</small>
      </div>
      <a href="https://huggingface.co/datasets/digitalhen/us-airport-wait-times"
        target="_blank" rel="noreferrer">View the public source <ArrowRight size={14}/></a>
    </div>}
    {report?.available&&<div className="sh-results">
      <div className="sh-results-head">
        <div><span className="sh-overline">AIRPORT-PUBLISHED ESTIMATE ARCHIVE</span>
          <h3>{report.airport} · {hourLabel(hour)} local</h3>
          <p>Source checked {new Date(report.checkedAt).toLocaleString()}.
            Historical observations are grouped by terminal and security type.</p></div>
        <span>Source timezone: U.S. Eastern</span>
      </div>
      <div className="sh-rows">
        {report.rows.map((row,index)=><article className="sh-row" key={index}>
          <div className="sh-row-top">
            <div><span>{row.queue==='precheck'?'TSA PRECHECK':'STANDARD SCREENING'}</span>
              <strong>{row.terminal}</strong></div>
            <small>{row.hourRecords} sampled hourly records</small>
          </div>
          <div className="sh-stats">
            <div><span>Median of hourly p50s</span>
              <strong>{row.historicalMedianPosted}<small> min</small></strong></div>
            <div><span>Median of hourly p75s</span>
              <strong>{row.typicalHourlyP75}<small> min</small></strong></div>
            <div><span>Median of hourly p95s</span>
              <strong>{row.typicalHourlyP95}<small> min</small></strong></div>
          </div>
          <div className="sh-buffer-review">
            <div><Clock3 size={15}/><span>Your security-time allowance</span></div>
            <strong>{buffer} min</strong>
            {row.queue===queue ? <span className={buffer<row.typicalHourlyP75?'sh-review-rose':'sh-review-aqua'}>
              {row.hourRecords<5?'Small historical sample. Do not rely on this comparison alone.':
                buffer<row.typicalHourlyP75?
                  'Below the recent sampled hourly p75 benchmark. Consider more time.' :
                  'Above the recent sampled hourly p75 benchmark. Real waits may still be longer.'}
            </span> : <span>Choose this lane below to compare its archive with your selected allowance.</span>}
          </div>
        </article>)}
      </div>
      <p className="sh-note"><Info size={15}/> These values are medians across up to 100 recent matching hourly records per queue, grouped by terminal. Each hourly record has its own published p50/p75/p95. These are not pooled passenger percentiles. The selected date determines weekday and time-zone conversion; it is not a forecast for that calendar date. The readings are airport-posted estimates, not measured passenger waits.</p>
    </div>}
    <div className="sh-memory">
      <div className="sh-memory-heading">
        <div><span className="sh-overline">PRIVATE · ON THIS DEVICE</span>
          <h3>Your airport memory</h3>
          <p>Track how long security took on past trips. Records are stored locally for the selected trainer seat, not synchronized with your shared workspace. Anyone using this device and trainer seat may view them.</p>
        </div>
        <button type="button" onClick={()=>setShowLog(v=>!v)}>
          {showLog?'Close':'Log a trip'} <Plus size={16}/>
        </button>
      </div>
      <div className="sh-memory-overview">
        <div><span>Recorded trips at {code}</span><strong>{currentPersonal.length}</strong></div>
        <div><span>Personal median · {queue==='precheck'?'PreCheck':'Standard'}</span><strong>{memory===null?'Not yet recorded':memory+' min'}</strong></div>
        <label>Screening lane to compare
          <select value={queue} onChange={event=>setQueue(event.target.value as Queue)}>
            <option value="standard">Standard</option>
            <option value="precheck">TSA PreCheck</option>
          </select>
        </label>
        <label>Use this many minutes for security
          <select value={buffer} onChange={event=>setBuffer(Number(event.target.value))}>
            {[15,20,25,30,35,45,60,75,90].map(value=><option key={value} value={value}>{value} min</option>)}
          </select>
        </label>
      </div>
      {showLog&&<div className="sh-log-form">
        <label>Observed elapsed minutes
          <input type="number" min={1} max={240} value={minutes}
            onChange={event=>setMinutes(Number(event.target.value))}/>
        </label>
        <label>Terminal (optional)
          <input value={terminal} onChange={event=>setTerminal(event.target.value)}
            maxLength={45} placeholder="Terminal A"/>
        </label>
        <label>Security lane
          <select value={queue} onChange={event=>setQueue(event.target.value as Queue)}>
            <option value="standard">Standard</option><option value="precheck">TSA PreCheck</option>
          </select>
        </label>
        <button type="button" className="sh-save" onClick={addPersonal}>Save experience <Check size={15}/></button>
      </div>}
      {currentPersonal.length>0&&<div className="sh-personal-list">          {queuePersonal.slice(0,4).map(item=><div key={item.id}>
          <span><strong>{item.minutes} min</strong> · {item.queue==='precheck'?'PreCheck':'Standard'}
            {item.terminal?' · '+item.terminal:''} · {item.date}</span>
          <button aria-label={'Delete personal record '+item.id} onClick={()=>deletePersonal(item.id)}>
            <Trash2 size={16}/></button>
        </div>)}
      </div>}
      {feedback&&<p className="sh-feedback" role="status">{feedback}</p>}
    </div>
    <footer className="sh-sources">
      <Info size={16}/>
      <div><strong>Not a live TSA wait-time API.</strong> Archive coverage, availability and freshness vary.
        Airport-posted queue estimates can differ from real screening experiences.
        <span> Archive: <a href="https://huggingface.co/datasets/digitalhen/us-airport-wait-times"
          target="_blank" rel="noreferrer">Henry Williams, CC BY 4.0 <ExternalLink size={12}/></a>.
          Do not use historical queue estimates as a guarantee of boarding-time sufficiency.</span>
      </div>
    </footer>
  </section>;
}
