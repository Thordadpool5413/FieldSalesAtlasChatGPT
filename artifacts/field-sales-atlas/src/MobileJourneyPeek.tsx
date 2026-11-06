import { ArrowRight,CalendarDays,Plane,TicketCheck } from 'lucide-react';
import { readBookedFlights } from './BookedFlightLogic';
import { useOp } from './Operations';
import { dateLabel,today } from './opsModels';

/**
 * A contextual action, not a dashboard.
 * A booked itinerary is device-local; shared trip dates are workspace records.
 * Never imply airline reservation lookup or current flight status.
 */
export default function MobileJourneyPeek({
  onBooked, onTrip
}:{
  onBooked:()=>void;
  onTrip:()=>void;
}) {
  const ctx=useOp();
  const todayLocal=today();
  const nextBooking=readBookedFlights()
    .filter(record=>record.trainerId===ctx.activeTrainerId&&
      record.legs[0]?.departDate>=todayLocal)
    .sort((a,b)=>a.legs[0].departDate.localeCompare(b.legs[0].departDate))[0];
  const nextTrip=(ctx.board.trips||[])
    .filter(trip=>trip.status==='Planned'&&
      trip.trainer===ctx.activeTrainer.name&&trip.endDate>=todayLocal)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate))[0];

  if(nextBooking) {
    const first=nextBooking.legs[0];
    const last=nextBooking.legs[nextBooking.legs.length-1];
    return <section className="atlas-next-flight" aria-label="Next saved booked flight">
      <div className="atlas-next-flight-icon"><Plane size={18}/></div>
      <div className="atlas-next-flight-copy">
        <span>NEXT SAVED FLIGHT · ON THIS DEVICE</span>
        <strong>{first.origin} <ArrowRight size={13}/> {last.destination}</strong>
        <small>{dateLabel(first.departDate,{weekday:'short',month:'short',day:'numeric'})} · {nextBooking.legs.length} leg{nextBooking.legs.length===1?'':'s'} · Airline status unverified</small>
      </div>
      <button type="button" className="atlas-next-flight-action" onClick={()=>{
        try{sessionStorage.setItem('atlas-guardian-open-flight-v1',nextBooking.id);}catch{}
        onBooked();
      }}
        aria-label="Open this saved booked flight">Open <ArrowRight size={14}/></button>
    </section>;
  }
  if(nextTrip) {
    return <section className="atlas-next-flight" aria-label="Next shared field trip">
      <div className="atlas-next-flight-icon"><CalendarDays size={18}/></div>
      <div className="atlas-next-flight-copy">
        <span>NEXT PLANNED FIELD TRIP · SHARED</span>
        <strong>{nextTrip.arrivalAirport||nextTrip.title}</strong>
        <small>{dateLabel(nextTrip.startDate,{weekday:'short',month:'short',day:'numeric'})} · Flight booking not verified</small>
      </div>
      <button type="button" className="atlas-next-flight-action" onClick={onTrip}
        aria-label="Open saved itinerary">Open <ArrowRight size={14}/></button>
    </section>;
  }
  return <section className="atlas-next-flight atlas-next-flight-empty" aria-label="Upcoming travel">
    <div className="atlas-next-flight-icon"><TicketCheck size={18}/></div>
    <div className="atlas-next-flight-copy">
      <strong>No trip saved yet</strong>
      <small>Choose a flight or travel action below to get started.</small>
    </div>
  </section>;
}
