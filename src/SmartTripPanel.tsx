
import {
ArrowDownToLine,ArrowRight,CalendarClock,CalendarDays,CheckCircle2,
ChevronRight,CircleAlert,
Gauge,MapPin,Plane,
Plus,Route,ShieldAlert,Sparkles,Users
} from 'lucide-react';
import { useMemo,useState } from 'react';
import type { Airport,Coaching,Manager,Trip,Visit } from './opsModels';
import { dateLabel,downloadFile } from './opsModels';
import './SmartTripPanel.css';
import type { FlightQuote,Gateway,TravelPlan,TravelPrefs,TripPlanning } from './TravelLogic';
import { minutesLabel,money } from './TravelLogic';
import {
airportTradeoffs,buildCoachingSchedule,checkFlightWindows,
getPlanning,nearbyCoachingOpportunities,planningBrief,
} from './TripIntelligence';

type Props = {
  plan: TravelPlan;
  prefs: TravelPrefs;
  airport?: Airport;
  airports: Airport[];
  gateways: Gateway[];
  managers: Manager[];
  visits: Visit[];
  coaching: Coaching[];
  trips: Trip[];
  onPlanningChange: (next: TripPlanning) => void;
  onManagerAdd: (managerId: string) => void;
  onAirportSelect: (code: string) => void;
  onCreateItinerary: () => void;
  onCompareFlights: () => void;
  onSave: () => void;
  onQuoteEdit: (quote: FlightQuote) => void;
  signedIn: boolean;
  busy: boolean;
};

function PlanningInput({
  label, children, hint,
}: {
  label: string; children: React.ReactNode; hint?: string;
}) {
  return <label className="smart-field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}

export default function SmartTripPanel({
  plan, prefs, airport, airports, gateways, managers, visits, coaching, trips,
  onPlanningChange, onManagerAdd, onAirportSelect, onCreateItinerary,
  onCompareFlights, onSave, onQuoteEdit, signedIn, busy,
}: Props) {
  const [radius, setRadius] = useState(65);
  const planning = getPlanning(plan);
  const schedule = useMemo(
    () => buildCoachingSchedule(plan, airport, managers, prefs),
    [plan, airport, managers, prefs]
  );
  const selected = managers.filter(m => plan.managerIds.includes(m.id));
  const choices = useMemo(() => airportTradeoffs(gateways, prefs), [gateways, prefs]);
  const opportunities = useMemo(
    () => nearbyCoachingOpportunities(plan, managers, visits, coaching, airport, radius),
    [plan, managers, visits, coaching, airport, radius]
  );
  const flightWindows = useMemo(
    () => plan.quotes.map(quote => ({
      quote, check: checkFlightWindows(quote, schedule, prefs, plan, airports),
    })),
    [plan, schedule, prefs, airports]
  );

  const preexistingVisits = schedule.visits.flatMap(item =>
    visits
      .filter(v => v.managerId === item.manager.id && v.date === item.date &&
        (v.status === 'Planned' || v.status === 'Rescheduled'))
      .map(v => ({ name: item.manager.name, date: item.date, visit: v }))
  );
  const overlappingTrips = trips.filter(t =>
    t.status !== 'Canceled' && !!plan.trainer && !!t.trainer &&
    plan.trainer.trim().toLowerCase() === t.trainer.trim().toLowerCase() &&
    t.startDate <= plan.returnDate && t.endDate >= plan.departDate
  );
  const missingLocations = selected.filter(m => !Number.isFinite(m.lat) || !Number.isFinite(m.lon));
  const readyChecks = [
    { label: 'Managers selected', valid: selected.length > 0 },
    { label: 'Manager locations mapped', valid: selected.length > 0 && missingLocations.length === 0 },
    { label: 'Arrival gateway identified', valid: !!airport && Number.isFinite(airport.lat) && Number.isFinite(airport.lon) },
    { label: 'Flight arrival and return cutoff entered', valid: plan.quotes.some(q => !!q.outboundArrivalLocal && !!q.returnDepartureLocal) },
  ];
  const readyCount = readyChecks.filter(c => c.valid).length;
  const sessionHours = schedule.coachedMinutes / 60;
  const hasRisk = schedule.unplaced.length > 0 || preexistingVisits.length > 0 ||
    overlappingTrips.length > 0 || flightWindows.some(f => f.check.status === 'risk');

  function change<K extends keyof TripPlanning>(field: K, value: TripPlanning[K]) {
    onPlanningChange({ ...planning, [field]: value });
  }

  function downloadBrief() {
    const brief = planningBrief(plan, schedule, airport, plan.quotes);
    downloadFile('field-sales-atlas-coaching-travel-brief.txt', brief, 'text/plain;charset=utf-8');
  }

  return <div className="smart-workspace">
    <div className="smart-opening">
      <div>
        <span className="smart-overline"><Sparkles size={15}/> FIELD COACHING INTELLIGENCE</span>
        <h2>Build the trip around your managers.</h2>
        <p>Adjust the coaching time, compare arrival airports, and see what really fits before choosing your flight.</p>
      </div>
      <div className="smart-main-actions">
        <button className="op-btn" onClick={downloadBrief} disabled={selected.length === 0}>
          <ArrowDownToLine size={15}/> Download trip brief
        </button>
        <button className="op-btn primary" onClick={onSave} disabled={!signedIn || busy}>
          <CheckCircle2 size={15}/> Save planning choices
        </button>
      </div>
    </div>

    <div className="smart-status-bar">
      <div>
        <span>Proposed coaching visits</span>
        <strong>{schedule.visits.length}<small> / {selected.length} managers</small></strong>
      </div>
      <div>
        <span>Scheduled coaching hours</span>
        <strong>{Number(sessionHours.toFixed(1))}<small> hours</small></strong>
      </div>
      <div>
        <span>Approx. in-region transfers</span>
        <strong>{minutesLabel(schedule.drivingMinutes)}</strong>
      </div>
      <div>
        <span>Planning information ready</span>
        <strong>{readyCount}<small> / {readyChecks.length}</small></strong>
      </div>
    </div>

    <div className="smart-columns">
      <div className="smart-primary">
        <section className="smart-panel">
          <div className="smart-panel-head">
            <div><span className="smart-section-label">SCHEDULE DESIGN</span><h3>Define the coaching window</h3></div>
            <CalendarClock size={20}/>
          </div>
          <div className="smart-form-grid">
            <PlanningInput label="First coaching day">
              <input type="date" min={plan.departDate} max={plan.returnDate}
                value={planning.firstCoachingDate} onChange={e => change('firstCoachingDate', e.target.value)}/>
            </PlanningInput>
            <PlanningInput label="Last coaching day">
              <input type="date" min={planning.firstCoachingDate} max={plan.returnDate}
                value={planning.lastCoachingDate} onChange={e => change('lastCoachingDate', e.target.value)}/>
            </PlanningInput>
            <PlanningInput label="Daily start time">
              <input type="time" value={planning.dayStart} onChange={e => change('dayStart', e.target.value)}/>
            </PlanningInput>
            <PlanningInput label="Daily finish time">
              <input type="time" value={planning.dayEnd} onChange={e => change('dayEnd', e.target.value)}/>
            </PlanningInput>
            <PlanningInput label="Minutes per coaching visit">
              <select value={planning.sessionMinutes} onChange={e => change('sessionMinutes', Number(e.target.value))}>
                {[60, 90, 120, 150, 180, 240, 300, 360].map(v => <option key={v} value={v}>{minutesLabel(v)}</option>)}
              </select>
            </PlanningInput>
            <PlanningInput label="Break between coaching visits">
              <select value={planning.breakMinutes} onChange={e => change('breakMinutes', Number(e.target.value))}>
                {[0, 15, 30, 45, 60].map(v => <option key={v} value={v}>{v} minutes</option>)}
              </select>
            </PlanningInput>
            <PlanningInput label="Arrival-to-visit safety buffer">
              <select value={planning.arrivalToCoachingBufferMinutes} onChange={e => change('arrivalToCoachingBufferMinutes', Number(e.target.value))}>
                {[0, 30, 45, 60, 90, 120].map(v => <option value={v} key={v}>{v} minutes</option>)}
              </select>
            </PlanningInput>
            <label className="smart-weekend-checkbox">
              <input type="checkbox" checked={planning.includeWeekends||false} onChange={e => change('includeWeekends', e.target.checked)}/>
              <span>Include Saturday and Sunday</span>
            </label>
          </div>
          <p className="smart-explainer">Proposed times start from your selected daily schedule and use approximate transfers between mapped manager base cities. They are not confirmed appointments or real-time driving estimates.</p>
        </section>

        <section className="smart-panel">
          <div className="smart-panel-head">
            <div><span className="smart-section-label">PROPOSED ITINERARY</span><h3>What actually fits?</h3></div>
            {schedule.status === 'overbooked'
              ? <span className="smart-pill danger">{schedule.unplaced.length} visit(s) don't fit</span>
              : selected.length ? <span className="smart-pill tentative">Planning estimate</span>
                : <span className="smart-pill">Awaiting managers</span>}
          </div>
          {!selected.length ?
            <div className="smart-empty">
              <Users size={26}/>
              <strong>Select territory managers first</strong>
              <p>Go to Find arrival airports, choose the managers you need to coach, then return here for an itinerary.</p>
              <button className="op-btn" onClick={onCompareFlights}><Plane size={15}/> Review flight options</button>
            </div>
            : !schedule.visits.length ?
            <div className="smart-empty"><CalendarDays size={25}/><strong>No visits fit the selected window</strong>
              <p>Expand the coaching dates, workday hours, or shorten the planned session length.</p></div>
            : <div className="smart-itinerary">
              {schedule.visits.map((item, i) =>
                <div className="smart-itinerary-row" key={item.manager.id+'-'+item.date}>
                  <div className="smart-step-counter">{String(i+1).padStart(2,'0')}</div>
                  <div className="smart-itinerary-main">
                    <strong>{item.manager.name}</strong>
                    <span><MapPin size={12}/> {item.manager.baseCity ? item.manager.baseCity+', '+(item.manager.baseState||'') : 'Manager location not set'}</span>
                  </div>
                  <div className="smart-itinerary-time">
                    <strong>{dateLabel(item.date,{month:'short',day:'numeric'})}</strong>
                    <span>{item.start} – {item.end}</span>
                    <small>{item.travelBeforeMinutes === null ? 'Transfer unknown' : minutesLabel(item.travelBeforeMinutes)+' transfer (est.)'}</small>
                  </div>
                </div>
              )}
            </div>}
          {schedule.unplaced.length > 0 && <div className="smart-unplaced">
            <CircleAlert size={16}/>
            <div><strong>Not enough coaching time for: {schedule.unplaced.map(m => m.name).join(', ')}</strong>
              <span>Add a day or adjust working hours. These managers will not be included as scheduled stops.</span></div>
          </div>}
          {schedule.unknownLegs>0&&<div className="smart-unplaced" role="alert">
            <CircleAlert size={16}/>
            <div><strong>Map missing stops before automatic scheduling.</strong>
              <span>{schedule.unknownLegs} ground transfer{schedule.unknownLegs===1?'':'s'} cannot be estimated.
                Add manager base locations or plan visits manually in Calendar; unknown driving time cannot be treated as zero.</span>
            </div>
          </div>}
          <div className="smart-footer-actions">
            <button className="op-btn" onClick={downloadBrief} disabled={selected.length === 0}>
              <ArrowDownToLine size={15}/> Download proposal
            </button>
            <button className="op-btn primary" title="Atomically add the proposed itinerary and manager coaching visits to the shared calendar; appointments remain unconfirmed" onClick={onCreateItinerary}
              disabled={!signedIn || busy || schedule.visits.length===0 ||
                schedule.unplaced.length>0 || schedule.unknownLegs>0 || !airport ||
                preexistingVisits.length>0 || overlappingTrips.length>0}>
              <Route size={15}/> Add trip & visits to calendar <ArrowRight size={14}/>
            </button>
          </div>
        </section>

        <section className="smart-panel">
          <div className="smart-panel-head">
            <div><span className="smart-section-label">FLIGHT & APPOINTMENT CHECK</span><h3>Can the flights support this trip?</h3></div>
            <Plane size={20}/>
          </div>
          {plan.quotes.length === 0 ? <div className="smart-empty compact">
            <Plane size={25}/><strong>Nothing to check until a flight is entered</strong>
            <p>Add an actual flight quote with outbound arrival and return departure dates/times. We'll compare those against the proposed coaching window.</p>
            <button className="op-btn" onClick={onCompareFlights}><Plus size={15}/> Compare actual flights</button>
          </div> : flightWindows.map(({quote,check}) => <div className="smart-flight-check" key={quote.id}>
            <div className="smart-flight-check-title">
              <div><strong>{quote.origin} → {quote.destination}</strong>
                <small>{quote.carrier||'Airline not entered'} · {money(quote.fare)} entered fare</small></div>
              <span className={'smart-pill '+(check.status==='risk'?'danger':check.status==='conditional'?'tentative':'')}>
                {check.status==='risk'?'Potential conflict':check.status==='conditional'?'Conditional':'Needs flight times'}
              </span>
            </div>
            <div className="smart-flight-check-lines">
              {check.lines.map((line,i)=><div key={i}><span className="smart-dot"/>{line}</div>)}
            </div>
            <button className="smart-text-button" onClick={()=>onQuoteEdit(quote)}>Edit flight times <ChevronRight size={14}/></button>
          </div>)}
          <p className="smart-explainer">Timing checks use local clock values entered by you. They do not resolve different time zones, airline changes, security lines or flight disruptions automatically.</p>
        </section>
      </div>

      <aside className="smart-secondary">
        <section className="smart-panel">
          <div className="smart-panel-head">
            <div><span className="smart-section-label">AIRPORT TRADE-OFFS</span><h3>Closest airport isn't always best.</h3></div><Gauge size={20}/>
          </div>
          {choices.length ?
            <div className="smart-airport-list">{choices.map((row,i)=><button key={row.gateway.airport.iata}
              className={'smart-airport-row'+(airport?.iata===row.gateway.airport.iata?' chosen':'')}
              onClick={()=>onAirportSelect(row.gateway.airport.iata)}>
              <span className="smart-airport-code">{row.gateway.airport.iata}</span>
              <div><strong>{row.gateway.airport.name}</strong>
                <small>{minutesLabel(row.gateway.planningDriveMinutes)} total ground circuit (est.)</small></div>
              <span className="smart-airport-delta">
                {i===0?'Shortest estimate':
                  '+'+minutesLabel(row.minutesDelta)+' · '+money(row.totalPenalty)}
              </span>
            </button>)}</div>
            : <p className="smart-explainer">Select a mapped destination or manager to compare practical airport gateways.</p>}
          <p className="smart-explainer">Extra time and monetary amounts compare the same ground circuit against the shortest model estimate. Flight prices, nonstop routes, airport accessibility and rental fees are not included.</p>
        </section>

        <section className="smart-panel">
          <div className="smart-panel-head">
            <div><span className="smart-section-label">MAKE THE TRIP COUNT</span><h3>Who else is nearby?</h3></div><Users size={20}/>
          </div>
          <div className="smart-radius">
            <span>Within straight-line miles</span>
            <select value={radius} onChange={e=>setRadius(Number(e.target.value))}>
              {[25,50,65,100,150].map(value=><option key={value} value={value}>{value} mi</option>)}
            </select>
          </div>
          {opportunities.length ?
            opportunities.map(o=><div key={o.manager.id} className="smart-opportunity">
              <div><strong>{o.manager.name}</strong>
                <span>{o.manager.baseCity||'Mapped location'} · {Math.round(o.straightMiles)} straight-line miles</span>
                <small>{o.reasons[0]||'No immediate coaching flag'} · {o.priority} planning priority</small></div>
              <button className="op-btn tiny" onClick={()=>onManagerAdd(o.manager.id)} disabled={plan.managerIds.length>=12}>
                <Plus size={13}/> Add
              </button>
            </div>)
            : <p className="smart-explainer">{selected.length||plan.destination?
                'No other mapped managers within this distance, or no additional managers are available.'
                :'Select a city or manager to find nearby coaching opportunities.'}</p>}
          <p className="smart-explainer">Recommendations use saved coaching records and base-city proximity, not live sales performance or verified driving routes.</p>
        </section>

        <section className="smart-panel">
          <div className="smart-panel-head">
            <div><span className="smart-section-label">BEFORE BOOKING</span><h3>Travel readiness check</h3></div>
            <ShieldAlert size={20}/>
          </div>
          <div className="smart-readiness-list">
            {readyChecks.map(check=><div key={check.label}>
              {check.valid?<CheckCircle2 size={16} color="#3e9b76"/>:<CircleAlert size={16} color="#c58c54"/>}
              <span>{check.label}</span></div>)}
          </div>
          {preexistingVisits.length>0 && <div className="smart-warning">
            <CircleAlert size={17}/><span>{preexistingVisits.length} existing planned visit(s) overlap a proposed manager/date. Verify whether they are already scheduled.</span>
          </div>}
          {overlappingTrips.length>0 && <div className="smart-warning">
            <CalendarClock size={17}/><span>{overlappingTrips.length} saved trip(s) overlap this trainer's selected travel dates.</span>
          </div>}
          {schedule.warnings.map((w,i)=><div key={i} className="smart-caution-line"><CircleAlert size={13}/>{w}</div>)}
          {!hasRisk && readyCount===readyChecks.length && <p className="smart-note-success"><CheckCircle2 size={16}/> Basic planning details are complete. Confirm the meeting appointments, road routes, airline inventory and travel policy before booking.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
