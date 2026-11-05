
import { Check,CircleAlert,Plane,Plus,Settings2,X } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import type { Airport,TrainerProfile } from './opsModels';
import './TrainerProfilesEditor.css';
import { api } from './workspaceApi';

type Props={profiles:TrainerProfile[];airports:Airport[];onClose:()=>void;onSaved:()=>Promise<void>};
const names=['trainer_a','trainer_b'] as const;
function base(slot:'trainer_a'|'trainer_b'):TrainerProfile{
  return {id:slot,name:slot==='trainer_a'?'Trainer 1':'Trainer 2',homeCity:'',homeAirports:[],
    homeDriveMinutes:{},preferredAirlines:'',preferNonstop:true,maxConnections:1,notes:''};
}
export default function TrainerProfilesEditor({profiles,airports,onClose,onSaved}:Props){
  const [slot,setSlot]=useState<'trainer_a'|'trainer_b'>('trainer_a');
  const [forms,setForms]=useState<Record<'trainer_a'|'trainer_b',TrainerProfile>>({
    trainer_a:{...base('trainer_a'),...profiles.find(p=>p.id==='trainer_a')},
    trainer_b:{...base('trainer_b'),...profiles.find(p=>p.id==='trainer_b')},
  });
  const [airportSearch,setAirportSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');
  const dialogRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('.trainer-dialog-close')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return;
      const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])'
      )||[]).filter(el=>el.getClientRects().length>0);
      if(!controls.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus();}
    };
    window.addEventListener('keydown',onKey);
    return ()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=overflow;before?.focus({preventScroll:true});};
  },[]);
  const active=forms[slot];
  useEffect(()=>{function key(e:KeyboardEvent){if(e.key==='Escape'&&!busy)onClose();}window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[busy,onClose]);
  const matches=useMemo(()=>airports.filter(a=>
    /^[A-Z]{3}$/.test(a.iata) && !active.homeAirports.includes(a.iata) &&
    (a.iata+' '+a.name+' '+a.state).toLowerCase().includes(airportSearch.toLowerCase())
  ).slice(0,8),[airports,airportSearch,active.homeAirports]);
  function change(patch:Partial<TrainerProfile>){setForms(f=>({...f,[slot]:{...f[slot],...patch}}));setSaved('');}
  function addAirport(code:string){
    if(!/^[A-Z]{3}$/.test(code)||active.homeAirports.includes(code)||active.homeAirports.length>=6)return;
    change({homeAirports:[...active.homeAirports,code],homeDriveMinutes:{...active.homeDriveMinutes,[code]:active.homeDriveMinutes[code]??60}});
    setAirportSearch('');
  }
  async function save(){
    if(active.name.trim().length<2){setError('Enter a trainer name with at least two characters.');return;}
    setBusy(true);setError('');
    try{
      await api.put('/api/trainer-profiles/'+slot,{...active,name:active.name.trim()});
      setSaved(active.name+' saved');
      await onSaved();
    }catch(e){setError(e instanceof Error?e.message:'Could not save the trainer profile.');}
    finally{setBusy(false);}
  }
  return <div className="trainer-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div className="trainer-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Manage the two field sales trainers">
      <div className="trainer-dialog-head"><div><h2>Your two field sales trainers</h2><p>Each trainer has their own departure airports and preferences. No account or sign-in.</p></div>
        <button className="trainer-dialog-close" onClick={onClose} disabled={busy} aria-label="Close trainer settings"><X size={21}/></button>
      </div>
      <div className="trainer-switch">
        {names.map((value,i)=><button key={value} className={slot===value?'active':''} onClick={()=>{setSlot(value);setError('');setAirportSearch('');}}>
          <span className={'trainer-switch-dot trainer-switch-'+i}/><strong>{forms[value].name||'Trainer '+(i+1)}</strong>
          <small>{forms[value].homeAirports.join(' · ')||'No home airport yet'}</small>
        </button>)}
      </div>
      <div className="trainer-dialog-body">
        <div className="trainer-dialog-fields">
          <label>Trainer name<input value={active.name} maxLength={80} onChange={e=>change({name:e.target.value})} placeholder="Full name"/></label>
          <label>Home city / base location<input value={active.homeCity} maxLength={100} onChange={e=>change({homeCity:e.target.value})} placeholder="City, state"/></label>
        </div>
        <div className="trainer-dialog-section"><div><strong>Departure airports</strong><span>Choose airports this trainer can realistically fly out of.</span></div><Plane size={18}/></div>
        <div className="trainer-airport-list">
          {active.homeAirports.map(code=><div className="trainer-airport-item" key={code}>
            <div><strong>{code}</strong><span>{airports.find(a=>a.iata===code)?.name||'Saved departure airport'}</span></div>
            <label><span>Drive min</span><input type="number" min={0} max={300} value={active.homeDriveMinutes[code]??60}
              onChange={e=>change({homeDriveMinutes:{...active.homeDriveMinutes,[code]:Math.max(0,Math.min(300,Number(e.target.value)||0))}})}/></label>
            <button onClick={()=>change({homeAirports:active.homeAirports.filter(c=>c!==code)})} aria-label={'Remove '+code}><X size={16}/></button>
          </div>)}
          {!active.homeAirports.length&&<p className="trainer-no-airports">Add at least one home airport to compare travel routes for this trainer.</p>}
        </div>
        <div className="trainer-airport-search"><label htmlFor="trainer-airport-input">Find an airport</label>
          <input id="trainer-airport-input" value={airportSearch} onChange={e=>setAirportSearch(e.target.value)} placeholder="Search by city or airport code" autoComplete="off"/>
          {airportSearch&&<div className="trainer-airport-suggestions">
            {matches.map(a=><button key={a.iata} onClick={()=>addAirport(a.iata)}><strong>{a.iata}</strong><span>{a.name}</span><Plus size={15}/></button>)}
            {!matches.length&&<span>No available airport matches.</span>}
          </div>}
        </div>
        <div className="trainer-dialog-section"><div><strong>Flight preferences</strong><span>Used when comparing itinerary choices.</span></div><Settings2 size={18}/></div>
        <div className="trainer-dialog-fields">
          <label>Preferred airlines<input maxLength={160} value={active.preferredAirlines} onChange={e=>change({preferredAirlines:e.target.value})} placeholder="Optional"/></label>
          <label>Maximum connections<select value={active.maxConnections} onChange={e=>change({maxConnections:Number(e.target.value)})}>
            {[0,1,2,3].map(n=><option key={n} value={n}>{n===0?'Nonstop only':n+' per direction'}</option>)}</select></label>
        </div>
        <label className="trainer-prefer"><input type="checkbox" checked={active.preferNonstop} onChange={e=>change({preferNonstop:e.target.checked})}/> Prefer nonstop flights when practical</label>
        {error&&<div className="trainer-error"><CircleAlert size={16}/>{error}</div>}
        {saved&&<p className="trainer-saved"><Check size={15}/>{saved}</p>}
      </div>
      <div className="trainer-dialog-footer"><p>Changing a trainer name with existing assignments is blocked to protect saved manager records.</p>
        <button onClick={onClose} className="op-btn">Close</button>
        <button onClick={save} className="op-btn primary" disabled={busy}><Check size={16}/>{busy?'Saving…':'Save trainer'}</button>
      </div>
    </div>
  </div>;
}
