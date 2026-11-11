import {
ArrowRight,
Check,ChevronRight,CircleAlert,
Plane,Radar,Route,
ShieldCheck,
TicketCheck,Waypoints
} from 'lucide-react';
import { readBookedFlights } from './BookedFlightLogic';
import FieldMissionBrief from './FieldMissionBrief';
import MobileJourneyPeek from './MobileJourneyPeek';
import IntelligenceGallery from './IntelligenceGallery';
import { useOp } from './Operations';
import type { Manager } from './opsModels';
import { dateLabel,today } from './opsModels';
import './TravelCommandHome.css';

type Tool = 'start' | 'week' | 'coordinate' | 'travel' | 'radar' | 'booked' | 'trips';
type Region = {code:string;name:string;country:'US'|'CA'};
type Props = {onSectionChange:(tool:Tool)=>void;
  onDestination:(region:Region,manager?:Manager)=>void;
  onCircuit:(region:Region,people:Manager[],departDate:string,returnDate:string)=>void;};

function shiftDate(iso: string, amount: number): string {
  const date = new Date(iso + 'T12:00:00');
  date.setDate(date.getDate() + amount);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function sevenDayRange(anchor: string): string[] {
  const date = new Date(anchor + 'T12:00:00');
  const daysFromMonday = (date.getDay() + 6) % 7;
  const monday = shiftDate(anchor, -daysFromMonday);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export default function TravelStart({ onSectionChange,onDestination,onCircuit }: Props) {
  const ctx = useOp();
  const currentDate = today();
  const activeTrainer = ctx.activeTrainer;
  const activeName = activeTrainer.name;
  const managerLookup = new Map((ctx.board.managers || []).map(person => [person.id, person]));
  const visitTrainer = (managerId: string, explicit?: string) =>
    explicit || managerLookup.get(managerId)?.trainer || '';

  const visits = (ctx.board.visits || [])
    .filter(visit =>
      (visit.status === 'Planned' || visit.status === 'Rescheduled') &&
      visit.date >= currentDate
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const unassigned = visits.filter(visit => !visitTrainer(visit.managerId, visit.trainer));

  const upcomingTrips = (ctx.board.trips || [])
    .filter(trip => trip.status === 'Planned' && trip.endDate >= currentDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const myTrip = upcomingTrips.find(trip => trip.trainer === activeName);

  const savedFlights = readBookedFlights()
    .filter(record =>
      record.trainerId === ctx.activeTrainerId &&
      record.legs.some(leg => leg.departDate >= currentDate)
    )
    .sort((a, b) => (a.legs[0]?.departDate || '').localeCompare(b.legs[0]?.departDate || ''));
  const myFlight = savedFlights[0];
  const firstLeg = myFlight?.legs[0];
  const finalLeg = myFlight?.legs[myFlight.legs.length - 1];

  const weekDates = sevenDayRange(currentDate);
  const weekLabel = dateLabel(weekDates[0], { month: 'short', day: 'numeric' }) +
    ' – ' + dateLabel(weekDates[6], { month: 'short', day: 'numeric' });
  const hasWeekVisits = visits.some(visit => weekDates.includes(visit.date));

  const homeAirport = activeTrainer.homeAirports?.[0] || '';
  const originCode = firstLeg?.origin || homeAirport;
  const destinationCode = finalLeg?.destination || myTrip?.arrivalAirport || '';
  const hasSavedMission = Boolean(myFlight || myTrip);
  const missionDate = firstLeg?.departDate || myTrip?.startDate || '';
  const missionName = myTrip?.title || '';
  const missionStatus = myFlight ? 'SAVED FLIGHT / ON THIS DEVICE' :
    myTrip ? 'UPCOMING SHARED FIELD TRIP' : 'NEW MISSION / READY TO PLAN';

  const openFlight = () => {
    if (myFlight) {
      try {
        sessionStorage.setItem('atlas-guardian-open-flight-v1', myFlight.id);
      } catch {
        // Viewing a saved booking remains available if session storage is disabled.
      }
    }
    onSectionChange('booked');
  };

  const openedTrip = () => onSectionChange('trips');
  const openMission = myFlight ? openFlight : myTrip ? openedTrip :
    () => onSectionChange('travel');

  const weeks = ctx.trainerProfiles.map((trainer, index) => ({
    id: trainer.id,
    name: trainer.name,
    tint: index === 0 ? 'aqua' : 'pink'
  }));

  const ready = [
    {
      done: Boolean(homeAirport),
      title: 'Home airport',
      detail: homeAirport || 'Set your departure gateway',
      action: ctx.openTrainers
    },
    {
      done: Boolean(myTrip),
      title: 'Field itinerary',
      detail: myTrip ? dateLabel(myTrip.startDate, { month: 'short', day: 'numeric' }) : 'Choose a destination',
      action: () => onSectionChange(myTrip ? 'trips' : 'travel')
    },
    {
      done: Boolean(myFlight),
      title: 'Booked flight',
      detail: myFlight ? 'Saved on this device' : 'Import an itinerary',
      action: openFlight
    }
  ];
  const completed = ready.filter(item => item.done).length;

  return (
    <main className='fao' aria-label='Field Atlas travel desk'>
      <header className="op-head atlas-editorial-head fao-workbench-head">
        <div>
          <p className="op-eyebrow"><span className="atlas-beacon" aria-hidden="true"/> FIELD TRAVEL / PLANNING</p>
          <h1>Make the next move count<span className="atlas-page-period" aria-hidden="true">.</span></h1>
          <p className="op-subtitle">Plan the field. Protect the trip. Stay in sync.</p>
        </div>
        <div className="op-head-actions">
          <button type="button" className="op-btn primary" data-testid="button-new-trip"
            onClick={()=>onSectionChange('travel')}>
            New trip <ArrowRight size={16}/>
          </button>
        </div>
      </header>
      <div className="vice-travel-context"><span>{activeName} · {dateLabel(currentDate,{weekday:'short',month:'short',day:'numeric'})}</span>
        <button type="button" onClick={()=>onSectionChange('radar')}><Radar size={16}/> Intelligence toolkit <ArrowRight size={16}/></button></div>
      <IntelligenceGallery/>
      <div className="fao-mobile-journey" aria-label="Your next booked flight or field trip">
        <MobileJourneyPeek
          onBooked={()=>onSectionChange('booked')}
          onTrip={()=>onSectionChange('trips')}
        />
      </div>

      <div className='fao-feature-grid'>
        <section className='fao-routeboard' aria-labelledby='fao-route-heading'>
          <div className='fao-panel-top'>
            <span><span className='fao-numeral'>01</span> / ROUTE STUDIO</span>
            <span className='fao-panel-meta'>PRIVATE BOOKING DATA · SHARED TRIP PLANS</span>
          </div>
          <div className='fao-route-heading'>
            <span className='fao-route-status'><span className='fao-status-line' /> {missionStatus}</span>
            <h2 id='fao-route-heading'>
              {hasSavedMission ? 'Your next move.' : 'The next destination is yours.'}
            </h2>
            <p>
              {hasSavedMission
                ? (missionName || 'Your next trip') +
                  (missionDate ? ' · ' + dateLabel(missionDate, { weekday: 'short', month: 'short', day: 'numeric' }) : '') +
                  ' · Booking status not live'
                : 'Build an itinerary around the right field visits, airport and travel days.'}
            </p>
          </div>
          <div className='fao-airway' aria-label='Planned flight origin and destination'>
            <button className='fao-airway-node' onClick={() => homeAirport ? onSectionChange('travel') : ctx.openTrainers()}>
              <span>DEPARTURE</span>
              <strong>{originCode || 'HOME'}</strong>
              <small>{originCode ? 'Your starting airport' : 'Set home airport'}</small>
            </button>
            <div className='fao-airway-middle' aria-hidden='true'>
              <div className='fao-track'/>
              <div className='fao-plane'>
                <Plane size={22} />
              </div>
              <div className='fao-track fao-track-pink'/>
            </div>
            <button className='fao-airway-node fao-airway-destination' onClick={() => onSectionChange('travel')}>
              <span>DESTINATION</span>
              <strong>{destinationCode || 'TBD'}</strong>
              <small>{destinationCode ? 'Destination airport' : 'Explore destinations'}</small>
            </button>
          </div>
          <div className='fao-route-footer'>
            <button className='fao-route-primary' onClick={openMission}>
              {myFlight ? 'Review saved flight' : myTrip ? 'Open upcoming trip' : 'Build an itinerary'}
              <ArrowRight size={17}/>
            </button>
            <button className='fao-route-secondary' onClick={() => onSectionChange('travel')}>
              Compare airports <ChevronRight size={15}/>
            </button>
            <span className='fao-route-watermark'>FIELD / 01</span>
          </div>
          <div className='fao-route-glow' aria-hidden='true'/>
        </section>

        <section className='fao-weekboard' aria-labelledby='fao-week-heading'>
          <div className='fao-week-head'>
            <div>
              <span className='fao-section-kicker'>02 / FIELD WEEK</span>
              <h2 id='fao-week-heading'>Two trainers. One timeline.</h2>
              <p>{weekLabel} · Saved coaching visits</p>
            </div>
            <button type='button' className='fao-open-week' onClick={() => onSectionChange('week')} aria-label='Open full team week'>
              <ArrowRight size={18}/>
            </button>
          </div>
          <div className='fao-week-scroll' role='region' aria-label='Seven-day two-trainer schedule' tabIndex={0}>
            <div className='fao-week-table'>
              <div className='fao-week-legend'>TRAINER</div>
              {weekDates.map((date, index) => (
                <div key={date} className={'fao-day-header' + (date === currentDate ? ' today' : '')}>
                  <span>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][index]}</span>
                  <strong>{date.slice(-2)}</strong>
                </div>
              ))}
              {weeks.map(trainer => (
                <div className='fao-week-row' key={trainer.id}>
                  <div className={'fao-trainer-name ' + trainer.tint}>
                    <span className='fao-trainer-indicator'/>
                    <strong>{trainer.name}</strong>
                  </div>
                  {weekDates.map(date => {
                    const scheduled = visits.filter(visit =>
                      visit.date === date &&
                      visitTrainer(visit.managerId, visit.trainer) === trainer.name
                    );
                    const lead = scheduled[0] ? managerLookup.get(scheduled[0].managerId) : null;
                    return (
                      <button
                        type='button'
                        key={date}
                        className={'fao-week-cell ' + trainer.tint + (scheduled.length ? ' occupied' : '') + (date === currentDate ? ' today' : '')}
                        onClick={() => onSectionChange('week')}
                        aria-label={trainer.name + ', ' + dateLabel(date, { weekday: 'long', month: 'short', day: 'numeric' }) + ': ' + (scheduled.length ? scheduled.length + ' scheduled coaching visits' : 'No scheduled coaching visits')}
                        title={scheduled.length ? (lead?.name || 'Coaching visit') : 'View our week'}
                      >
                        {scheduled.length
                          ? <><span className='fao-booking-dot'/><strong>{scheduled.length > 1 ? scheduled.length : lead?.name?.split(' ')[0]?.slice(0, 4) || 'VISIT'}</strong></>
                          : <span className='fao-empty-day' aria-hidden='true'>·</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className='fao-week-foot'>
            <span className='fao-week-signal'><span className='fao-trainer-indicator aqua'/> {weeks[0]?.name || 'Trainer 1'} <span className='fao-trainer-indicator pink'/> {weeks[1]?.name || 'Trainer 2'}</span>
            <span>{hasWeekVisits ? 'Select a visit to open team week' : 'No visits scheduled this week'}</span>
          </div>
          <button className='fao-week-bottom' onClick={() => onSectionChange('coordinate')}>
            <span><Waypoints size={16}/> {unassigned.length
              ? unassigned.length + ' upcoming visit' + (unassigned.length === 1 ? '' : 's') + ' needs an assigned trainer'
              : 'Review your shared coverage and assignments'}</span>
            <ArrowRight size={16}/>
          </button>
        </section>
      </div>

      <FieldMissionBrief onDestination={onDestination} onCircuit={onCircuit}
        onCoordinate={()=>onSectionChange('coordinate')}
        onWeek={()=>onSectionChange('week')}/>

      <div className='fao-lower-grid'>
        <section className='fao-shortcuts' aria-labelledby='fao-tools-heading'>
          <div className='fao-lower-title'>
            <div><span>03 / THE TOOLBELT</span><h2 id='fao-tools-heading'>Everything in reach.</h2></div>
            <small>YOUR FASTEST PATH TO ACTION</small>
          </div>
          <div className='fao-toolrail'>
            <button type='button' onClick={() => onSectionChange('travel')}>
              <span className='fao-toolicon teal'><Route size={19}/></span>
              <span><strong>Plan a smarter trip</strong><small>Airports, routes, travel time</small></span>
              <ArrowRight size={17}/>
            </button>
            <button type='button' onClick={() => onSectionChange('radar')}>
              <span className='fao-toolicon pink'><Radar size={19}/></span>
              <span><strong>Investigate a flight</strong><small>FAA, weather and flight history</small></span>
              <ArrowRight size={17}/>
            </button>
            <button type='button' onClick={openFlight}>
              <span className='fao-toolicon violet'><TicketCheck size={19}/></span>
              <span><strong>My booked flights</strong><small>Import or review an itinerary</small></span>
              <ArrowRight size={17}/>
            </button>
          </div>
        </section>

        <section className='fao-readiness' aria-labelledby='fao-readiness-heading'>
          <div className='fao-lower-title'>
            <div><span>04 / PRE-FLIGHT</span><h2 id='fao-readiness-heading'>Your travel setup.</h2></div>
            <span className='fao-readiness-progress'>{completed} / {ready.length} READY</span>
          </div>
          <div className='fao-readiness-list'>
            {ready.map((item, index) => (
              <button type='button' key={item.title} onClick={item.action}>
                <span className={'fao-step-icon ' + (item.done ? 'complete' : 'pending')}>
                  {item.done ? <Check size={14}/> : String(index + 1).padStart(2, '0')}
                </span>
                <span className='fao-step-copy'><strong>{item.title}</strong><small>{item.detail}</small></span>
                <ChevronRight size={17}/>
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className='fao-foot'>
        <span><ShieldCheck size={15}/> Shared trip plans are from your workspace. Saved booked flights may exist only on this device.</span>
        <span><CircleAlert size={15}/> Confirm airline status and reservation details directly with the carrier.</span>
      </footer>
    </main>
  );
}
