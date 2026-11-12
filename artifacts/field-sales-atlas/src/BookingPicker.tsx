import type { BookedFlight } from './BookedFlightLogic';

export default function BookingPicker({bookings,trainers,selection,onChange,onManage,disabled=false}:{
  bookings:BookedFlight[];trainers:Array<{id:string;name:string}>;selection:Record<string,string>;
  onChange:(value:Record<string,string>)=>void;onManage:()=>void;disabled?:boolean;
}) {
  return <section className="journey-booking-picker" aria-label="Reviewed bookings for this plan">
    <p>Choose one reviewed itinerary per trainer. All its legs, time zones, review dates and connection requirements stay together. Confirmation codes and booking documents are excluded.</p>
    <div className="journey-fields">{trainers.map(trainer=>{
      const own=bookings.filter(booking=>booking.trainerId===trainer.id);
      return <label key={trainer.id}>{trainer.name} booking<select value={selection[trainer.id] || ''} disabled={disabled || !own.length}
        onChange={event=>onChange({...selection,[trainer.id]:event.target.value})}>
        <option value="">{own.length ? 'No booking attached' : 'No reviewed booking on this device'}</option>
        {own.map(booking=><option key={booking.id} value={booking.id}>{booking.legs.map(leg=>leg.origin).concat(booking.legs.at(-1)?.destination || '').join(' → ')} · {booking.legs[0]?.departDate}</option>)}
      </select></label>;
    })}</div>
    <button type="button" className="op-btn" disabled={disabled} onClick={onManage}>Review booked flights</button>
  </section>;
}
