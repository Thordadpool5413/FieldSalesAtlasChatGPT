import { ArrowRight,CalendarDays,ChevronDown,ChevronUp,ClipboardCheck,Compass,RadioTower,Sparkles,UsersRound } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import './AtlasLiveDeck.css';
import { useOp } from './Operations';
import { coachingPriority,dateLabel,today } from './opsModels';

type Region={code:string;name:string;country:'US'|'CA'};
type Props={region:Region|null;onAddManager:(code?:string)=>void};
export default function AtlasLiveDeck({region,onAddManager}:Props){
  const ctx=useOp();
  const {board,trainerProfiles:profiles}=ctx;
  const managers=board.managers||[],assignments=board.assignments||[];
  const visits=board.visits||[],notes=board.coaching||[];
  const [expanded,setExpanded]=useState(()=>{
    try{return !window.matchMedia('(max-width:700px)').matches;}catch{return true;}
  });
  const [lens,setLens]=useState<'next'|'coverage'>('next');
  // Give the selected state and inspector visual priority.
  useEffect(()=>{if(region)setExpanded(false);},[region?.code,region?.country]);
  const relevant=useMemo(()=>{
    if(!region)return managers;
    const ids=new Set(assignments.filter(a=>a.stateCode===region.code).map(a=>a.managerId));
    return managers.filter(m=>m.baseState===region.code||ids.has(m.id));
  },[managers,assignments,region?.code]);
  const priorities=useMemo(()=>relevant
    .filter(person=>person.coachingStatus!=='Paused')
    .map(person=>({person,priority:coachingPriority(person,visits,notes)}))
    .filter(row=>row.priority.level!=='Routine')
    .sort((a,b)=>b.priority.score-a.priority.score),
    [relevant,visits,notes]);
  const nextVisit=useMemo(()=>visits.filter(v=>
    ['Planned','Rescheduled'].includes(v.status)&&v.date>=today()&&(!region||v.stateCode===region.code)
  ).sort((a,b)=>a.date.localeCompare(b.date))[0],[visits,region?.code]);
  const nextPerson=nextVisit?managers.find(m=>m.id===nextVisit.managerId):undefined;
  const one=relevant.filter(m=>m.trainer===profiles[0]?.name).length;
  const two=relevant.filter(m=>m.trainer===profiles[1]?.name).length;
  const other=Math.max(0,relevant.length-one-two);
  const top=priorities[0];
  function openPriority(){
    if(top){ctx.setSelectedManager(top.person.id);ctx.go('managers');}
    else if(managers.length===0&&ctx.identity==='member')onAddManager(region?.code);
    else ctx.go('coaching');
  }
  function openVisit(){
    if(nextVisit&&ctx.identity==='member')ctx.open('visit',nextVisit);
    else ctx.go('calendar');
  }
  return <aside className={'fsa-live-deck'+(!expanded?' minimized':'')} aria-label='Live field briefing from saved records'>
    <div className='fsa-live-deck-head'>
      <span><RadioTower size={14}/><i/> FIELD SIGNAL <b>·</b> SAVED RECORDS</span>
      <button type='button' onClick={()=>setExpanded(v=>!v)}
        aria-label={expanded?'Minimize field briefing':'Expand field briefing'}
        aria-expanded={expanded}>{expanded?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button>
    </div>
    {!expanded?<button className='fsa-live-deck-summary' type='button' onClick={()=>setExpanded(true)}>
      <span><strong>{top?.person.name||region?.name||'Your field briefing'}</strong>
      <small>{top?'Coaching attention needed':'Open actionable intelligence'}</small></span><ArrowRight size={16}/>
    </button>:<div className='fsa-live-deck-body'>
      <div className='fsa-live-deck-intro'>
        <span><Compass size={14}/> {(region?.name||'All field regions').toUpperCase()}</span>
        <h3>Know your next move<span>.</span></h3>
        <p>{top?top.person.name+' · '+(top.priority.reasons[0]||'Priority coaching review'):
          relevant.length?'No flagged coaching priorities in this scope.':'Add a manager to activate territory intelligence.'}</p>
      </div>
      <div className='fsa-live-deck-tabs' role='group' aria-label='Field briefing display'>
        <button type='button' className={lens==='next'?'active':''} aria-pressed={lens==='next'}
          onClick={()=>setLens('next')}><Sparkles size={14}/> Priorities</button>
        <button type='button' className={lens==='coverage'?'active':''} aria-pressed={lens==='coverage'}
          onClick={()=>setLens('coverage')}><UsersRound size={14}/> Coverage</button>
      </div>
      {lens==='next'?<div className='fsa-live-deck-panel'>
        <div className='fsa-live-deck-numbers'>
          <span><strong>{priorities.length}</strong><small>Coaching flags</small></span>
          <span><strong>{relevant.length}</strong><small>Managers</small></span>
        </div>
        <button type='button' className='fsa-live-deck-primary' onClick={openPriority}
          disabled={!managers.length&&ctx.identity!=='member'}>
          <ClipboardCheck size={19}/>
          <span><small>NEXT ACTION</small><strong>{top?'Review '+top.person.name:
            !managers.length?'Add your first manager':'Open coaching desk'}</strong></span><ArrowRight size={17}/>
        </button>
        <button type='button' className='fsa-live-deck-secondary' onClick={openVisit}>
          <CalendarDays size={16}/><span>{nextVisit?
            (nextPerson?.name||'Coaching visit')+' · '+dateLabel(nextVisit.date,{month:'short',day:'numeric'}):
            'No upcoming visit · Open calendar'}</span><ArrowRight size={15}/>
        </button>
      </div>:<div className='fsa-live-deck-panel'>
        <div className='fsa-live-deck-bar' role='img'
          aria-label={one+' managers with first trainer, '+two+' with second trainer, '+other+' other'}>
          {one>0&&<i className='first' style={{flex:one}}/>}
          {two>0&&<i className='second' style={{flex:two}}/>}
          {other>0&&<i className='other' style={{flex:other}}/>}
        </div>
        <div className='fsa-live-deck-team'>
          {profiles.slice(0,2).map((p,i)=><div key={p.id}>
            <i className={i===0?'first':'second'}/><span>{p.name}</span>
            <strong>{i===0?one:two}</strong>
          </div>)}
          {other>0&&<div><i className='other'/><span>Other / unassigned</span><strong>{other}</strong></div>}
        </div>
        <button type='button' className='fsa-live-deck-secondary' onClick={()=>ctx.go('coordinate')}>
          <UsersRound size={16}/> Coordinate trainers <ArrowRight size={15}/>
        </button>
      </div>}
      <p className='fsa-live-deck-source'>{board.truncated?'Partial workspace data · Counts may omit records':
        'Workspace records · External calendars are not checked'}</p>
    </div>}
  </aside>;
}
