import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarCheck, Check, Clock3, Compass, Plane, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useOp } from './Operations';
import { api } from './workspaceApi';
import { readBookedFlights } from './BookedFlightLogic';
import { today } from './opsModels';
import type { Evidence, ScenarioReport } from '../shared/travel/types';
import './JourneyIntelligence.css';
import HistoricalRouteCheck from './HistoricalRouteCheck';
import TravelEvidence from './TravelEvidence';

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const duration = (minutes: number | null) => minutes === null ? 'Unknown duration' : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
function nextWeek() {
  const day = new Date(today() + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7 || 7));
  const start = day.toISOString().slice(0, 10); day.setUTCDate(day.getUTCDate() + 4);
  return { start, end: day.toISOString().slice(0, 10) };
}
function stamp(value?: string) { return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not supplied'; }
type Watch = { id: string; airport: string; airports?: string[]; state: string; nextRun: string; reviewedAt?: string; review?: { message: string; evidence: Evidence[] } };
export default function JourneyIntelligence({ onBack }: { onBack: () => void }) {
  const ctx = useOp();
  const defaults = useRef(nextWeek()).current;
  const [managerIds, setManagerIds] = useState<string[]>(ctx.travelRequest?.managerIds || (ctx.travelRequest?.managerId ? [ctx.travelRequest.managerId] : []));
  const [trainerIds, setTrainerIds] = useState<string[]>(['trainer_a', 'trainer_b']);
  const [startDate, setStartDate] = useState(ctx.travelRequest?.departDate || defaults.start);
  const [endDate, setEndDate] = useState(ctx.travelRequest?.returnDate || defaults.end);
  const [arrivalAirport, setArrivalAirport] = useState(ctx.travelRequest?.arrivalAirport || 'MCO');
  const [sessionMinutes, setSession] = useState(150), [breakMinutes, setBreak] = useState(30);
  const [dayStart, setDayStart] = useState('09:00'), [dayEnd, setDayEnd] = useState('17:00');
  const [checkinMinutes, setCheckin] = useState(105), [arrivalMinutes, setArrival] = useState(60), [returnMinutes, setReturn] = useState(45);
  const [hotelPerNight, setHotel] = useState(160), [mealsPerDay, setMeals] = useState(65), [rentalPerDay, setRental] = useState(68);
  const [allowHandoffs, setHandoffs] = useState(false), [includeWeekends, setWeekends] = useState(false);
  const [useBookings, setUseBookings] = useState(false), [checkPublicSources, setPublicSources] = useState(false);
  const [report, setReport] = useState<ScenarioReport | null>(null), [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const [acknowledged, setAcknowledged] = useState(false), [monitor, setMonitor] = useState(false);
  const [watches, setWatches] = useState<Watch[]>([]), [reviewError, setReviewError] = useState('');
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  const managers = ctx.board.managers || [], profiles = ctx.board.trainerProfiles || [];
  const selected = report?.scenarios.find(option => option.id === selectedId);
  const signature = (option: ScenarioReport['scenarios'][number]) => JSON.stringify([...option.visits].sort((a, b) => a.managerId.localeCompare(b.managerId)).map(visit => [visit.managerId, visit.trainerId, visit.startInstant, visit.endInstant]));
  const uniqueOptions = (report?.scenarios || []).filter((option, index, all) => all.findIndex(other => signature(other) === signature(option)) === index);
  async function loadReviews() {
    try { setWatches((await api.get('/api/travel/reviews')).data.watches); setReviewError(''); }
    catch { setReviewError('Travel reviews could not be loaded. Try again when connected.'); }
  }
  useEffect(() => { void loadReviews(); const timer = setInterval(() => void loadReviews(), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (report) resultHeading.current?.focus(); }, [report]);
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  async function build(event: React.FormEvent) {
    event.preventDefault(); if (saving.current) return;
    saving.current = true; setBusy(true); setFailure('');
    try {
      const flights = useBookings ? readBookedFlights().filter(booking => trainerIds.includes(booking.trainerId))
        .flatMap(booking => booking.legs.filter(leg => leg.departDate >= startDate && leg.departDate <= endDate).map(leg => ({ trainerId: booking.trainerId,
          carrier: leg.carrier, flightNumber: leg.flightNumber, origin: leg.origin, destination: leg.destination, departDate: leg.departDate, departTime: leg.departTime, arriveDate: leg.arriveDate, arriveTime: leg.arriveTime, providedAt: booking.updatedAt }))) : [];
      const response = await api.post('/api/travel/scenarios', { managerIds, trainerIds, startDate, endDate, arrivalAirport, sessionMinutes, breakMinutes,
        dayStart, dayEnd, checkinMinutes, arrivalMinutes, returnMinutes, hotelPerNight, mealsPerDay, rentalPerDay, allowHandoffs, includeWeekends, checkPublicSources, flights });
      const next = response.data as ScenarioReport;
      setReport(next); setSelectedId(next.scenarios.find(option => option.feasible)?.id || next.scenarios[0].id); setAcknowledged(false);
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Unable to build a preview.'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function approve() {
    if (!report || !selected || saving.current) return;
    saving.current = true; setBusy(true); setFailure('');
    try {
      const response = await api.post(`/api/travel/scenarios/${report.id}/approve`, { scenarioId: selected.id, acknowledgeGaps: acknowledged, monitor });
      await ctx.reload(); ctx.setNotice(`${response.data.scheduledVisits} proposed visits saved across ${response.data.tripIds.length} trainer trips. Confirm appointments before travel.`); ctx.go('calendar');
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Could not save. Check the Calendar before retrying.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <section className="journey" aria-label="Intelligent journey planner">
    <header className="journey-header"><div><span className="journey-eyebrow"><Compass size={15}/> FIELD INTELLIGENCE</span><h1>A better week, together.</h1><p>Give every visit a place. Give every decision a reason.</p></div><button className="op-btn" onClick={onBack} disabled={busy}><ArrowLeft size={15}/> Guided planner</button></header>
    {!report ? <form onSubmit={build}>
      <fieldset disabled={busy} className="journey-inputs"><legend className="sr-only">Journey preferences</legend>
        <div className="journey-columns"><section><h2><Users size={19}/> Your field team</h2><p>Plan with one trainer or coordinate both.</p><div className="journey-choice-list">
          {profiles.map(profile => <label key={profile.id}><input type="checkbox" checked={trainerIds.includes(profile.id)} onChange={() => setTrainerIds(toggle(trainerIds, profile.id))}/><span><strong>{profile.name}</strong><small>{profile.homeAirports.join(' · ') || 'Set home airports in People → Trainers'}</small></span></label>)}
        </div><h2>Who needs a visit?</h2><p>Choose up to 12 people with saved base coordinates.</p><div className="journey-choice-list journey-people">
          {managers.length ? managers.map(person => <label key={person.id}><input type="checkbox" checked={managerIds.includes(person.id)} onChange={() => setManagerIds(toggle(managerIds, person.id))} disabled={!Number.isFinite(person.lat) || !Number.isFinite(person.lon) || (!managerIds.includes(person.id) && managerIds.length >= 12)}/><span><strong>{person.name}</strong><small>{person.baseCity || person.baseState || 'Location needed'} · {person.trainer || 'Unassigned'}</small></span></label>) : <p>Add your managers in People to start planning.</p>}
        </div><small>{managerIds.length} selected</small></section>
        <section><h2><CalendarCheck size={19}/> Time and place</h2><div className="journey-fields">
          <label>First field date<input required type="date" value={startDate} onChange={event => setStartDate(event.target.value)}/></label>
          <label>Last field date<input required type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)}/></label>
          <label className="journey-wide">Field airport<input required pattern="[A-Z]{3}" maxLength={3} value={arrivalAirport} onChange={event => setArrivalAirport(event.target.value.toUpperCase())}/><small>Three-letter code. Daily routes begin and end in this airport area.</small></label>
          <label>Visit length (minutes)<input type="number" min={30} max={480} required value={sessionMinutes} onChange={event => setSession(Number(event.target.value))}/></label>
          <label>Break between visits<input type="number" min={0} max={120} required value={breakMinutes} onChange={event => setBreak(Number(event.target.value))}/></label>
        </div>
        <label className="journey-check"><input type="checkbox" checked={allowHandoffs} onChange={event => setHandoffs(event.target.checked)}/> Allow either trainer to visit a manager</label>
        <label className="journey-check"><input type="checkbox" checked={includeWeekends} onChange={event => setWeekends(event.target.checked)}/> Include weekends</label>
        <details className="journey-details"><summary>Buffers, working hours and budget</summary><div className="journey-fields">
          <label>Workday starts<input type="time" value={dayStart} onChange={event => setDayStart(event.target.value)}/></label><label>Workday ends<input type="time" value={dayEnd} onChange={event => setDayEnd(event.target.value)}/></label>
          <label>Check-in buffer (minutes)<input type="number" min={30} max={240} value={checkinMinutes} onChange={event => setCheckin(Number(event.target.value))}/></label>
          <label>Arrival buffer (minutes)<input type="number" min={15} max={240} value={arrivalMinutes} onChange={event => setArrival(Number(event.target.value))}/></label>
          <label>Rental return (minutes)<input type="number" min={0} max={180} value={returnMinutes} onChange={event => setReturn(Number(event.target.value))}/></label>
          <label>Hotel / night (USD)<input type="number" min={0} max={1500} value={hotelPerNight} onChange={event => setHotel(Number(event.target.value))}/></label>
          <label>Meals / day (USD)<input type="number" min={0} max={500} value={mealsPerDay} onChange={event => setMeals(Number(event.target.value))}/></label>
          <label>Rental / day (USD)<input type="number" min={0} max={1000} value={rentalPerDay} onChange={event => setRental(Number(event.target.value))}/></label>
        </div><p>Workday hours apply in each location’s local time zone. Budgets are allowances, not quotes.</p></details>
        <details className="journey-details"><summary><Plane size={15}/> Add flight and public-source context</summary>
          <label className="journey-check"><input type="checkbox" checked={useBookings} onChange={event => setUseBookings(event.target.checked)}/> Include saved flight legs for these trainers and dates</label><p>Shares airport codes, dates, times, carrier and flight numbers from this device with your workspace. Booking documents and confirmation codes are excluded. Choose dates that include every outbound and return leg.</p>
          <label className="journey-check"><input type="checkbox" checked={checkPublicSources} onChange={event => setPublicSources(event.target.checked)}/> Check official airport notices and weather</label><p>Each source shows its own freshness and scope. Forecasts cover only their published period; individual flight status is unverified.</p>
        </details></section></div>
      </fieldset>
      {failure && <p className="journey-alert" role="alert">{failure}</p>}
      <footer className="journey-footer"><span>{busy ? 'Comparing visit order, trainer assignments and working windows…' : 'Your saved calendar and trainer availability are included.'}</span><button className="op-btn primary" type="submit" disabled={busy || !managerIds.length || !trainerIds.length}>{busy ? <RefreshCw size={17} className="journey-spin"/> : <Compass size={17}/>} {busy ? 'Building your options…' : 'Build travel options'}</button></footer>
      {busy && <p role="status" className="journey-progress">Solving the schedule and validating each option. Public-source checks may take a few seconds.</p>}
    </form> : <div className="journey-results">
      <div className="journey-result-heading"><div><h2 tabIndex={-1} ref={resultHeading}>Your week, considered.</h2><p>{report.startDate} — {report.endDate} · {report.arrivalAirport} · Preview expires {stamp(report.expiresAt)}</p></div><button className="op-btn" disabled={busy} onClick={() => { setReport(null); setFailure(''); }}>Edit and rebuild</button></div>
      <div className={'journey-options' + (uniqueOptions.length === 1 ? ' single' : '')} role="radiogroup" aria-label="Travel options">{uniqueOptions.map(option => <label key={option.id} className={option.id === selectedId ? 'selected' : ''}><input type="radio" name="journey-option" checked={option.id === selectedId} onChange={() => { setSelectedId(option.id); setAcknowledged(false); }}/><span className="journey-option-title">{option.title}</span><strong>{option.visits.length} / {managerIds.length} visits</strong><small>{duration(option.travelMinutes)} ground travel · {option.trainerIds.length} trainers</small><span className={'journey-state state-' + (option.feasible ? 'partial' : 'unavailable')}>{option.feasible ? 'Provisional schedule' : 'Visits unplaced'}</span></label>)}</div>
      <p className="journey-caption">{uniqueOptions.length < report.scenarios.length ? 'Some comparison goals produced the same circuit; duplicate schedules are shown once. ' : ''}Road estimates exclude live traffic. Flights are never booked by this tool.</p>
      {selected && <>
        <div className="journey-columns"><section><h3><CalendarCheck size={18}/> Proposed appointments</h3><ol className="journey-timeline">{[...selected.visits].sort((a, b) => a.startInstant.localeCompare(b.startInstant) || a.trainerId.localeCompare(b.trainerId)).map(visit => <li key={visit.managerId}><span className="journey-timeline-dot"/><div><strong>{managers.find(person => person.id === visit.managerId)?.name || 'Manager'}</strong><span>{profiles.find(profile => profile.id === visit.trainerId)?.name} · {visit.location}</span><span>{visit.date} · {visit.startTime}–{visit.endTime}</span><small>{visit.timeZone} · {duration(visit.transferMinutes)} from previous stop</small></div></li>)}</ol>
          {selected.unplaced.length > 0 && <p className="journey-alert">Unplaced: {selected.unplaced.map(id => managers.find(person => person.id === id)?.name || id).join(', ')}. Try more days, a closer airport, shorter visits or allowing handoffs.</p>}
        </section><section><h3>Budget, with the gaps visible</h3><div className="journey-budget"><span>Known planning subtotal</span><strong>{money(selected.budget.knownAmount)}</strong><small>USD · Incomplete estimate</small></div><dl className="journey-costs">{selected.budget.items.map(item => <div key={item.label}><dt>{item.label}<small>{item.basis}</small></dt><dd>{item.amount === null ? 'Unknown' : money(item.amount)}</dd></div>)}</dl></section></div>
        <section className="journey-gaps"><h3><ShieldCheck size={18}/> Before this becomes a travel commitment</h3><ul>{selected.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul><p>Calendar approval saves proposed appointments. Confirm meetings, flights and actual routes before travel.</p></section>
        <details className="journey-details"><summary><Clock3 size={16}/> Journey components and local times</summary><ol className="journey-legs">{[...selected.legs].sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((leg, index) => <li key={index}><div><strong>{leg.label}</strong><span>{duration(leg.minutes)}</span></div>{leg.start && <small>{new Date(leg.start).toLocaleString([], { timeZone: leg.timeZone || 'UTC', dateStyle: 'medium', timeStyle: 'short' })} · {leg.timeZone || 'UTC'}{leg.end ? ' → ' + new Date(leg.end).toLocaleString([], { timeZone: leg.timeZone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : ''}</small>}<p>{leg.basis}</p></li>)}</ol></details>
        <details className="journey-details"><summary><ShieldCheck size={16}/> Evidence and source freshness ({report.evidence.length})</summary><p>{report.sourceStatus}</p><TravelEvidence evidence={report.evidence}/>{!!report.signals?.length && <ul>{report.signals.map((signal, index) => <li key={index}><strong>{signal.title}</strong> · {signal.detail} <small>{report.evidence.find(item => item.id === signal.sourceId)?.provider} · {signal.validTo ? 'Through ' + stamp(signal.validTo) : signal.kind === 'forecast' ? 'Forecast period' : 'Observation / notice'}</small></li>)}</ul>}<ul>{report.notes.map(note => <li key={note}>{note}</li>)}</ul></details>
        <div className="journey-approval"><label className="journey-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/> I reviewed the estimates and unresolved evidence.</label><label className="journey-check"><input type="checkbox" checked={monitor} onChange={event => setMonitor(event.target.checked)}/> Keep checking public airport and weather sources for this plan</label><p>Opt-in reviews run while the server is available. Findings appear here; airline flight status, push alerts and automatic rebooking are not included.</p>
          {failure && <p className="journey-alert" role="alert">{failure}</p>}
          <button className="op-btn primary" disabled={busy || !selected.feasible || (selected.provisional && !acknowledged)} onClick={approve}><Check size={17}/>{busy ? 'Saving together…' : 'Add this option to Calendar'}</button>
        </div>
      </>}
    </div>}
    <HistoricalRouteCheck/>
    <details className="journey-reviews journey-details" open={watches.some(watch => !['stopped', 'complete'].includes(watch.state))}><summary>Ongoing travel reviews ({watches.filter(watch => !['stopped', 'complete'].includes(watch.state)).length})</summary><button className="op-btn" onClick={() => void loadReviews()}><RefreshCw size={14}/> Refresh reviews</button>
      {reviewError && <p role="alert">{reviewError}</p>}{!watches.length && <p>No watches yet. Enable public-source reviews when approving a plan.</p>}
      {watches.map(watch => <article className="journey-source" key={watch.id}><div><strong>{watch.airports?.join(' · ') || watch.airport}</strong><span className="journey-state">{watch.state}</span></div><p>{watch.review?.message || 'First review is queued. No current conclusion is available yet.'}</p><small>Last review: {stamp(watch.reviewedAt)} · Next attempt: {['stopped', 'complete'].includes(watch.state) ? 'None' : stamp(watch.nextRun)}</small>{!['stopped', 'complete'].includes(watch.state) && <button className="op-btn" onClick={async () => { try { await api.delete('/api/travel/reviews/' + watch.id); await loadReviews(); } catch { setReviewError('Could not stop this review. Refresh and try again.'); } }}>Stop reviews</button>}{!!watch.review?.evidence.length && <details><summary>Review evidence</summary><TravelEvidence evidence={watch.review.evidence}/></details>}</article>)}
    </details>
  </section>;
}
