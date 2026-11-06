import TravelEvidence from './TravelEvidence';
import type { Evidence } from '../shared/travel/types';
import { useEffect, useRef, useState } from 'react';
import type { PlanSummary } from '../shared/travel/intelligence';
import type { JourneyRequirements, ReadinessReport, TrainerRequirements } from '../shared/travel/readiness';
import { api } from './workspaceApi';
import JourneyReadiness from './JourneyReadiness';

type Snapshot = { evidence: Evidence[]; readiness: ReadinessReport; workspaceRevision: number; itineraryVersion: string; requirements: JourneyRequirements };
export default function JourneyReadinessController({ plan, revision, names, onSaved }: {
  plan: PlanSummary; revision?: number; names: Record<string,string>; onSaved: () => Promise<void>;
}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [requirements,setRequirements]=useState<JourneyRequirements>({trainers:[]});
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const serial=useRef(0);
  useEffect(()=>{
    const request=++serial.current;setLoading(true);setSnapshot(null);setError('');
    void api.get('/api/travel/journeys/'+encodeURIComponent(plan.id)+'/readiness').then(response=>{
      if(request!==serial.current)return;
      const next=response.data as Snapshot;setSnapshot(next);
      const ids=plan.trainerIds||[...new Set(plan.flightLegs.map(leg=>leg.trainerId))];
      setRequirements({trainers:ids.map(trainerId=>next.requirements?.trainers.find(item=>item.trainerId===trainerId)||{trainerId:trainerId as TrainerRequirements['trainerId'],transport:'unknown',equipment:'unknown'})});
    }).catch(failure=>{if(request===serial.current)setError(failure instanceof Error?failure.message:'Readiness unavailable.');})
      .finally(()=>{if(request===serial.current)setLoading(false);});
    return ()=>{serial.current++;};
  },[plan.id,plan.itineraryVersion,revision]);
  function update(trainerId:string,patch:Partial<TrainerRequirements>){
    setRequirements(current=>({trainers:current.trainers.map(item=>item.trainerId===trainerId?{...item,...patch}:item)}));
  }
  async function save(){
    if(!snapshot||saving)return;setSaving(true);setError('');
    try{
      await api.put('/api/travel/journeys/'+encodeURIComponent(plan.id)+'/requirements',{requirements,expectedItineraryVersion:snapshot.itineraryVersion,expectedWorkspaceRevision:snapshot.workspaceRevision});
      await onSaved();
    }catch(failure){setError(failure instanceof Error?failure.message:'Requirements were not saved.');}finally{setSaving(false);}
  }
  return <details className="journey-details readiness-controls"><summary>Journey readiness &amp; remaining margin</summary>
    {loading&&<p role="status">Checking the supplied itinerary and saved appointments…</p>}
    {error&&<p className="journey-alert" role="alert">{error}</p>}
    {snapshot&&<><JourneyReadiness report={snapshot.readiness} title="Current journey readiness"/><details className="journey-details"><summary>Evidence used for these margins</summary><TravelEvidence evidence={snapshot.evidence}/></details>
      <details className="journey-details"><summary>Review transport, equipment and pickup deadlines</summary>
        <p>These are your reported arrangements for this plan. A shared car or equipment must be reassessed after a trainer handoff.</p>
        {requirements.trainers.map(item=><fieldset key={item.trainerId}><legend>{names[item.trainerId]||item.trainerId}</legend><div className="journey-fields">
          <label>Ground transport access<select value={item.transport} onChange={event=>update(item.trainerId,{transport:event.target.value as TrainerRequirements['transport']})}><option value="unknown">Not reviewed</option><option value="independent">Independent access arranged</option><option value="shared-arranged">Shared access arranged for this plan</option><option value="shared-needs-review">Shared access unresolved</option></select></label>
          <label>Training equipment access<select value={item.equipment} onChange={event=>update(item.trainerId,{equipment:event.target.value as TrainerRequirements['equipment']})}><option value="unknown">Not reviewed</option><option value="ready">Equipment ready</option><option value="shared-arranged">Shared access arranged for this plan</option><option value="shared-needs-review">Shared access unresolved</option></select></label>
        </div><label className="journey-check"><input type="checkbox" checked={!!item.pickup} onChange={event=>update(item.trainerId,{pickup:event.target.checked?{date:plan.startDate,time:'',timeZone:'',processingMinutes:60}:undefined})}/> Include a rental pickup deadline I checked</label>
        {item.pickup&&<div className="journey-fields">
          <label>Pickup deadline date<input type="date" value={item.pickup.date} onChange={event=>update(item.trainerId,{pickup:{...item.pickup!,date:event.target.value}})}/></label>
          <label>Latest pickup local time<input type="time" value={item.pickup.time} onChange={event=>update(item.trainerId,{pickup:{...item.pickup!,time:event.target.value}})}/></label>
          <label>Pickup IANA time zone<input placeholder="America/New_York" value={item.pickup.timeZone} onChange={event=>update(item.trainerId,{pickup:{...item.pickup!,timeZone:event.target.value}})}/></label>
          <label>Gate-to-counter allowance (min)<input type="number" min={0} max={720} value={item.pickup.processingMinutes} onChange={event=>update(item.trainerId,{pickup:{...item.pickup!,processingMinutes:Number(event.target.value)}})}/></label>
        </div>}</fieldset>)}
        <button type="button" className="op-btn" disabled={saving||requirements.trainers.some(item=>item.pickup&&(!item.pickup.date||!item.pickup.time||!item.pickup.timeZone))} onClick={()=>void save()}>{saving?'Saving arrangements…':'Save reviewed journey requirements'}</button><p>Saving requirements recalculates readiness. Appointments and airline reservations are unchanged.</p>
      </details>
    </>}
  </details>;
}
