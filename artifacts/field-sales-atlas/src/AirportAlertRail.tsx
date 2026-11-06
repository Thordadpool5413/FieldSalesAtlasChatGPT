import { AlertTriangle,ArrowRight,Bell,BellOff,Clock3,ExternalLink,ShieldCheck } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { api } from './workspaceApi';

type Signal={code:string;level:'critical'|'caution'|'none'|'unknown';headline:string};
type FAA={available:boolean;checkedAt:string;airports:Signal[]};
export default function AirportAlertRail({codes,onReview}:{codes:string[];onReview:()=>void}){
 const watched=useMemo(()=>[...new Set(codes.filter(c=>/^[A-Z]{3}$/.test(c)))].slice(0,16),[codes.join(',')]);
 const key=watched.join(',');
 const [data,setData]=useState<FAA|null>(null),[unavailable,setUnavailable]=useState(false),[message,setMessage]=useState('');
 const [notify,setNotify]=useState(()=>{try{return typeof Notification!=='undefined'&&Notification.permission==='granted'}catch{return false}});
 const previous=useRef<Record<string,Signal['level']>>({}),loaded=useRef(false);
 useEffect(()=>{
  previous.current={};loaded.current=false;
  if(!key){setData(null);setUnavailable(false);return;}
  let active=true;
  async function check(){
   try{
    const res=await api.get('/api/travel/disruptions?airports='+encodeURIComponent(key));
    const next=res.data as FAA;
    if(!active)return;
    if(next.available){
     if(loaded.current&&notify&&document.visibilityState==='visible'&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      for(const item of next.airports.filter(s=>s.level==='critical'&&previous.current[s.code]!=='critical')){
       try{new Notification('Field Sales Atlas: '+item.code+' FAA alert',{body:item.headline,tag:'atlas-faa-'+item.code});}catch{/* On-screen watch remains available. */}
      }
     }
     loaded.current=true;previous.current=Object.fromEntries(next.airports.map(s=>[s.code,s.level]));
     setData(next);setUnavailable(false);
    }else{setData(null);setUnavailable(true);}
   }catch{if(active){setData(null);setUnavailable(true);}}
  }
  void check();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},180000);
  const visible=()=>{if(document.visibilityState==='visible')void check();};
  document.addEventListener('visibilitychange',visible);
  return ()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible)};
 },[key,notify]);
 async function enable(){
  if(typeof Notification==='undefined'||!window.isSecureContext){
   setMessage('Browser alerts unavailable; on-screen monitoring remains active.');return;
  }
  try{
   const permission=await Notification.requestPermission();
   setNotify(permission==='granted');
   setMessage(permission==='granted'?'Alerts enabled while the app is open.':'Permission not granted; on-screen watch continues.');
  }catch{setMessage('Browser alert permission could not be requested.');}
 }
 if(!key)return null;
 const critical=(data?.airports||[]).filter(s=>s.level==='critical');
 const caution=(data?.airports||[]).filter(s=>s.level==='caution');
 const unknown=(data?.airports||[]).filter(s=>s.level==='unknown');
 const severity=unavailable?'unknown':critical.length?'critical':caution.length?'caution':unknown.length?'unknown':'monitoring';
 const checked=data?.checkedAt?new Date(data.checkedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
 return <section className={'atlas-global-alert atlas-watch-'+severity} role='region' aria-label='Upcoming trip airport watch'>
  <span className='atlas-alert-orbit'>{unavailable||critical.length?<AlertTriangle size={17}/>:data?<ShieldCheck size={17}/>:<Clock3 size={17}/>}</span>
  <div className='atlas-watch-summary'>
   <strong>{unavailable?'FAA airport information unavailable':critical.length?critical.length+' critical airport advisory'+(critical.length===1?'':'ies'):caution.length?caution.length+' airport caution'+(caution.length===1?'':'s'):unknown.length?unknown.length+' airport status'+(unknown.length===1?' is':'es are')+' unknown':'FAA watch · '+watched.length+' upcoming travel gateway'+(watched.length===1?'':'s')}</strong>
   <small>{unavailable?'Check the FAA and airline directly.':critical.length?critical.slice(0,3).map(s=>s.code+' · '+s.headline).join(' / '):caution.length?caution.slice(0,3).map(s=>s.code+' · '+s.headline).join(' / '):unknown.length?unknown.slice(0,3).map(s=>s.code+' · No FAA feed result, verify directly').join(' / '):'No critical restrictions reported for these airports in the current FAA feed; individual flights are not verified.'}{checked?' · Checked '+checked:''}</small>
   {message&&<small role='status'>{message}</small>}
  </div>
  <div className='atlas-watch-actions'>
   <button type='button' className='atlas-watch-notify' onClick={()=>void enable()} disabled={notify} aria-pressed={notify}>
    {notify?<Bell size={16}/>:<BellOff size={16}/>}<span>{notify?'Alerts on':'Enable alerts'}</span>
   </button>
   <button type='button' className='atlas-watch-review' onClick={onReview}>{critical.length?'Review alternatives':'Review travel'} <ArrowRight size={15}/></button>
   <a href='https://nasstatus.faa.gov/' target='_blank' rel='noreferrer' aria-label='Verify with FAA' className='atlas-watch-source'><ExternalLink size={16}/></a>
  </div>
 </section>;
}
