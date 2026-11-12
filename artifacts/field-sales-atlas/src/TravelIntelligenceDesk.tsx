import JourneyReadiness from './JourneyReadiness';
import JourneyReadinessController from './JourneyReadinessController';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, Link2, Plane, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useOp } from './Operations';
import { api } from './workspaceApi';
import { currentAnalysisResult, type AnalysisSnapshot } from './analysisSnapshot';
import BookingPicker from './BookingPicker';
import { reviewedBookings, selectedBookingFlights } from './BookingHandoff';
import { readBookedFlights } from './BookedFlightLogic';
import type { AssistantAnswer, PlanSummary, RecoveryPreview } from '../shared/travel/intelligence';
import type { FlightInput, Evidence } from '../shared/travel/types';
import TravelEvidence, { EvidenceLinks } from './TravelEvidence';
import './TravelIntelligenceDesk.css';

type Mode = 'assistant' | 'recovery' | 'connections';
type Connections = { checkedAt: string; airports: null | { count: number; retrievedAt: string; stale?: boolean }; history: { state: string; limitation: string; periods: Array<{ period: string; rows: number }> };
  historySync: null | { state: string; attemptedAt: string }; routing: { configured: boolean; limitation: string; graph: null | { regions: string[]; dataDate: string; installedAt: string } };
  routingSetup: null | { state: string }; providers: Array<{ name: string; purpose: string; limitation: string; host: string }>; flightStatus: { limitation: string };
  maintenance?: { jobs: Array<{ id: string; state: string; lastSuccessAt?: string }>; storage: { limitation: string }; scheduling: { externalTriggerConfigured: boolean; limitation: string }; backups: { configured: boolean; limitation: string } };
  sourceStatuses?: Evidence[];
  sourceHealth?: { checkedAt: string; scope: string; sources: Array<{ id: string; label: string; available: boolean; checkedAt: string; lastSuccessAt?: string | null; details: string; scope: string }> };
  plannedIntegrations?: { state: string; limitation: string };
  results?: Array<{ airport: string; checks: Array<{ evidence: Evidence; data: null | Array<{ title: string; detail: string }> }> }>;
  routingProbe?: null | { roadBased: boolean; minutes: number | null; evidence: Evidence } };
const blankFlight = (trainerId: FlightInput['trainerId']): FlightInput => ({ trainerId, carrier: '', flightNumber: '', origin: '', destination: '', departDate: '', departTime: '', arriveDate: '', arriveTime: '' });
function FlightFields({ value, onChange, prefix, trainers }: { value: FlightInput; onChange: (flight: FlightInput) => void; prefix: string; trainers: ReturnType<typeof useOp>['trainerProfiles'] }) {
  return <fieldset className="travel-flight-fields"><legend>{prefix} flight fields</legend><div className="journey-fields">
    <label>{prefix} trainer<select disabled={prefix === 'Changed'} value={value.trainerId} onChange={event => onChange({ ...value, review: undefined, trainerId: event.target.value as FlightInput['trainerId'] })}>{trainers.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
    <label>{prefix} carrier<input maxLength={3} value={value.carrier} onChange={event => onChange({ ...value, review: undefined, carrier: event.target.value.toUpperCase() })}/></label>
    <label>{prefix} flight number<input maxLength={5} value={value.flightNumber} onChange={event => onChange({ ...value, review: undefined, flightNumber: event.target.value })}/></label>
    <label>{prefix} origin<input required maxLength={3} pattern="[A-Z]{3}" value={value.origin} onChange={event => onChange({ ...value, review: undefined, origin: event.target.value.toUpperCase() })}/></label>
    <label>{prefix} destination<input required maxLength={3} pattern="[A-Z]{3}" value={value.destination} onChange={event => onChange({ ...value, review: undefined, destination: event.target.value.toUpperCase() })}/></label>
    <label>{prefix} departure date<input required type="date" value={value.departDate} onChange={event => onChange({ ...value, review: undefined, departDate: event.target.value })}/></label>
    <label>{prefix} departure time<input required type="time" value={value.departTime} onChange={event => onChange({ ...value, review: undefined, departTime: event.target.value })}/></label>
    <label>{prefix} arrival date<input required type="date" value={value.arriveDate} onChange={event => onChange({ ...value, review: undefined, arriveDate: event.target.value })}/></label>
    <label>{prefix} arrival time<input required type="time" value={value.arriveTime} onChange={event => onChange({ ...value, review: undefined, arriveTime: event.target.value })}/></label>
  </div><p>Dates and times are local to each airport. Time zones are resolved from the airport reference; ambiguous clock-change times require correction.</p></fieldset>;
}

export default function TravelIntelligenceDesk({ mode, onBack }: { mode: Mode; onBack: () => void }) {
  const ctx = useOp();
  const [bookingSelection,setBookingSelection]=useState<Record<string,string>>({});
  const [plans, setPlans] = useState<PlanSummary[]>([]), [planId, setPlanId] = useState(''), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(''), [deadlineTime, setDeadlineTime] = useState('');
  const [handoffs, setHandoffs] = useState(false), [answerSnapshot, setAnswerSnapshot] = useState<AnalysisSnapshot<AssistantAnswer> | null>(null);
  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [legIndex, setLegIndex] = useState('0'), [original, setOriginal] = useState<FlightInput>(blankFlight(ctx.activeTrainerId));
  const [replacement, setReplacement] = useState<FlightInput>(blankFlight(ctx.activeTrainerId));
  const [changeStatus, setChangeStatus] = useState('delayed'), [notes, setNotes] = useState('');
  const [checkedAt, setCheckedAt] = useState(new Date().toISOString().slice(0, 16));
  const [recoveryHandoffs, setRecoveryHandoffs] = useState(true), [previewSnapshot, setPreviewSnapshot] = useState<AnalysisSnapshot<RecoveryPreview> | null>(null), [optionId, setOptionId] = useState('');
  const [acknowledged, setAcknowledged] = useState(false), [monitor, setMonitor] = useState(false);
  const [connections, setConnections] = useState<Connections | null>(null), [airportCodes, setAirportCodes] = useState(ctx.activeTrainer.homeAirports.join(', '));
  const [planIssues,setPlanIssues]=useState<Array<{id:string;reason:string}>>([]);
  const [clock,setClock]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return ()=>clearInterval(timer);},[]);
  const requestBusy = useRef(false), resultHeading = useRef<HTMLHeadingElement>(null), plansRequest=useRef(0);
  const plan = plans.find(plan => plan.id === planId);
  const selectedFlightSignature = JSON.stringify(plan?.flightLegs[Number(legIndex)] || null);
  const planContext=JSON.stringify([ctx.board.team?.id,ctx.board.revision,planId,plan?.itineraryVersion,plan?.requirements,plan?.pendingChange]);
  const answerContext=JSON.stringify([planContext,question,deadlineDate,deadlineTime,handoffs]);
  const recoveryContext=JSON.stringify([planContext,recoveryHandoffs]);
  const answer=currentAnalysisResult(answerSnapshot,answerContext,answerSnapshot?.result.evidence,
    answerSnapshot&&Number.isFinite(Date.parse(answerSnapshot.result.createdAt))?new Date(Date.parse(answerSnapshot.result.createdAt)+15*60000).toISOString():answerSnapshot?'invalid':undefined,clock);
  const preview=currentAnalysisResult(previewSnapshot,recoveryContext,previewSnapshot?.result.options.flatMap(item=>item.evidence),previewSnapshot?.result.expiresAt,clock);
  const setAnswer=(result:AssistantAnswer|null)=>setAnswerSnapshot(result?{context:answerContext,result}:null);
  const setPreview=(result:RecoveryPreview|null)=>setPreviewSnapshot(result?{context:recoveryContext,result}:null);
  const option = preview?.options.find(option => option.id === optionId);
  const title = mode === 'assistant' ? 'Ask the trip. See the evidence.' : mode === 'recovery' ? 'A change of flight. A considered next step.' : 'Know what your sources know.';
  async function loadPlans(preferred?: string) {
    const request=++plansRequest.current;
    const response = await api.get('/api/travel/journeys');
    if(request!==plansRequest.current)return;
    const list = response.data.plans as PlanSummary[]; setPlans(list);
    setPlanIssues(response.data.issues || []);
    setPlanId(current => preferred || (list.some(plan => plan.id === current) ? current : list[0]?.id || ''));
  }
  useEffect(() => {
    let active = true; setLoading(true);
    const work = mode === 'connections' ? api.get('/api/travel/connections').then(response => { if (active) setConnections(response.data); }) : loadPlans();
    void work.catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load travel context.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; plansRequest.current++; };
  }, [mode, ctx.board.revision]);
  useEffect(() => {
    const flight = plan?.flightLegs[Number(legIndex)] || blankFlight(ctx.activeTrainerId);
    setOriginal(flight); setReplacement(flight); setPreview(null); setAnswer(null); setError(''); setAcknowledged(false);
  }, [planId, legIndex, selectedFlightSignature]);
  useEffect(() => { if (answer || preview) resultHeading.current?.focus(); }, [answer, preview]);
  async function action(work: () => Promise<void>) {
    if (requestBusy.current) return; requestBusy.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'The request could not complete.'); }
    finally { requestBusy.current = false; setBusy(false); }
  }
  const bookingContext=plan?{trainerIds:plan.trainerIds || ctx.trainerProfiles.filter(profile=>plan.trainerNames.includes(profile.name)).map(profile=>profile.id),startDate:plan.startDate,endDate:plan.endDate}:null;
  const localBookings=bookingContext?reviewedBookings(readBookedFlights(),bookingContext):[];
  async function shareFlights() {
    if (!plan) return;
    if(!bookingContext)return;
    const attached=selectedBookingFlights(readBookedFlights(),bookingSelection,bookingContext);
    const replaced=new Set(attached.map(leg=>leg.trainerId));
    const flights=[...plan.flightLegs.filter(leg=>!replaced.has(leg.trainerId)),...attached];
    await api.post(`/api/travel/journeys/${plan.id}/itinerary`, { flights, expectedItineraryVersion: plan.itineraryVersion }); setBookingSelection({}); await loadPlans(plan.id); await ctx.reload();
    setMessage('Booking fields shared with this plan. Your calendar and airline booking are unchanged.');
  }
  const allEvidence = connections?.results?.flatMap(result => result.checks.map(check => check.evidence)) || [];
  if (connections?.routingProbe) allEvidence.push(connections.routingProbe.evidence);
  return <section className="journey travel-desk" aria-label={mode === 'assistant' ? 'Evidence-backed travel assistant' : mode === 'recovery' ? 'Disruption recovery' : 'Travel data connections'}>
    <header className="journey-header"><div><span className="journey-eyebrow">{mode === 'assistant' ? <Sparkles size={15}/> : mode === 'recovery' ? <Plane size={15}/> : <Link2 size={15}/>} TRAVEL INTELLIGENCE</span><h1>{title}</h1><p>{mode === 'assistant' ? 'Calculate from your saved plan, supplied itinerary and public evidence.' : mode === 'recovery' ? 'Understand the effects on both trainers before changing appointments.' : 'Coverage, source age and limitations stay visible.'}</p></div><button className="op-btn" onClick={onBack} disabled={busy}><ArrowLeft size={15}/> Back to planning</button></header>
    <div className="travel-desk-body">
      {loading && <p role="status">Opening saved travel context…</p>}
      {!!planIssues.length&&<aside className="journey-gaps"><h2>Some saved plans need attention</h2>{planIssues.map(issue=><p key={issue.id}>{issue.reason}</p>)}<p>Review the saved trips and appointments, then reconnect the plan. No records have been changed.</p></aside>}
      {mode !== 'connections' && <>
        <label className="travel-context-label">Saved travel plan<select value={planId} disabled={busy || !plans.length} onChange={event => { setPlanId(event.target.value); setLegIndex('0'); }}><option value="">Choose a plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.title} · {plan.startDate}–{plan.endDate}</option>)}</select></label>
        {plan && <div className="travel-plan-context"><strong>{plan.arrivalAirport} · {plan.trainerNames.join(' & ')}</strong><p>{plan.startDate} — {plan.endDate} · {plan.flightLegs.length} supplied flight legs</p><details className="journey-details"><summary>Connect booking fields from this device</summary><p>Share parsed flight airports, local dates/times, carrier and flight numbers with this workspace. Confirmation codes and booking documents are excluded. Choose one reviewed booking per trainer. This replaces only that trainer’s supplied legs; the other trainer’s legs are preserved.</p>
          <BookingPicker bookings={localBookings} trainers={ctx.trainerProfiles.filter(profile=>bookingContext?.trainerIds.includes(profile.id))} selection={bookingSelection} onChange={setBookingSelection} onManage={()=>ctx.go('booked')} disabled={busy}/>
          <button className="op-btn" disabled={busy} onClick={() => void action(shareFlights)}>Share saved flight fields with this plan</button></details></div>}
        <details className="journey-details" open={!plans.length && !loading}><summary>Connect existing saved trips</summary><p>Use one or two trips with a shared field airport and linked pending visits. This creates analysis context; appointments are unchanged.</p><div className="travel-trip-choices">{(ctx.board.trips || []).filter(trip => trip.status === 'Planned').map(trip => <label className="journey-check" key={trip.id}><input type="checkbox" checked={selectedTrips.includes(trip.id)} disabled={busy || (!selectedTrips.includes(trip.id) && selectedTrips.length >= 2)} onChange={() => setSelectedTrips(selectedTrips.includes(trip.id) ? selectedTrips.filter(id => id !== trip.id) : [...selectedTrips, trip.id])}/>{trip.title} · {trip.trainer}</label>)}</div><button className="op-btn" disabled={busy || !selectedTrips.length} onClick={() => void action(async () => { const result = await api.post('/api/travel/journeys/adopt', { tripIds: selectedTrips }); await loadPlans(result.data.reportId); setMessage('Saved trips connected for analysis. No appointments changed.'); })}>Connect selected trips</button>{!(ctx.board.trips || []).length && <p>Save a trip and its proposed visits in the planner first.</p>}</details>
      </>}
      {plan&&mode!=='connections'&&<JourneyReadinessController plan={plan} revision={ctx.board.revision} names={Object.fromEntries(ctx.trainerProfiles.map(profile=>[profile.id,profile.name]))} onSaved={async()=>{await loadPlans(plan.id);await ctx.reload();}}/>}
      {mode === 'assistant' && <>
        <form onSubmit={event => { event.preventDefault(); if (!plan) return; void action(async () => { const result = await api.post('/api/travel/assistant', { reportId: plan.id, question, allowHandoffs: handoffs, ...(deadlineDate ? { deadlineDate } : {}), ...(deadlineTime ? { deadlineTime } : {}) }); setAnswer(result.data); }); }}>
          <label className="travel-question-label">Your travel question<textarea required maxLength={600} rows={3} placeholder="Ask when you can finish the saved visits and return home." value={question} onChange={event => setQuestion(event.target.value)}/></label><p className="travel-question-help">Ask about finishing visits and returning home by a weekday or date. An answer proposes no calendar or booking changes.</p>
          {plan&&<button className="op-btn" type="button" onClick={()=>setQuestion('Can we finish these visits and get home by '+plan.endDate+'?')}>Check the return date in this plan · {plan.endDate}</button>}
          <details className="journey-details"><summary>Set an exact deadline</summary><div className="journey-fields"><label>Return-home deadline date<input type="date" value={deadlineDate} onChange={event => setDeadlineDate(event.target.value)}/></label><label>Deadline time at each home airport<input type="time" value={deadlineTime} onChange={event => setDeadlineTime(event.target.value)}/></label></div><p>Without a requested clock time, the calculation uses 23:59 in each home-airport time zone.</p></details>
          <label className="journey-check"><input type="checkbox" checked={handoffs} onChange={event => setHandoffs(event.target.checked)}/> Consider sharing visits between trainers</label>
          <button className="op-btn primary" disabled={busy || !plan || question.trim().length<3}><Sparkles size={16}/>{busy ? 'Calculating from your plan…' : 'Calculate an evidence-backed answer'}</button>
        </form>
        {answerSnapshot&&!answer&&<p className="journey-alert" role="status">The question, saved trip, planning requirements or source evidence changed. Calculate again to use the current details.</p>}
        {answer && <section className="travel-answer" aria-label="Travel assistant answer"><span className="journey-state">{answer.verdict.replaceAll('-', ' ')}</span><h2 ref={resultHeading} tabIndex={-1}>{answer.title}</h2><small>Calculated {new Date(answer.createdAt).toLocaleString()} from the saved calendar.</small>
          <ul className="travel-claims">{answer.claims.map((claim, index) => <li key={index}><p>{claim.text} <EvidenceLinks ids={claim.evidenceIds} evidence={answer.evidence}/></p>{claim.limitation && <small>{claim.limitation}</small>}</li>)}</ul>
          {!!answer.trainers.length && <div className="travel-trainer-results">{answer.trainers.map(trainer => <article className="journey-source" key={trainer.id}><strong>{trainer.name}</strong><p>{trainer.visitCount} proposed visits · {trainer.homeLocal ? 'Estimated home: ' + trainer.homeLocal : 'Home arrival unresolved'}</p><small>{trainer.timeZone}</small><span className="journey-state">{trainer.meetsDeadline === null ? 'Needs return evidence' : trainer.meetsDeadline ? 'Within supplied timing' : 'After requested deadline'}</span></article>)}</div>}
          {!!answer.missing.length && <div className="journey-gaps"><h3><CircleHelp size={18}/> What is still missing</h3><ul>{answer.missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
          <details className="journey-details"><summary>Assumptions used</summary><ul>{answer.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
          {answer.readiness&&<JourneyReadiness report={answer.readiness} title="Remaining margin for this answer"/>}<h3>Useful next steps</h3><ul>{answer.followups.map(item => <li key={item}>{item}</li>)}</ul><details className="journey-details"><summary><ShieldCheck size={17}/> Evidence behind the answer ({answer.evidence.length})</summary><TravelEvidence evidence={answer.evidence}/></details>
        </section>}
      </>}
      {mode === 'recovery' && <>
        {previewSnapshot&&!preview&&<p className="journey-alert" role="status">The saved trip, recovery choices or source evidence changed. Build fresh recovery options before reviewing calendar changes.</p>}
        {plan?.pendingChange ? <div className="journey-gaps"><h2>Reported {plan.pendingChange.status}: {plan.pendingChange.originalLeg.origin} → {plan.pendingChange.originalLeg.destination}</h2><p>Traveler-reported at {new Date(plan.pendingChange.checkedAt).toLocaleString()}. No calendar changes have been applied.</p><label className="journey-check"><input type="checkbox" checked={recoveryHandoffs} onChange={event => setRecoveryHandoffs(event.target.checked)}/> Compare sharing the remaining visits with the partner</label><button className="op-btn primary" disabled={busy} onClick={() => void action(async () => { const response = await api.post('/api/travel/recovery', { changeId: plan.pendingChange!.id, includeHandoffs: recoveryHandoffs }); const next = response.data as RecoveryPreview; setPreview(next); setOptionId(next.options.find(option => option.scenario.feasible)?.id || next.options[0].id); setAcknowledged(false); })}><RefreshCw size={16}/>{busy ? 'Comparing consequences…' : 'Build recovery options'}</button><button className="op-btn" disabled={busy} onClick={() => void action(async () => { await api.delete('/api/travel/changes/' + plan.pendingChange!.id); setPreview(null); await loadPlans(plan.id); await ctx.reload(); setMessage('The reported change was retracted. Calendar appointments are unchanged.'); })}>Retract this report</button></div> : <form onSubmit={event => { event.preventDefault(); if (!plan) return; void action(async () => { await api.post('/api/travel/changes', { id: crypto.randomUUID(), reportId: plan.id, originalLeg: original, ...(changeStatus !== 'canceled' ? { replacementLeg: { ...replacement, trainerId: original.trainerId } } : {}), status: changeStatus, checkedAt: new Date(checkedAt + ':00Z').toISOString(), notes }); await loadPlans(plan.id); await ctx.reload(); setMessage('Flight change reported. Appointments are unchanged; build and review recovery options next.'); }); }}>
          <p className="travel-supplied-note">This records flight details you supply. Public airport notices and weather do not independently confirm an individual flight change.</p>
          {plan && !!plan.flightLegs.length && <label className="travel-context-label">Saved original flight<select value={legIndex} onChange={event => setLegIndex(event.target.value)}>{plan.flightLegs.map((leg, index) => <option value={index} key={index}>{ctx.trainerProfiles.find(profile => profile.id === leg.trainerId)?.name} · {leg.carrier}{leg.flightNumber} · {leg.origin} → {leg.destination} · {leg.departDate}</option>)}</select></label>}
          <details className="journey-details" open={!plan?.flightLegs.length}><summary>Review original booking fields · {original.origin || '?'} → {original.destination || '?'}</summary><FlightFields value={original} onChange={flight => { setOriginal(flight); setReplacement({ ...replacement, trainerId: flight.trainerId, origin: flight.origin, destination: flight.destination }); }} prefix="Original" trainers={ctx.trainerProfiles}/></details>
          <label className="travel-context-label">Reported change<select value={changeStatus} onChange={event => setChangeStatus(event.target.value)}><option value="delayed">Delayed flight</option><option value="changed">Changed flight / supplied replacement</option><option value="canceled">Canceled flight; no replacement supplied</option></select></label>
          {changeStatus !== 'canceled' && <FlightFields value={replacement} onChange={setReplacement} prefix="Changed" trainers={ctx.trainerProfiles}/>}
          <div className="journey-fields"><label>Checked at (UTC)<input required type="datetime-local" value={checkedAt} onChange={event => setCheckedAt(event.target.value)}/></label><label>Notes from your check<input maxLength={700} value={notes} onChange={event => setNotes(event.target.value)}/></label></div><button className="op-btn primary" disabled={busy || !plan}><Plane size={16}/>{busy ? 'Recording your report…' : 'Report change without editing Calendar'}</button>
        </form>}
        {preview && option && <section className="travel-recovery-results"><h2 tabIndex={-1} ref={resultHeading}>What changes for both trainers</h2><div className="travel-impact-list">{preview.impacts.map(impact => <article className="journey-source" key={impact.managerId}><div><strong>{impact.managerName}</strong><span className="journey-state">{impact.level}</span></div><p>{impact.trainerName} · {impact.date} · {impact.localTime} · {impact.timeZone}</p><p>{impact.reason} <EvidenceLinks ids={impact.evidenceIds} evidence={option.evidence}/></p></article>)}</div>
          <div className="travel-recovery-options" role="radiogroup" aria-label="Recovery options">{preview.options.map(candidate => <label key={candidate.id}><input type="radio" name="recovery-option" checked={candidate.id === optionId} onChange={() => { setOptionId(candidate.id); setAcknowledged(false); }}/><span><strong>{candidate.label}</strong><small>{candidate.scenario.visits.length} placed · {candidate.scenario.unplaced.length} unplaced · {candidate.scenario.feasible ? 'Provisional complete schedule' : 'Cannot apply'}</small></span></label>)}</div>
          {option.readiness&&<JourneyReadiness report={option.readiness} title="Remaining margin for this option"/>}<div className="journey-gaps"><h3>Consequences of this option</h3><ul>{option.consequences.map(item => <li key={item}>{item}</li>)}</ul></div>
          <div className="travel-differences">{option.differences.map(item => <article key={item.managerId}><strong>{item.managerName}</strong><span>{item.from.trainer} · {item.from.date} · {item.from.time}</span><ArrowRight size={15}/><span>{item.to.trainer} · {item.to.date} · {item.to.time}</span><small>{item.changed ? 'Appointment changes' : 'Same appointment'}</small></article>)}</div>
          <details className="journey-details"><summary>Estimates, evidence gaps and limits</summary><ul>{[...option.scenario.gaps, ...preview.limitations].map((item, index) => <li key={index}>{item}</li>)}</ul></details>
          <label className="journey-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/> I reviewed the changes for both trainers and the unverified flight details.</label><label className="journey-check"><input type="checkbox" checked={monitor} onChange={event => setMonitor(event.target.checked)}/> Keep public airport and weather reviews enabled for the recovered plan</label>
          <button className="op-btn primary" disabled={busy || !acknowledged || !option.scenario.feasible || option.readiness?.constraints.some(step=>step.marginMinutes!==null&&step.marginMinutes<0)} onClick={() => void action(async () => { const result = await api.post(`/api/travel/recovery/${preview.id}/approve`, { optionId, acknowledgeConsequences: acknowledged, monitor }); await ctx.reload(); ctx.setNotice(`${result.data.updatedVisits} pending visits updated after recovery review. Airline bookings are unchanged.`); ctx.go('calendar'); })}>Apply reviewed calendar changes</button>
          <details className="journey-details"><summary>Evidence for this option ({option.evidence.length})</summary><TravelEvidence evidence={option.evidence}/></details>
        </section>}
      </>}
      {mode === 'connections' && connections && <>
        <section aria-label="Where travel data is used"><h2>Follow the data into your trip</h2>
          <p>Configuration, a successful sample and complete coverage are different. The checks below show what each source actually returned.</p>
          <div className="travel-connection-summary"><article className="journey-source"><strong>Flight DNA</strong><p>Airport conditions, Canadian regional weather, installed official BTS route history and independent historical aggregates.</p><button className="op-btn" onClick={() => ctx.go('radar')}>Open Flight DNA</button></article>
            <article className="journey-source"><strong>Saved itinerary</strong><p>Review imported flight fields, connection margins and each trainer’s resource requirements. A confirmation number alone cannot verify a booking.</p><button className="op-btn" onClick={() => ctx.go('booked')}>Review booked flights</button></article>
            <article className="journey-source"><strong>Journey analysis</strong><p>Use Plan together to calculate road estimates and saved visit constraints. Supplied itinerary airports are checked separately; flight availability needs airline verification.</p><button className="op-btn" onClick={onBack}>Back to trip planning</button></article></div>
        </section>
        <div className="travel-connection-summary"><article className="journey-source"><strong>Airport reference</strong><p>{connections.airports ? connections.airports.count.toLocaleString() + ' validated reference airports' : 'Limited bundled reference'}</p><small>{connections.airports ? (connections.airports.stale ? 'Stale reference · retrieved ' : 'Retrieved ') + new Date(connections.airports.retrievedAt).toLocaleString() : 'Run a reference refresh to expand coverage.'}</small></article><article className="journey-source"><strong>Road network</strong><p>{connections.routing.configured ? 'Endpoint configured; validate a route below' : 'Routing is not active'}</p><small>{connections.routing.graph?.regions.join(', ')}</small><p>{connections.routing.limitation}</p></article><article className="journey-source"><strong>BTS history</strong><p>{connections.history.periods.length ? connections.history.periods.map(period => period.period).join(', ') : 'No official monthly records loaded'}</p><small>{connections.historySync ? 'Last sync: ' + connections.historySync.state : 'No sync has run'}</small><p>{connections.history.limitation}</p></article></div>
        <form onSubmit={event => { event.preventDefault(); void action(async () => { const response = await api.post('/api/travel/connections/check', { airports: airportCodes.toUpperCase().split(/[\s,]+/).filter(Boolean), checkRouting: true }); setConnections(response.data); setMessage('Checks completed for the airports you selected. A driving check requires two airports; unavailable or limited sources remain explicitly labeled.'); }); }}><label className="travel-context-label">Airports to validate<input required value={airportCodes} onChange={event => setAirportCodes(event.target.value.toUpperCase())} placeholder="Enter your airport codes"/></label><p>Choose one to four airport codes. With two or more, the road check uses the first two selected airports. Airport-to-visit timing is calculated from your actual manager locations in the planner.</p><button className="op-btn primary" disabled={busy}><ShieldCheck size={16}/>{busy ? 'Checking sources and route…' : 'Validate official sources and routing'}</button></form>
        {!!connections.results?.length && <><h2 className="travel-evidence-heading">Actual check results</h2>{connections.routingProbe && <p>{connections.routingProbe.roadBased && connections.routingProbe.minutes !== null ? 'A road-network route was validated: ' + connections.routingProbe.minutes + ' estimated driving minutes.' : 'A drivable road-network route was not validated. Geographic estimates are provisional.'}</p>}<TravelEvidence evidence={allEvidence}/>{connections.results.flatMap(result => result.checks.flatMap(check => (check.data || []).map((signal, index) => <p key={result.airport + check.evidence.id + index}>{result.airport} · {signal.title}: {signal.detail}</p>)))}</>}
        {connections.maintenance && <details className="journey-details"><summary>Refresh reliability and saved data</summary>
          <p>{connections.maintenance.scheduling.limitation}</p><p>{connections.maintenance.storage.limitation}</p>
          <p>{connections.maintenance.backups.configured ? 'Backup destination configured. ' : 'Automatic backup destination is not configured. '}{connections.maintenance.backups.limitation}</p>
          {connections.maintenance.jobs.map(job => <p key={job.id}>{job.id}: {job.state}{job.lastSuccessAt ? ' · last successful pass ' + new Date(job.lastSuccessAt).toLocaleString() : ' · no successful pass recorded'}</p>)}
        </details>}
        {!!connections.sourceStatuses?.length && <details className="journey-details"><summary>Latest saved public-source checks</summary><p>These cached checks can cover other sampled airports. Run validation above for the airports you choose.</p><TravelEvidence evidence={connections.sourceStatuses}/></details>}
        <details className="journey-details"><summary>Daily source checks, including historical datasets</summary>
          {connections.sourceHealth ? <><p>Saved scan: {new Date(connections.sourceHealth.checkedAt).toLocaleString()}. This does not replace a current airport check. {connections.sourceHealth.scope}</p>
            {connections.sourceHealth.sources.map(source => <article className="journey-source" key={source.id}><strong>{source.label}</strong>
              <span className="journey-state">{source.available ? 'Passed at recorded check' : 'Needs attention'}</span><small>Checked: {new Date(source.checkedAt).toLocaleString()}{source.lastSuccessAt ? ' · Last success: ' + new Date(source.lastSuccessAt).toLocaleString() : ''}</small>
              <p>{source.details}</p><p>{source.scope}</p></article>)}</> : <p>No daily source scan has been saved. Airport validation above checks only the selected airports and the requested road route.</p>}
        </details>
        <details className="journey-details"><summary>Implemented providers and flight-status limits</summary>{connections.providers.map(provider => <article key={provider.name}><h3>{provider.name}</h3><p>{provider.purpose}. {provider.limitation}</p></article>)}<p>{connections.flightStatus.limitation}</p></details>
        {connections.plannedIntegrations && <aside className="journey-gaps"><h3>Research integrations are not connected</h3><p>{connections.plannedIntegrations.limitation}</p><p>Aircraft registry/type profiles, broader aviation hazards, Canadian traffic statistics and additional BTS datasets require their own importers and validation before they can inform recommendations.</p></aside>}
      </>}
      {busy && <p className="travel-desk-status" role="status">Calculating or checking the requested evidence. Your calendar changes only after an explicit approval.</p>}
      {message && <p className="travel-desk-message" role="status">{message}</p>}{error && <p className="journey-alert" role="alert">{error}</p>}
    </div>
  </section>;
}
