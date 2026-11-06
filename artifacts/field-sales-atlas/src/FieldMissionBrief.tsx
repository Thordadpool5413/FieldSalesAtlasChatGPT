import {
ArrowRight,CalendarClock,ChevronRight,CircleAlert,Compass,MapPin,
Route,ShieldAlert,Sparkles,UsersRound
} from 'lucide-react';
import { useMemo } from 'react';
import { CANADA_REGION_BY_CODE } from './CanadaRegions';
import { buildCoordination,shiftDate,weekBeginning } from './CoordinationLogic';
import './FieldMissionBrief.css';
import { useOp } from './Operations';
import type { Manager } from './opsModels';
import { dateLabel,STATES,today } from './opsModels';

type Region = { code:string; name:string; country:'US'|'CA' };
type Props = {
  onDestination:(region:Region,manager?:Manager)=>void;
  onCircuit:(region:Region,people:Manager[],departDate:string,returnDate:string)=>void;
  onCoordinate:()=>void;
  onWeek:()=>void;
};
function regionFor(code:string):Region|null {
  const us=STATES.find(state=>state.code===code);
  if(us)return {code:us.code,name:us.name,country:'US'};
  const ca=CANADA_REGION_BY_CODE[code];
  return ca?{code:ca.code,name:ca.name,country:'CA'}:null;
}
export default function FieldMissionBrief({onDestination,onCircuit,onCoordinate,onWeek}:Props) {
  const ctx=useOp();
  const week=useMemo(()=>{
    const monday=weekBeginning(today());
    return shiftDate(monday,4)<today()?shiftDate(monday,7):monday;
  },[]);
  const snapshot=useMemo(()=>buildCoordination(ctx.board,ctx.trainerProfiles,week),
    [ctx.board,ctx.trainerProfiles,week]);
  const rankedGroups=snapshot.circuits.flatMap(circuit=>circuit.groups.map(group=>({
    ...group,regionCode:circuit.stateCode,
    weightedPriority:group.people.reduce((sum,person)=>sum+person.priority.score,0)
  }))).filter(group=>group.people.length>=2)
    .sort((a,b)=>b.weightedPriority-a.weightedPriority||b.people.length-a.people.length);
  const strongest=rankedGroups[0]||null;
  const next=snapshot.proposals.find(proposal=>Boolean(proposal.date))||snapshot.proposals[0]||null;
  const lead=strongest?.people[0]||next;
  const target=regionFor(strongest?.regionCode||lead?.stateCode||'');
  const people=strongest?.people.map(proposal=>proposal.manager)||(lead?[lead.manager]:[]);
  const trainer=strongest?.trainer||lead?.trainer;
  const due=lead?.date||'';
  const critical=snapshot.issues.filter(issue=>issue.grade==='critical').length;
  const reviews=snapshot.issues.length-critical;
  const uncovered=snapshot.needs.filter(need=>!need.owner||!need.stateCode).length;
  const canPlan=ctx.identity==='member'&&snapshot.canPlan&&!!target&&Boolean(due);
  const recommended=!!target&&!!lead;
  const hasManagers=Boolean(ctx.board.managers?.length);
  const rationales=[
    ...(lead?.priority.reasons||[]),
    ...(lead?.reasons||[])
  ].filter((value,index,arr)=>arr.indexOf(value)===index).slice(0,3);
  function prepare(){
    if(!canPlan||!target||!lead||!trainer)return;
    ctx.setActiveTrainerId(trainer.id);
    if(strongest&&strongest.people.length>=2){
      onCircuit(target,strongest.people.map(item=>item.manager),snapshot.start,shiftDate(snapshot.start,4));
    }else{
      onDestination(target,lead.manager);
    }
  }
  return <section className='fao-mission-director' aria-labelledby='fao-mission-title'>
    <div className='fao-mission-main'>
      <div className='fao-mission-overline'><span className='fao-mission-signal'/><Sparkles size={16}/>
        FIELD MISSION INTELLIGENCE <span className='fao-mission-overline-divider'>/</span>
        {dateLabel(snapshot.start,{month:'short',day:'numeric'})} – {dateLabel(snapshot.end,{month:'short',day:'numeric'})}
      </div>
      <div className='fao-mission-titles'>
        <span className='fao-mission-kicker'>{recommended?'RECOMMENDED NEXT MOVE':'NEXT MOVE / GET THE FIELD READY'}</span>
        <h2 id='fao-mission-title'>{recommended?target?.name||'Field priority':hasManagers?'Turn coaching needs into a field plan.':'Your next destination is out there.'}<span className='fao-mission-period'>.</span></h2>
        <p>{recommended
          ? strongest
            ? strongest.people.length+' managers can be reviewed as one proposed coaching circuit for '+trainer?.name+'.'
            : lead?.manager.name+' has a coaching or coverage need with an available date in the saved schedule.'
          : hasManagers
            ? 'Review coverage and recorded availability to find the right next coaching visit.'
            : 'Explore airport gateways and public aviation conditions first. Connect managers later for personalized coaching plans.'}</p>
      </div>
      {recommended&&<div className='fao-mission-facts' aria-label='Recommended trip details'>
        <div><span><MapPin size={14}/> MARKET</span><strong>{target?.code}</strong><small>{target?.name}</small></div>
        <div><span><UsersRound size={14}/> PEOPLE</span><strong>{people.length}</strong><small>{people.slice(0,2).map(person=>person.name).join(' · ')}{people.length>2?' + more':''}</small></div>
        <div><span><CalendarClock size={14}/> SUGGESTED DAY</span><strong>{due?dateLabel(due,{month:'short',day:'numeric'}):'Review'}</strong><small>{trainer?.name||'Trainer unassigned'}</small></div>
      </div>}
      <div className='fao-mission-reasons' aria-label='Planning evidence'>
        {rationales.length?rationales.map(reason=><span key={reason}><span className='fao-mission-bullet'/> {reason}</span>)
          :<span><span className='fao-mission-bullet'/> Based only on the managers and schedule saved in this workspace</span>}
      </div>
      <div className='fao-mission-footer'>
        <button className='fao-mission-primary' type='button' onClick={recommended?prepare:hasManagers?onCoordinate:()=>ctx.go('air')}
          disabled={recommended&&!canPlan}>
          {recommended?(strongest?'Build suggested circuit':'Plan coaching visit'):hasManagers?'Review coordination':'Explore arrival airports'}
          <ArrowRight size={18}/>
        </button>
        <button type='button' className='fao-mission-secondary' onClick={hasManagers?onCoordinate:()=>ctx.go('radar')}>
          {hasManagers?'Open coordination':'Research flight conditions'} <ChevronRight size={16}/>
        </button>
      </div>
      <p className='fao-mission-provenance'>Planning guidance, not a confirmed assignment. Uses saved coaching, manager location and field calendar records. External calendar availability, meeting acceptance and actual road routes are not verified.</p>
    </div>
    <aside className='fao-mission-health' aria-label='Shared field scheduling status'>
      <div className='fao-mission-health-title'><Compass size={19}/><span>MISSION READINESS</span></div>
      <div className='fao-mission-indicator-row'>
        <span className='fao-mission-indicator'><ShieldAlert size={17}/> Schedule conflicts</span>
        <strong className={critical?'is-warning':''}>{critical}</strong>
      </div>
      <div className='fao-mission-indicator-row'>
        <span className='fao-mission-indicator'><CircleAlert size={17}/> Review notices</span>
        <strong>{reviews}</strong>
      </div>
      <div className='fao-mission-indicator-row'>
        <span className='fao-mission-indicator'><UsersRound size={17}/> Ownership or location gaps</span>
        <strong>{uncovered}</strong>
      </div>
      <div className='fao-mission-indicator-row'>
        <span className='fao-mission-indicator'><Route size={17}/> Proposed field visits</span>
        <strong>{snapshot.proposals.filter(proposal=>proposal.date).length}</strong>
      </div>
      <button className='fao-mission-review' type='button' onClick={onWeek}>
        Review shared week <ArrowRight size={16}/>
      </button>
      <small>{ctx.board.truncated
        ? 'Workspace results are partial. Recommendations may omit records.'
        : 'Counts are calculated from saved records for this planning week.'}</small>
    </aside>
  </section>;
}
