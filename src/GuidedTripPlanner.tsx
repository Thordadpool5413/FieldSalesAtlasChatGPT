import { ArrowLeft, ArrowRight, Check, CircleAlert, MapPin, Plane, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOp } from './Operations';
import { today, dateLabel } from './opsModels';
import type { TravelPlan } from './TravelLogic';
import { airportGateways, defaultTravelPrefs, minutesLabel, money, newTravelPlan, safeTravelPrefs } from './TravelLogic';
import { buildCoachingSchedule, getPlanning } from './TripIntelligence';
import { tripConflicts } from './guidedPlanning';
import { api } from './workspaceApi';
import { CANADA_REGION_BY_CODE } from './CanadaRegions';

const steps = ['People', 'Dates', 'Airports', 'Review'];
function requestedPlace(request: ReturnType<typeof useOp>['travelRequest']) {
  if (!request) return null;
  if (request.reference) return { name: request.reference.label, state: request.state, lat: request.reference.lat, lon: request.reference.lon, code: 'region-reference' };
  const province = CANADA_REGION_BY_CODE[request.state];
  return province ? { name: province.anchorCity, state: request.state, lat: province.lat, lon: province.lon, code: 'province-reference' } : null;
}

export default function GuidedTripPlanner({ onAdvanced }: { onAdvanced: (plan: TravelPlan) => void }) {
  const ctx = useOp();
  const request = ctx.travelRequest;
  const [plan, setPlan] = useState<TravelPlan>(() => ({
    ...newTravelPlan(), title: '', trainer: ctx.activeTrainer.name,
    managerIds: request?.managerIds || (request?.managerId ? [request.managerId] : []),
    origins: ctx.activeTrainer.homeAirports.slice(), selectedArrival: request?.arrivalAirport || '',
    destination: requestedPlace(request),
    ...(request?.departDate ? { departDate: request.departDate } : {}),
    ...(request?.returnDate ? { returnDate: request.returnDate } : {}),
  }));
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [storedPrefs, setStoredPrefs] = useState(defaultTravelPrefs);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestId = useRef('');
  const previousTrainer = useRef(ctx.activeTrainerId);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef<number | null>(null);
  const managers = ctx.board.managers || [];
  const selected = managers.filter(person => plan.managerIds.includes(person.id));
  const prefs = useMemo(() => ({ ...storedPrefs, homeAirports: ctx.activeTrainer.homeAirports, homeDriveMinutes: { ...storedPrefs.homeDriveMinutes, ...ctx.activeTrainer.homeDriveMinutes } }), [storedPrefs, ctx.activeTrainer]);
  const gateways = useMemo(() => airportGateways(ctx.airports, null, selected, prefs, 6), [ctx.airports, selected, prefs]);
  const airport = ctx.airports.find(item => item.iata === plan.selectedArrival);
  const planning = getPlanning(plan);
  const schedule = useMemo(() => buildCoachingSchedule(plan, airport, managers, prefs), [plan, airport, managers, prefs]);
  const conflicts = tripConflicts(plan, schedule, ctx.board, ctx.activeTrainerId);
  const missingLocations = selected.filter(person => !Number.isFinite(person.lat) || !Number.isFinite(person.lon));
  const shownManagers = managers.filter(person => `${person.name} ${person.baseCity || ''} ${person.baseState || ''}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    let active = true;
    void api.get('/api/travel/preferences?slot=' + ctx.activeTrainerId).then(result => {
      if (active) setStoredPrefs(safeTravelPrefs(result.data.preferences || defaultTravelPrefs));
    }).catch(() => { if (active) setStoredPrefs(defaultTravelPrefs); });
    return () => { active = false; };
  }, [ctx.activeTrainerId]);
  useEffect(() => {
    if (previousTrainer.current === ctx.activeTrainerId) {
      setPlan(current => {
        const origins = current.origins.length ? current.origins : ctx.activeTrainer.homeAirports.slice();
        if (current.trainer === ctx.activeTrainer.name && (current.origins.length || !origins.length)) return current;
        return { ...current, trainer: ctx.activeTrainer.name, origins };
      });
      return;
    }
    previousTrainer.current = ctx.activeTrainerId;
    requestId.current = '';
    setPlan(current => ({ ...current, trainer: ctx.activeTrainer.name, origins: ctx.activeTrainer.homeAirports.slice() }));
    setStep(0); setError('');
  }, [ctx.activeTrainerId, ctx.activeTrainer.name, ctx.activeTrainer.homeAirports]);
  useEffect(() => {
    if (!ctx.travelRequest) return;
    const next = ctx.travelRequest;
    requestId.current = '';
    setPlan(current => ({ ...current,
      managerIds: next.managerIds || (next.managerId ? [next.managerId] : []),
      departDate: next.departDate || current.departDate, returnDate: next.returnDate || current.returnDate,
      selectedArrival: next.arrivalAirport || '',
      destination: requestedPlace(next),
    }));
    setStep(0); ctx.clearTravelRequest();
  }, [ctx.travelRequest?.nonce]);
  useEffect(() => {
    if (previousStep.current !== null && previousStep.current !== step) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    previousStep.current = step;
  }, [step]);

  function change(patch: Partial<TravelPlan>) {
    if (saving.current) return;
    requestId.current = ''; setError(''); setPlan(current => ({ ...current, ...patch }));
  }
  function validStep(index: number): boolean {
    if (index === 0) return selected.length > 0 && missingLocations.length === 0 && selected.every(person => person.baseState || ctx.board.assignments?.some(item => item.managerId === person.id));
    if (index === 1) return !!plan.departDate && plan.departDate >= today() && plan.returnDate >= plan.departDate && Number.isFinite(planning.sessionMinutes) && planning.sessionMinutes >= 30 && planning.dayEnd > planning.dayStart;
    return index === 2 ? !!airport && plan.origins.length > 0 : conflicts.length === 0;
  }
  function advance() {
    if (!validStep(step)) { setError('Complete the required information before continuing.'); return; }
    setError(''); setStep(current => Math.min(3, current + 1));
  }
  async function commit() {
    if (saving.current || ![0, 1, 2, 3].every(validStep)) return;
    saving.current = true; setBusy(true); setError('');
    requestId.current ||= crypto.randomUUID();
    try {
      const response = await api.post('/api/travel/commit', {
        requestId: requestId.current, expectedRevision: ctx.board.revision, trainerId: ctx.activeTrainerId,
        title: plan.title.trim() || `${selected[0].baseState || ctx.state} coaching circuit`,
        trainer: ctx.activeTrainer.name, startDate: plan.departDate, endDate: plan.returnDate,
        arrivalAirport: plan.selectedArrival,
        notes: 'Proposed coaching windows from guided planning. Confirm appointments, actual driving routes, airline schedules and local time zones before travel.',
        stops: schedule.visits.map(item => ({
          managerId: item.manager.id, stateCode: item.manager.baseState || ctx.board.assignments?.find(area => area.managerId === item.manager.id)?.stateCode,
          date: item.date, location: item.manager.baseCity || '', startTime: item.start, endTime: item.end,
          lat: item.manager.lat, lon: item.manager.lon,
        })),
      });
      await ctx.reload();
      ctx.setNotice(`${response.data.scheduledVisits} proposed visits and the trip saved together. Confirm meeting times before travel.`);
      ctx.go('calendar');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not confirm scheduling. Check the calendar before retrying.');
    } finally { saving.current = false; setBusy(false); }
  }
  return <section className="atlas-guided" aria-label="Guided trip planner">
    <header><div><h1>Plan a field trip</h1><p>One path from your people to a shared itinerary.</p></div>
      <button className="op-btn" disabled={busy} onClick={() => onAdvanced(plan)}>Advanced comparison <ArrowRight size={15}/></button>
    </header>
    <ol className="atlas-planner-steps" aria-label="Trip planning steps">{steps.map((label, index) => <li key={label}>
      <button type="button" aria-current={index === step ? 'step' : undefined} disabled={busy || index > step} onClick={() => { setStep(index); setError(''); }}><span>{index < step ? <Check size={15}/> : index + 1}</span>{label}</button>
    </li>)}</ol>
    <div className="atlas-guided-content">
      {step === 0 && <>
        <h2 ref={heading} tabIndex={-1}>Who are you visiting?</h2><p>Select up to 12 managers. Their saved locations help compare arrival airports.</p>
        <label className="atlas-guided-search">Find a manager<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, city or state" type="search"/></label>
        {!managers.length && <div className="atlas-guided-empty"><strong>Your roster starts here</strong><p>Add a manager with a base location, then return to plan the trip.</p><button className="op-btn primary" onClick={() => ctx.open('manager')}><Plus size={16}/> Add manager</button></div>}
        <div className="atlas-guided-people">{shownManagers.map(person => <label key={person.id}>
          <input type="checkbox" checked={plan.managerIds.includes(person.id)} disabled={!plan.managerIds.includes(person.id) && selected.length >= 12} onChange={() => change({ managerIds: plan.managerIds.includes(person.id) ? plan.managerIds.filter(id => id !== person.id) : [...plan.managerIds, person.id], selectedArrival: '' })}/>
          <span><strong>{person.name}</strong><small>{[person.baseCity, person.baseState, person.trainer].filter(Boolean).join(' · ') || 'Location not set'}</small></span>
          {(!Number.isFinite(person.lat) || !Number.isFinite(person.lon)) && <button className="atlas-quiet-action" type="button" onClick={event => { event.preventDefault(); ctx.open('manager', person); }}>Set location</button>}
        </label>)}</div>
        {!!managers.length && !shownManagers.length && <p role="status">No managers match this search. Try another name or location.</p>}
        {missingLocations.length > 0 && <p className="atlas-guided-warning">Set a mapped base location for {missingLocations.map(person => person.name).join(', ')} before comparing airports.</p>}
        <p role="status">{selected.length} of 12 managers selected</p>
      </>}
      {step === 1 && <>
        <h2 ref={heading} tabIndex={-1}>When can you be in the field?</h2><p>Planning as <strong>{ctx.activeTrainer.name}</strong>. Times are proposed local appointment windows.</p>
        <div className="atlas-guided-fields">
          <label>Trip name<input value={plan.title} maxLength={150} onChange={event => change({ title: event.target.value })} placeholder="e.g. Central Florida coaching"/></label>
          <label>Departure date<input type="date" min={today()} value={plan.departDate} onChange={event => change({ departDate: event.target.value, returnDate: plan.returnDate < event.target.value ? event.target.value : plan.returnDate })}/></label>
          <label>Return date<input type="date" min={plan.departDate} value={plan.returnDate} onChange={event => change({ returnDate: event.target.value })}/></label>
          <label>Workday starts<input type="time" value={planning.dayStart} onChange={event => change({ planning: { ...planning, dayStart: event.target.value } })}/></label>
          <label>Workday ends<input type="time" value={planning.dayEnd} onChange={event => change({ planning: { ...planning, dayEnd: event.target.value } })}/></label>
          <label>Minutes per visit<input type="number" min={30} max={480} step={30} value={planning.sessionMinutes} onChange={event => change({ planning: { ...planning, sessionMinutes: Number(event.target.value) } })}/></label>
        </div>
        <label className="atlas-guided-check"><input type="checkbox" checked={planning.includeWeekends} onChange={event => change({ planning: { ...planning, includeWeekends: event.target.checked } })}/> Include weekend coaching days</label>
      </>}
      {step === 2 && <>
        <h2 ref={heading} tabIndex={-1}>Choose your arrival airport</h2><p>Ranked by estimated ground travel to your selected managers. These are reference gateways, not flight schedules.</p>
        <p className="atlas-data-source">Airport reference: {ctx.airportSource === 'live' ? 'current public directory' : ctx.airportSource === 'cached' ? 'cached directory' : 'limited starter directory'}</p>
        <label>Departure airport<select aria-label="Departure airport" value={plan.origins[0] || ''} onChange={event => change({ origins: event.target.value ? [event.target.value] : [] })}><option value="">Choose a home airport</option>{ctx.activeTrainer.homeAirports.map(code => <option value={code} key={code}>{code}</option>)}</select></label>
        {!ctx.activeTrainer.homeAirports.length && <button className="op-btn" onClick={ctx.openTrainers}>Set home airports</button>}
        <div className="atlas-guided-gateways" role="radiogroup" aria-label="Arrival airports">{gateways.map(gateway => <label key={gateway.airport.iata}>
          <input type="radio" name="guided-arrival" value={gateway.airport.iata} checked={plan.selectedArrival === gateway.airport.iata} onChange={() => change({ selectedArrival: gateway.airport.iata })}/>
          <strong>{gateway.airport.iata}</strong><span>{gateway.airport.name}<small>{minutesLabel(gateway.planningDriveMinutes)} estimated ground travel for the circuit</small></span><Plane size={18}/>
        </label>)}</div>
        {!gateways.length && <p role="alert">No reference gateways are available for these manager locations. Review their coordinates or use advanced comparison.</p>}
      </>}
      {step === 3 && <>
        <h2 ref={heading} tabIndex={-1}>Review before adding to Calendar</h2>
        <div className="atlas-guided-summary"><strong>{plan.title || 'Coaching circuit'}</strong><span>{ctx.activeTrainer.name} · {dateLabel(plan.departDate)} – {dateLabel(plan.returnDate)}</span><span><Plane size={15}/> {plan.origins[0]} → {plan.selectedArrival} · flights researched separately</span></div>
        <ol className="atlas-guided-itinerary">{schedule.visits.map(item => <li key={item.manager.id + item.date}><MapPin size={18}/><div><strong>{item.manager.name}</strong><span>{dateLabel(item.date)} · {item.start}–{item.end} · {item.manager.baseCity || item.manager.baseState}</span></div></li>)}</ol>
        <p className="atlas-data-source">Estimated ground travel: {minutesLabel(schedule.drivingMinutes)}. Lodging baseline: {money(Math.max(0, Math.round((Date.parse(plan.returnDate) - Date.parse(plan.departDate)) / 86400000)) * prefs.hotelPerNight)} at your planning rate. Airfare and other trip costs excluded.</p>
        {conflicts.length > 0 ? <div className="atlas-guided-warning" role="alert"><strong>Resolve these conflicts before saving</strong><ul>{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul><button className="op-btn" onClick={() => ctx.go('calendar')}>Review shared calendar</button></div> : <p className="atlas-guided-clear"><Check size={17}/> No conflicts found in saved workspace records.</p>}
        <p>Appointments, flight availability, actual driving routes and local time zones still need confirmation. Saving creates the trip and its proposed visits together.</p>
      </>}
      {error && <p className="op-error" role="alert"><CircleAlert size={17}/>{error}</p>}
    </div>
    <footer><button className="op-btn" onClick={() => setStep(current => current - 1)} disabled={step === 0 || busy}><ArrowLeft size={16}/> Back</button>
      {step < 3 ? <button className="op-btn primary" disabled={!validStep(step) || busy} onClick={advance}>Continue to {steps[step + 1]} <ArrowRight size={16}/></button> : <button className="op-btn primary" disabled={busy || ![0, 1, 2, 3].every(validStep)} onClick={commit}>{busy ? 'Saving…' : 'Add trip and visits to Calendar'} <Check size={16}/></button>}
    </footer>
  </section>;
}
