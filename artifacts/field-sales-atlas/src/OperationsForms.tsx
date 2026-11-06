
import {
ArrowRight,Check,
CircleAlert,Copy,
Trash2,X
} from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import { CANADA_CITIES,CANADA_REGIONS } from './CanadaRegions';
import { useOp } from './Operations';
import type { Assignment,Coaching,Manager,Visit } from './opsModels';
import { STATES,STATE_BY_CODE,today } from './opsModels';
import { api,getShareUrl } from './workspaceApi';
type ManagerForm = {
  name:string;email:string;phone:string;trainer:string;homeAirport:string;cadence:string;
  focus:string;coachingStatus:string;onboardingDate:string;baseCity:string;baseState:string;
  lat:string;lon:string;
};
type AssignmentForm={
  managerId:string;stateCode:string;areaType:'state'|'county'|'place'|'zip';areaCode:string;areaName:string;role:'Primary'|'Shared'|'Support';
};
type VisitForm={
  managerId:string;stateCode:string;date:string;airport:string;trainer:string;location:string;objective:string;outcome:string;status:'Planned'|'Completed'|'Rescheduled'|'Canceled';
};
type CoachingForm={
  managerId:string;date:string;trainer:string;skill:string;observation:string;commitment:string;dueDate:string;status:'Open'|'Completed'|'Canceled';
};
const managerBlank=(state:string):ManagerForm=>({
  name:'',email:'',phone:'',trainer:'',homeAirport:'',cadence:'Monthly',focus:'',
  coachingStatus:'On track',onboardingDate:'',baseCity:'',baseState:state,lat:'',lon:'',
});
const visitBlank=(state:string,manager:Manager|undefined):VisitForm=>({
  managerId:manager?.id||'',stateCode:state,date:today(),airport:'',
  trainer:manager?.trainer||'',location:manager?.baseCity||'',objective:'',outcome:'',status:'Planned',
});
const coachingBlank=(manager:Manager|undefined):CoachingForm=>({
  managerId:manager?.id||'',date:today(),trainer:manager?.trainer||'',skill:'',observation:'',
  commitment:'',dueDate:'',status:'Open',
});
const stateOptions=<><optgroup label="United States">{STATES.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</optgroup><optgroup label="Canada">{CANADA_REGIONS.map(s=><option key={'CA'+s.code} value={s.code}>{s.name}</option>)}</optgroup></>;
export default function OperationsModal(){
  const ctx=useOp(),{modal,busy,close,board,geo,geoBusy,airports}=ctx;
  const kind=modal?.kind;
  const managers=board.managers||[];
  const trainerNames=ctx.trainerProfiles.map(profile=>profile.name);
  const [managerForm,setManagerForm]=useState<ManagerForm>(managerBlank(ctx.state));
  const [assignment,setAssignment]=useState<AssignmentForm>({managerId:'',stateCode:ctx.state,areaType:'state',areaCode:'',areaName:'',role:'Primary'});
  const [visit,setVisit]=useState<VisitForm>(visitBlank(ctx.state,undefined));
  const [coaching,setCoaching]=useState<CoachingForm>(coachingBlank(undefined));
  const [error,setError]=useState('');
  const [,setInviteEmail]=useState('');
  const [inviteLink,setInviteLink]=useState('');
  const [saving,setSaving]=useState(false);
  const [advancedManagerOpen,setAdvancedManagerOpen]=useState(false);
  const dialogRef=useRef<HTMLDivElement>(null);
  const actionGuard=useRef({busy:false,saving:false});
  useEffect(()=>{actionGuard.current={busy,saving};},[busy,saving]);
  useEffect(()=>{
    if(!modal)return;
    const previous=document.activeElement as HTMLElement|null;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const dialog=dialogRef.current;
    const preferred=dialog?.querySelector<HTMLElement>('input:not([type="hidden"]),select,textarea');
    // On iPhone, opening a bottom sheet should not summon the keyboard until
    // the user selects an actual field.
    const mobile=window.matchMedia('(max-width:900px)').matches;
    const focus=mobile?dialog?.querySelector<HTMLElement>('.op-modal-head button'):preferred;
    (focus||dialog?.querySelector<HTMLElement>('button:not([disabled])'))?.focus({preventScroll:true});
    const controls=()=>Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]'
    )||[]).filter(element=>element.getClientRects().length>0);
    function onModalKey(event:KeyboardEvent){
      if(event.key==='Escape'&&!actionGuard.current.busy&&!actionGuard.current.saving){
        event.preventDefault();close();return;
      }
      if(event.key!=='Tab')return;
      const items=controls();
      const first=items[0],last=items[items.length-1];
      if(!first)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    window.addEventListener('keydown',onModalKey);
    return ()=>{
      window.removeEventListener('keydown',onModalKey);
      document.body.style.overflow=originalOverflow;
      previous?.focus({preventScroll:true});
    };
  },[modal?.kind,modal?.record]);

  useEffect(()=>{
    if(!modal)return;
    setError('');setInviteLink('');setInviteEmail('');
    const record=modal.record;
    if(modal.kind==='manager'){
      const r=record as Manager|undefined;
      setAdvancedManagerOpen(Boolean(r));
      setManagerForm(r?{
        name:r.name||'',email:r.email||'',phone:r.phone||'',trainer:r.trainer||'',
        homeAirport:r.homeAirport||'',cadence:r.cadence||'Monthly',focus:r.focus||'',
        coachingStatus:r.coachingStatus||'On track',onboardingDate:r.onboardingDate||'',
        baseCity:r.baseCity||'',baseState:r.baseState||ctx.state,
        lat:r.lat===undefined?'':String(r.lat),lon:r.lon===undefined?'':String(r.lon),
      }:{...managerBlank(ctx.state),trainer:ctx.activeTrainer.name});
    }
    if(modal.kind==='assignment'){
      const r=record as Assignment|undefined;
      const requested=modal.detail?.split(':')||[];
      const type=(['county','place','zip'].includes(requested[0])?requested[0]:'state') as AssignmentForm['areaType'];
      const selectedArea=type==='county'?geo.counties.find(a=>a.code===requested[1]):type==='place'?geo.places.find(a=>a.code===requested[1]):null;
      setAssignment(r?{managerId:r.managerId,stateCode:r.stateCode,areaType:r.areaType,
        areaCode:r.areaCode,areaName:r.areaName,role:r.role}:
        {managerId:requested[0]==='manager'?requested[1]:managers[0]?.id||'',
         stateCode:ctx.state,areaType:type,areaCode:selectedArea?.code||(type==='zip'?requested[1]||'':''),
         areaName:selectedArea?.name||'',role:'Primary'});
    }
    if(modal.kind==='visit'){
      const r=record as Visit|undefined;
      const suggested = !r && modal.detail ? new URLSearchParams(modal.detail) : null;
      const selected = managers.find(manager=>manager.id===suggested?.get('managerId')) || managers[0];
      const targetState = suggested?.get('stateCode') || selected?.baseState || ctx.state;
      const requestedDate = suggested?.get('date') || '';
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate>=today() ? requestedDate : today();
      const proposedTrainer = suggested?.get('trainer') || selected?.trainer || ctx.activeTrainer.name;
      setVisit(r?{
        managerId:r.managerId,stateCode:r.stateCode,date:r.date,airport:r.airport||'',trainer:r.trainer||'',
        location:r.location||'',objective:r.objective||'',outcome:r.outcome||'',
        status:(r.status as VisitForm['status'])||'Planned',
      }:({...visitBlank(targetState,selected),date:safeDate,stateCode:targetState,
        trainer:trainerNames.includes(proposedTrainer)?proposedTrainer:ctx.activeTrainer.name}));
    }
    if(modal.kind==='coaching'){
      const r=record as Coaching|undefined;
      const id=modal.detail?.startsWith('manager:')?modal.detail.slice(8):managers[0]?.id;
      const m=managers.find(m=>m.id===id);
      setCoaching(r?{
        managerId:r.managerId,date:r.date,trainer:r.trainer||'',skill:r.skill||'',
        observation:r.observation||'',commitment:r.commitment||'',dueDate:r.dueDate||'',
        status:r.status,
      }:({...coachingBlank(m),trainer:m?.trainer||ctx.activeTrainer.name}));
    }
  },[modal]);

  const [managerPlaces,setManagerPlaces]=useState<Array<{code:string;name:string;lat?:number|null;lon?:number|null}>>([]);
  const [managerGeoLoading,setManagerGeoLoading]=useState(false);
  useEffect(()=>{
    if(kind!=='manager'||!managerForm.baseState)return;
    let active=true;
    setManagerPlaces([]);
    setManagerGeoLoading(true);
    api.get('/api/geography/'+managerForm.baseState).then(result=>{
      if(active)setManagerPlaces(result.data.places||[]);
    }).catch(()=>{
      if(active)setManagerPlaces([]);
    }).finally(()=>{
      if(active)setManagerGeoLoading(false);
    });
    return ()=>{active=false;};
  },[kind,managerForm.baseState]);
  const cities=CANADA_REGIONS.some(x=>x.code===managerForm.baseState)?CANADA_CITIES.filter(c=>c.state===managerForm.baseState):managerPlaces;
  const areaOptions=assignment.areaType==='county'?geo.counties:assignment.areaType==='place'?geo.places:[];
  const filteredAirports=airports.filter(a=>a.state===visit.stateCode).sort((a,b)=>Number(b.scheduled)-Number(a.scheduled)||a.name.localeCompare(b.name));
  async function saveManager(){
    if(!managerForm.name.trim()){setError('Enter the manager name.');return;}
    if(managerForm.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(managerForm.email)){setError('Enter a valid email address.');return;}
    const r=modal?.record as Manager|undefined;
    const profile={
      ...managerForm,
      homeAirport:managerForm.homeAirport.trim().toUpperCase(),
      baseState:managerForm.baseState,
      lat:managerForm.lat===''?undefined:Number(managerForm.lat),
      lon:managerForm.lon===''?undefined:Number(managerForm.lon),
    };
    if(profile.lat!==undefined&&(!Number.isFinite(profile.lat)||Math.abs(profile.lat)>90)) {setError('Latitude is not valid.');return;}
    if(profile.lon!==undefined&&(!Number.isFinite(profile.lon)||Math.abs(profile.lon)>180)) {setError('Longitude is not valid.');return;}
    setSaving(true);setError('');
    try{
      await ctx.submit(()=>r
        ? api.put('/api/managers/'+encodeURIComponent(r.id),{...profile,expectedUpdatedAt:r.updatedAt||''})
        : api.post('/api/managers',profile),r?'Manager profile updated.':'Territory manager added.');
      close();
    }catch(e){setError(e instanceof Error?e.message:'Manager could not be saved.');}
    finally{setSaving(false);}
  }
  async function saveAssignment(){
    if(!assignment.managerId){setError('Choose a territory manager.');return;}
    if(assignment.areaType==='zip'&&!/^\d{5}$/.test(assignment.areaCode.trim())){setError('Enter a five-digit ZIP code.');return;}
    if((assignment.areaType==='county'||assignment.areaType==='place')&&!areaOptions.some(a=>a.code===assignment.areaCode)){
      setError('Choose a county or place from the geographic directory.');return;
    }
    const area=areaOptions.find(a=>a.code===assignment.areaCode);
    const value={
      ...assignment,areaCode:assignment.areaType==='state'?assignment.stateCode:assignment.areaCode,
      areaName:assignment.areaType==='state'?STATE_BY_CODE[assignment.stateCode]?.name:
        assignment.areaType==='zip'?'ZIP '+assignment.areaCode:area?.name||assignment.areaName,
    };
    if((board.assignments||[]).some(a=>a.managerId===value.managerId&&a.stateCode===value.stateCode&&a.areaType===value.areaType&&a.areaCode===value.areaCode)){
      setError('This manager already has an assignment for that exact area.');return;
    }
    setSaving(true);setError('');
    try{
      await ctx.submit(()=>api.post('/api/assignments',value),'Territory assignment added.');
      close();
    }catch(e){setError(e instanceof Error?e.message:'Assignment could not be saved.');}
    finally{setSaving(false);}
  }
  async function saveVisit(){
    if(!visit.managerId||!visit.date||!visit.stateCode){setError('Choose a manager, state and date.');return;}
    const existing=modal?.record as Visit|undefined;
    setSaving(true);setError('');
    try{
      await ctx.submit(()=>existing?
        api.put('/api/visits/'+encodeURIComponent(existing.id),{...visit,expectedUpdatedAt:existing.updatedAt||''}):
        api.post('/api/visits',visit),'Coaching visit saved.');
      close();
    }catch(e){setError(e instanceof Error?e.message:'Visit could not be saved.');}
    finally{setSaving(false);}
  }
  async function saveCoaching(){
    if(!coaching.managerId||!coaching.date||!coaching.skill.trim()){setError('Choose a manager, date and coaching focus.');return;}
    const existing=modal?.record as Coaching|undefined;
    setSaving(true);setError('');
    try{
      await ctx.submit(()=>existing?
        api.put('/api/coaching/'+encodeURIComponent(existing.id),{...coaching,expectedUpdatedAt:existing.updatedAt||''}):
        api.post('/api/coaching',coaching),'Coaching record saved.');
      close();
    }catch(e){setError(e instanceof Error?e.message:'Coaching record could not be saved.');}
    finally{setSaving(false);}
  }
  async function deleteCoaching(){
    const existing=modal?.record as Coaching|undefined;
    if(!existing||!confirm('Delete this coaching record? This action cannot be undone.'))return;
    setSaving(true);setError('');
    try{
      await ctx.submit(()=>api.delete('/api/coaching/'+encodeURIComponent(existing.id)),'Coaching record removed.');
      close();
    }catch(e){setError(e instanceof Error?e.message:'Record could not be deleted.');}
    finally{setSaving(false);}
  }
  async function deleteVisit(){
    const existing=modal?.record as Visit|undefined;
    if(!existing||!confirm('Delete this coaching visit?'))return;
    setSaving(true);setError('');
    try{await ctx.submit(()=>api.delete('/api/visits/'+encodeURIComponent(existing.id)),'Visit deleted.');close();}
    catch(e){setError(e instanceof Error?e.message:'Visit could not be deleted.');}
    finally{setSaving(false);}
  }
  async function invite(){
    setInviteLink(getShareUrl());
  }
  async function copyInvite(){
    const link=inviteLink||getShareUrl();
    try{await navigator.clipboard.writeText(link);ctx.setNotice('Workspace link copied.');}
    catch{ctx.setNotice('Select the share link to copy it.');}
  }
  if(!modal||!kind)return null;
  const headings={
    manager: modal.record?'Edit manager profile':'Add territory manager',
    assignment:'Assign territory coverage',
    visit: modal.record?'Update coaching visit':'Plan a coaching visit',
    coaching: modal.record?'Update coaching record':'Log coaching activity',
    trip:'Open trip builder',
    invite:'Share workspace',
  };
  return <div className="op-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy&&!saving)close();}}>
    <div className={'op-modal'+(kind==='manager'?' large':'')} ref={dialogRef} role="dialog" aria-modal="true" aria-label={headings[kind]}>
      <div className="op-modal-head"><div><h2>{headings[kind]}</h2><p>{kind==='invite'?'Anyone holding your workspace link can edit the saved records.':kind==='assignment'?'Assignments can overlap, but each area is clearly labeled.':'Information saves to your team workspace.'}</p></div>
        <button className="op-icon-button" onClick={close} disabled={busy||saving} aria-label="Close dialog"><X size={21}/></button>
      </div>
      <div className="op-modal-body">
        {kind==='manager'&&<div className="op-form ios-manager-form">
          <div className="ios-form-intro">
            <strong>Manager essentials</strong>
            <p>Start with the person and their territory. Add coaching details when you're ready.</p>
          </div>
          <label className="full">Territory manager name *
            <input required autoComplete="name" value={managerForm.name}
              onChange={e=>setManagerForm({...managerForm,name:e.target.value})}
              placeholder="Full name"/>
          </label>
          <label>Assigned field trainer
            <select value={managerForm.trainer} onChange={e=>setManagerForm({...managerForm,trainer:e.target.value})}>
              <option value="">Unassigned</option>
              {[...new Set([...trainerNames,managerForm.trainer].filter(Boolean))].map(name=>
                <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Manager base state
            <select value={managerForm.baseState} onChange={e=>setManagerForm({
              ...managerForm,baseState:e.target.value,baseCity:'',lat:'',lon:''
            })}>{stateOptions}</select>
          </label>
          <label className="full">Base city or Census place
            {cities.length>0?<select value={managerForm.baseCity} onChange={e=>{
              const place=cities.find(item=>item.name===e.target.value);
              setManagerForm({...managerForm,baseCity:e.target.value,
                lat:place?.lat==null?'':String(place.lat),
                lon:place?.lon==null?'':String(place.lon)});
            }}><option value="">Select city for airport matching</option>
              {cities.map(place=><option value={place.name} key={place.code}>{place.name}</option>)}
            </select>:<input autoComplete="address-level2" value={managerForm.baseCity}
              onChange={e=>setManagerForm({...managerForm,baseCity:e.target.value,lat:'',lon:''})}
              placeholder={managerGeoLoading?'Loading cities…':'Type city (not geocoded)'}/>}
            <small>{managerGeoLoading?'Loading Census places…':
              'Select a Census place for estimated airport proximity. Typed cities are not geocoded.'}</small>
          </label>
          <label>Home airport (IATA)
            <input maxLength={4} autoCapitalize="characters" autoCorrect="off"
              spellCheck={false} value={managerForm.homeAirport}
              onChange={e=>setManagerForm({...managerForm,homeAirport:e.target.value.toUpperCase()})}
              placeholder="MCO"/>
          </label>
          <label>Phone
            <input type="tel" inputMode="tel" autoComplete="tel"
              value={managerForm.phone} onChange={e=>setManagerForm({...managerForm,phone:e.target.value})}
              placeholder="Optional"/>
          </label>
          <label className="full">Work email
            <input type="email" inputMode="email" autoComplete="email"
              value={managerForm.email} onChange={e=>setManagerForm({...managerForm,email:e.target.value})}
              placeholder="name@company.com"/>
          </label>
          <details className="ios-manager-advanced" open={advancedManagerOpen}
            onToggle={event=>setAdvancedManagerOpen(event.currentTarget.open)}>
            <summary><span><strong>Coaching and advanced details</strong>
              <small>Cadence, status, development goals and precise coordinates</small></span>
              <span className="ios-details-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="ios-manager-advanced-grid">
              <label>Coaching cadence
                <select value={managerForm.cadence}
                  onChange={e=>setManagerForm({...managerForm,cadence:e.target.value})}>
                  <option>Monthly</option><option>Every 6 weeks</option>
                  <option>Quarterly</option><option>As needed</option>
                </select>
              </label>
              <label>Coaching status
                <select value={managerForm.coachingStatus}
                  onChange={e=>setManagerForm({...managerForm,coachingStatus:e.target.value})}>
                  <option>On track</option><option>Needs attention</option>
                  <option>Onboarding</option><option>Paused</option>
                </select>
              </label>
              <label>Onboarding date
                <input type="date" value={managerForm.onboardingDate}
                  onChange={e=>setManagerForm({...managerForm,onboardingDate:e.target.value})}/>
              </label>
              <label>Latitude
                <input type="number" inputMode="decimal" step=".00001"
                  value={managerForm.lat} onChange={e=>setManagerForm({...managerForm,lat:e.target.value})}
                  placeholder="Optional"/>
              </label>
              <label>Longitude
                <input type="number" inputMode="decimal" step=".00001"
                  value={managerForm.lon} onChange={e=>setManagerForm({...managerForm,lon:e.target.value})}
                  placeholder="Optional"/>
              </label>
              <label className="full">Coaching focus and goals
                <textarea rows={3} value={managerForm.focus}
                  onChange={e=>setManagerForm({...managerForm,focus:e.target.value})}
                  placeholder="Skills, upcoming objectives and development needs"/>
              </label>
            </div>
          </details>
        </div>}
        {kind==='assignment'&&<div className="op-form">
          <label className="full">Territory manager *<select value={assignment.managerId} onChange={e=>setAssignment({...assignment,managerId:e.target.value})}><option value="">Choose a manager</option>{managers.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
          <label>State<select value={assignment.stateCode} onChange={e=>{
            ctx.setState(e.target.value);ctx.setMapMode('state');
            setAssignment({...assignment,stateCode:e.target.value,areaCode:'',areaName:''});
          }}>{stateOptions}</select></label>
          <label>Geographic scope<select value={assignment.areaType} onChange={e=>setAssignment({...assignment,areaType:e.target.value as AssignmentForm['areaType'],areaCode:'',areaName:''})}>
            <option value="state">Entire state</option><option value="county">County</option><option value="place">City / Census place</option><option value="zip">Five-digit ZIP</option>
          </select></label>
          {(assignment.areaType==='county'||assignment.areaType==='place')&&<label className="full">Choose {assignment.areaType} *<select value={assignment.areaCode} onChange={e=>setAssignment({...assignment,areaCode:e.target.value})} disabled={geoBusy}>
            <option value="">{geoBusy?'Loading geography...':'Choose an area'}</option>{areaOptions.map(a=><option value={a.code} key={a.code}>{a.name}</option>)}
          </select></label>}
          {assignment.areaType==='zip'&&<label className="full">ZIP code *<input inputMode="numeric" maxLength={5} value={assignment.areaCode} onChange={e=>setAssignment({...assignment,areaCode:e.target.value.replace(/[^0-9]/g,'').slice(0,5)})} placeholder="e.g. 32901"/></label>}
          <label className="full">Coverage role<select value={assignment.role} onChange={e=>setAssignment({...assignment,role:e.target.value as AssignmentForm['role']})}><option>Primary</option><option>Shared</option><option>Support</option></select></label>
          <p className="op-form-help">Different managers may share a state. ZIP assignments are numeric identifiers, not displayed geographic polygon boundaries.</p>
        </div>}
        {kind==='visit'&&<div className="op-form">
          <label className="full">Territory manager *<select value={visit.managerId} onChange={e=>{const m=managers.find(m=>m.id===e.target.value);setVisit({...visit,managerId:e.target.value,trainer:m?.trainer||visit.trainer});}}><option value="">Choose a manager</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Coaching date *<input type="date" value={visit.date} onChange={e=>setVisit({...visit,date:e.target.value})}/></label>
          <label>State<select value={visit.stateCode} onChange={e=>setVisit({...visit,stateCode:e.target.value,airport:''})}>{stateOptions}</select></label>
          <label>Assigned trainer<select value={visit.trainer} onChange={e=>setVisit({...visit,trainer:e.target.value})}>
            <option value="">Unassigned</option>{[...new Set([...trainerNames,visit.trainer].filter(Boolean))].map(name=><option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>Arrival airport<select value={visit.airport} onChange={e=>setVisit({...visit,airport:e.target.value})}><option value="">Not selected</option>{filteredAirports.map(a=><option key={a.iata+a.name} value={a.iata}>{a.iata} · {a.name}</option>)}</select></label>
          <label className="full">Meeting location<input value={visit.location} onChange={e=>setVisit({...visit,location:e.target.value})} placeholder="City or meeting location"/></label>
          <label className="full">Coaching objective<textarea rows={3} value={visit.objective} onChange={e=>setVisit({...visit,objective:e.target.value})} placeholder="What should be accomplished in this ride-along?"/></label>
          <label>Visit status<select value={visit.status} onChange={e=>setVisit({...visit,status:e.target.value as VisitForm['status']})}><option>Planned</option><option>Completed</option><option>Rescheduled</option><option>Canceled</option></select></label>
          {visit.status==='Completed'&&<label className="full">Completed visit outcome<textarea rows={3} value={visit.outcome} onChange={e=>setVisit({...visit,outcome:e.target.value})} placeholder="Observations and next steps"/></label>}
        </div>}
        {kind==='coaching'&&<div className="op-form">
          <label className="full">Territory manager *<select value={coaching.managerId} onChange={e=>{
            const m=managers.find(m=>m.id===e.target.value);setCoaching({...coaching,managerId:e.target.value,trainer:m?.trainer||''});
          }}><option value="">Choose a manager</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Coaching date *<input type="date" value={coaching.date} onChange={e=>setCoaching({...coaching,date:e.target.value})}/></label>
          <label>Field trainer<select value={coaching.trainer} onChange={e=>setCoaching({...coaching,trainer:e.target.value})}>
            <option value="">Unassigned</option>{[...new Set([...trainerNames,coaching.trainer].filter(Boolean))].map(name=><option key={name} value={name}>{name}</option>)}
          </select></label>
          <label className="full">Skill or development focus *<input value={coaching.skill} onChange={e=>setCoaching({...coaching,skill:e.target.value})} placeholder="e.g. consultative discovery"/></label>
          <label className="full">Observed behaviors and strengths<textarea rows={3} value={coaching.observation} onChange={e=>setCoaching({...coaching,observation:e.target.value})} placeholder="What happened? What needs improvement?"/></label>
          <label className="full">Agreed coaching commitment<textarea rows={3} value={coaching.commitment} onChange={e=>setCoaching({...coaching,commitment:e.target.value})} placeholder="What will the manager do next?"/></label>
          <label>Follow-up due<input type="date" value={coaching.dueDate} onChange={e=>setCoaching({...coaching,dueDate:e.target.value})}/></label>
          <label>Status<select value={coaching.status} onChange={e=>setCoaching({...coaching,status:e.target.value as CoachingForm['status']})}><option>Open</option><option>Completed</option><option>Canceled</option></select></label>
        </div>}
        {kind==='trip'&&<div><p className="op-subtle">The trip builder provides dates, manager stops, geographic sorting and shared itinerary records.</p><button className="op-btn primary" onClick={()=>{close();ctx.go('trips');}}>Open trip builder <ArrowRight size={15}/></button></div>}
        {kind==='invite'&&<div className="op-form">
          <p className="op-form-help">No sign-in, invitation email or password is required. Share the complete URL only with someone you trust. Anyone with the link can change records.</p>
          <label className="full">Workspace link
            <div style={{display:'flex',gap:8}}><input readOnly value={getShareUrl()} onFocus={e=>e.currentTarget.select()} aria-label="Shared workspace URL"/>
              <button className="op-btn soft" onClick={copyInvite}><Copy size={15}/> Copy</button></div>
          </label>
        </div>}
        {error&&<div className="op-error" role="alert" style={{marginTop:16}}><CircleAlert size={16}/><span>{error}</span></div>}
        <div className="op-form-actions">
          {kind==='coaching'&&!!modal.record&&<button className="op-btn danger" disabled={saving||busy} onClick={deleteCoaching}><Trash2 size={14}/> Delete record</button>}
          {kind==='visit'&&!!modal.record&&<button className="op-btn danger" disabled={saving||busy} onClick={deleteVisit}><Trash2 size={14}/> Delete visit</button>}
          <button className="op-btn" onClick={close} disabled={saving||busy}>Close</button>
          {kind!=='trip'&&kind!=='invite'&&<button className="op-btn primary" disabled={saving||busy} onClick={
            kind==='manager'?saveManager:kind==='assignment'?saveAssignment:kind==='visit'?saveVisit:kind==='coaching'?saveCoaching:invite
          }><Check size={16}/>{saving?'Saving...':'Save changes'}</button>}
        </div>
      </div>
    </div>
  </div>;
}
