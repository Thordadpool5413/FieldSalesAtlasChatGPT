import { ArrowRight,BarChart3,Compass,MapPinned } from 'lucide-react';
import { useMemo,useState } from 'react';
import { CANADA_REGION_BY_CODE } from './CanadaRegions';
import { useOp } from './Operations';
import { STATES,coachingPriority,today } from './opsModels';
import './TerritoryPulse.css';

type Mode = 'managers' | 'coaching' | 'visits';
type Market = {
  code: string; name: string; country: 'US' | 'CA';
  managers: number; trainerA: number; trainerB: number; unassigned: number;
  coaching: number; visits: number;
};
const modes: Array<{id:Mode;label:string}> = [
  {id:'managers',label:'Managers'},
  {id:'coaching',label:'Coaching focus'},
  {id:'visits',label:'Upcoming visits'},
];

export default function TerritoryPulse() {
  const ctx = useOp();
  const {board,trainerProfiles} = ctx;
  const [mode,setMode] = useState<Mode>('managers');
  const [expanded,setExpanded] = useState(false);
  const managers = board.managers || [];
  const assignments = board.assignments || [];
  const visits = board.visits || [];
  const coaching = board.coaching || [];

  const rows = useMemo<Market[]>(()=>{
    const nameOf = (code:string)=>{
      const us = STATES.find(s=>s.code===code);
      if(us)return {name:us.name,country:'US' as const};
      const ca = CANADA_REGION_BY_CODE[code];
      return ca?{name:ca.name,country:'CA' as const}:null;
    };
    const groups = new Map<string,Set<string>>();
    function include(code:string,managerId?:string) {
      if(!code||!nameOf(code))return;
      const found = groups.get(code) || new Set<string>();
      if(managerId)found.add(managerId);
      groups.set(code,found);
    }
    managers.forEach(person=>include(person.baseState || '',person.id));
    assignments.forEach(a=>{
      if(managers.some(m=>m.id===a.managerId))include(a.stateCode,a.managerId);
    });
    const upcoming = visits.filter(v=>
      (v.status==='Planned'||v.status==='Rescheduled')&&v.date>=today()
    );
    upcoming.forEach(v=>include(v.stateCode));
    const people = new Map(managers.map(m=>[m.id,m]));
    const trainerA = trainerProfiles[0]?.name;
    const trainerB = trainerProfiles[1]?.name;
    return [...groups.entries()].map(([code,ids])=>{
      const info = nameOf(code)!;
      const peopleHere = [...ids].map(id=>people.get(id)).filter((v):v is (typeof managers)[number]=>Boolean(v));
      const a = peopleHere.filter(p=>p.trainer===trainerA).length;
      const b = peopleHere.filter(p=>p.trainer===trainerB).length;
      return {
        code,...info,
        managers:peopleHere.length,
        trainerA:a,trainerB:b,unassigned:Math.max(0,peopleHere.length-a-b),
        coaching:peopleHere.filter(p=>coachingPriority(p,visits,coaching).level==='High').length,
        visits:upcoming.filter(v=>v.stateCode===code).length,
      };
    }).sort((a,b)=>b.managers-a.managers||a.name.localeCompare(b.name));
  },[managers,assignments,visits,coaching,trainerProfiles]);

  const ranked = [...rows].sort((a,b)=>
    b[mode]-a[mode]||b.managers-a.managers||a.name.localeCompare(b.name)
  );
  const visible = expanded?ranked:ranked.slice(0,8);
  const max = Math.max(1,...ranked.map(row=>row[mode]));
  const memberCount = managers.length;
  const marketCount = rows.length;
  const highCount = managers.filter(p=>coachingPriority(p,visits,coaching).level==='High').length;
  const plannedCount = visits.filter(v=>
    (v.status==='Planned'||v.status==='Rescheduled')&&v.date>=today()
  ).length;
  const units = mode==='visits'?'upcoming visits':mode==='coaching'?'high-priority managers':'mapped managers';

  return <section className='fsa-pulse' aria-labelledby='fsa-pulse-title'>
    <header className='fsa-pulse-head'>
      <div className='fsa-pulse-heading'>
        <span className='fsa-pulse-kicker'><BarChart3 size={16}/> GEOGRAPHIC FIELD INTELLIGENCE</span>
        <h2 id='fsa-pulse-title'>The field, at a glance<span>.</span></h2>
        <p>Compare saved territory coverage, coaching attention and planned visits by region. Select any region to explore it on the Atlas.</p>
      </div>
      <div className='fsa-pulse-modes' role='group' aria-label='Choose regional comparison'>
        {modes.map(item=><button key={item.id} type='button'
          className={mode===item.id?'is-active':''} aria-pressed={mode===item.id}
          onClick={()=>{setMode(item.id);setExpanded(false);}}>
          {item.label}
        </button>)}
      </div>
    </header>
    <div className='fsa-pulse-body'>
      <div className='fsa-pulse-summary' aria-label='Saved field totals'>
        <div><small>REGIONS WITH RECORDS</small><strong>{marketCount}</strong><span>State / province</span></div>
        <div><small>MANAGER PROFILES</small><strong>{memberCount}</strong><span>Saved to workspace</span></div>
        <div><small>HIGH COACHING FOCUS</small><strong>{highCount}</strong><span>Derived coaching priority</span></div>
        <div><small>PLANNED VISITS</small><strong>{plannedCount}</strong><span>Upcoming in workspace</span></div>
      </div>
      <div className='fsa-pulse-distribution'>
        <div className='fsa-pulse-column-head'>
          <strong>REGIONAL DISTRIBUTION</strong>
          <span>{mode==='managers'?'Distinct managers per region':mode==='coaching'?'Managers needing attention':'Planned future coaching visits'}</span>
        </div>
        {ranked.length?<div className='fsa-pulse-rows' aria-label='Regions ranked by selected measure'>
          {visible.map(row=>{
            const value=row[mode];
            const width=Math.max(0,100*value/max);
            return <button type='button' key={row.country+row.code}
              className='fsa-pulse-row' onClick={()=>ctx.jumpToAtlas({code:row.code,country:row.country})}
              aria-label={'Explore '+row.name+' on the Atlas; '+value+' '+units}>
              <span className='fsa-pulse-code'>{row.code}</span>
              <span className='fsa-pulse-details'>
                <span className='fsa-pulse-details-top'>
                  <strong>{row.name}</strong><small>{value} {mode==='managers'?'managers':mode==='coaching'?'high-priority':'visits'}</small>
                </span>
                <span className='fsa-pulse-track' role='img'
                  aria-label={row.name+' has '+value+' '+units+'; highest region has '+max}>
                  {mode==='managers'
                    ?<span className='fsa-pulse-stack' style={{width:width+'%'}}>
                        {row.trainerA>0&&<i className='a' style={{flex:row.trainerA}}/>}
                        {row.trainerB>0&&<i className='b' style={{flex:row.trainerB}}/>}
                        {row.unassigned>0&&<i className='unassigned' style={{flex:row.unassigned}}/>}
                      </span>
                    :<span className={'fsa-pulse-fill '+mode} style={{width:width+'%'}}/>}
                </span>
              </span>
              <ArrowRight size={17} className='fsa-pulse-arrow'/>
            </button>;
          })}
          {ranked.length>8&&<button type='button' className='fsa-pulse-expand' onClick={()=>setExpanded(v=>!v)}
            aria-expanded={expanded}>
            {expanded?'Show top eight regions':'See all '+ranked.length+' regions'} <ArrowRight size={16}/>
          </button>}
        </div>:<div className='fsa-pulse-empty'>
          <MapPinned size={30}/>
          <strong>Your territory picture starts with a manager.</strong>
          <p>Add a manager or saved territory assignment. This visualization will update from your real records.</p>
          <button type='button' onClick={()=>ctx.go('managers')}>Open People <ArrowRight size={17}/></button>
        </div>}
      </div>
    </div>
    <footer className='fsa-pulse-footer'>
      <div className='fsa-pulse-legend' aria-label='Chart legend'>
        {mode==='managers'?<>
          <span><i className='a'/>{trainerProfiles[0]?.name||'Trainer A'}</span>
          <span><i className='b'/>{trainerProfiles[1]?.name||'Trainer B'}</span>
          <span><i className='unassigned'/> Other / unassigned</span>
        </>:<span><i className={mode}/>{mode==='coaching'?'High priority only':'Upcoming planned visits'}</span>}
      </div>
      <span><Compass size={15}/> {board.truncated?'Partial workspace data. Counts may omit records.':'Saved workspace data, not external sales performance or verified travel.'}</span>
    </footer>
  </section>;
}
