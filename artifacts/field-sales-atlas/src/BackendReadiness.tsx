import { Activity,AlertTriangle,CheckCircle2,DatabaseZap,RefreshCw,ShieldCheck,Wifi,WifiOff } from 'lucide-react';
import { useCallback,useEffect,useState } from 'react';
import './BackendReadiness.css';
import { api } from './workspaceApi';

type Issue={code:string;severity:'critical'|'warning';count:number;message:string};
type Health={checkedAt:string;status:string;counts:Record<string,number>;issues:Issue[];truncated:boolean;scope:string};
type Source={id:string;label:string;available:boolean;details:string;checkedAt:string;scope:string;lastSuccessAt?:string|null};
type Sources={checkedAt:string;sources:Source[];missingIntegrations:string[];scope:string};
const labels:Record<string,string>={
  managers:'Managers',assignments:'Territory coverage',visits:'Coaching visits',coaching:'Coaching records',
  trips:'Trips',travelPlans:'Travel plans',availability:'Trainer time blocks'
};

export default function BackendReadiness(){
  const [health,setHealth]=useState<Health|null>(null);
  const [sources,setSources]=useState<Sources|null>(null);
  const [checking,setChecking]=useState(false);
  const [probing,setProbing]=useState(false);
  const [error,setError]=useState('');
  const [sourceError,setSourceError]=useState('');
  const refresh=useCallback(async()=>{
    setChecking(true);setError('');
    try{
      const response=await api.get('/api/intelligence/health');
      setHealth(response.data as Health);
    }catch(e){setError(e instanceof Error?e.message:'Workspace integrity check unavailable.');}
    finally{setChecking(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    let active=true;
    void api.get('/api/intelligence/sources').then(response=>{
      if(active)setSources(response.data as Sources);
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[refresh]);
  async function checkPublicSources(){
    if(probing)return;
    setProbing(true);setSourceError('');
    try{
      const response=await api.get('/api/intelligence/sources?check=1');
      setSources(response.data as Sources);
    }catch(e){setSourceError(e instanceof Error?e.message:'Public data providers could not be checked.');}
    finally{setProbing(false);}
  }
  const integrityColor=health?.status==='critical'?'bad':
    health?.status==='attention'||health?.status==='partial'?'warn':'good';
  const integrityLabel=health?.status==='critical'?'Needs repair':
    health?.status==='attention'?'Conflicts to review':
    health?.status==='partial'?'Incomplete inspection':
    health?.status==='empty'?'Empty workspace':'No structural issues found';
  return <section className='fsa-backend-health' aria-label='Backend integrity and live data-source diagnostics'>
    <header>
      <div className='fsa-health-header-icon'><DatabaseZap size={22}/></div>
      <div>
        <span className='fsa-health-eyebrow'>SYSTEM DIAGNOSTICS · SOURCE BACKED</span>
        <h2>Intelligence health</h2>
        <p>Check your saved workspace for missing relationships, schedule collisions and external source outages.</p>
      </div>
    </header>
    <div className='fsa-health-grid'>
      <section className='fsa-health-panel'>
        <div className='fsa-health-panel-head'>
          <h3><ShieldCheck size={18}/> Workspace integrity</h3>
          <button className='op-btn tiny' onClick={()=>void refresh()} disabled={checking} type='button'>
            <RefreshCw size={14}/>{checking?'Checking…':'Recheck'}
          </button>
        </div>
        {error&&<p className='fsa-health-error' role='alert'>{error}</p>}
        {!health&&!error&&<p role='status'>Checking saved workspace records…</p>}
        {health&&<>
          <div className={'fsa-health-status '+integrityColor}>
            {health.status==='critical'||health.status==='attention'||health.status==='partial'
              ?<AlertTriangle size={19}/>:<CheckCircle2 size={19}/>}
            <strong>{integrityLabel}</strong>
            <small>Scanned {new Date(health.checkedAt).toLocaleString()}</small>
          </div>
          <div className='fsa-health-counts'>
            {Object.entries(health.counts).map(([key,count])=>
              <div key={key}><b>{count.toLocaleString()}</b><span>{labels[key]||key}</span></div>)}
          </div>
          {health.issues.length>0&&<ul className='fsa-health-issues'>
            {health.issues.map(issue=><li key={issue.code}>
              <AlertTriangle size={15}/><span><strong>{issue.count} · {issue.code.replace(/-/g,' ')}</strong>
                <small>{issue.message}</small></span>
            </li>)}
          </ul>}
          <p className='fsa-health-disclaimer'>{health.scope}</p>
        </>}
      </section>
      <section className='fsa-health-panel'>
        <div className='fsa-health-panel-head'>
          <h3><Activity size={18}/> Public source diagnostics</h3>
          <button type='button' className='op-btn tiny' disabled={probing} onClick={()=>void checkPublicSources()}>
            <RefreshCw size={14}/>{probing?'Checking sources…':'Test sources'}
          </button>
        </div>
        <p className='fsa-health-disclaimer'>Tests run on demand and may take longer when official providers are slow. No live airline fares or verified driving ETA are invented.</p>
        {sourceError&&<p className='fsa-health-error' role='alert'>{sourceError}</p>}
        {probing&&<p role='status'>Checking Census, FAA, airport directories and a weather sample…</p>}
        {sources&&!sources.sources.length&&!probing&&
          <p className='fsa-health-disclaimer'>No completed source-health snapshot yet. Select Test sources to check providers now.</p>}
        {sources&&sources.sources.length>0&&<div className='fsa-health-sources'>
          {sources.sources.map(item=><div key={item.id} className='fsa-health-source'>
            {item.available?<Wifi size={16} className='working'/>:<WifiOff size={16} className='unavailable'/>}
            <div><strong>{item.label}</strong>
              <span>{item.details}</span>
              <small>{item.scope}{item.lastSuccessAt?
              ' · Last successful check '+new Date(item.lastSuccessAt).toLocaleDateString():''}</small>
            </div>
          </div>)}
          <p className='fsa-health-disclaimer'>Last checked {sources.checkedAt?new Date(sources.checkedAt).toLocaleString():'Not yet checked'}. A successful probe is not a service-level guarantee.</p>
        </div>}
        <h4>Not yet connected</h4>
        <ul className='fsa-health-missing'>
          {(sources?.missingIntegrations||[
            'Verified road-network routes and traffic ETA',
            'Live flight-specific status and airfare inventory',
            'Two-way calendar authorization',
            'Individually authenticated trainer access'
          ]).map(item=><li key={item}>{item}</li>)}
        </ul>
      </section>
    </div>
  </section>;
}
