import type { FlightInput } from '../shared/travel/types';
import { itineraryValid, type BookedFlight } from './BookedFlightLogic';

type Context = { trainerIds: string[]; startDate: string; endDate: string };
export function reviewedBookings(bookings: BookedFlight[], context: Context) {
  return bookings.filter(booking => booking.verified && context.trainerIds.includes(booking.trainerId)
    && itineraryValid(booking.legs) && booking.legs.some(leg => leg.departDate <= context.endDate)
    && booking.legs.some(leg => (leg.arriveDate || leg.departDate) >= context.startDate));
}
export function selectedBookingFlights(bookings: BookedFlight[], selection: Record<string,string>, context: Context): FlightInput[] {
  const eligible = reviewedBookings(bookings, context);
  const chosen = context.trainerIds.flatMap(trainerId => {
    const id=selection[trainerId];
    if(!id)return [];
    const booking=eligible.find(item=>item.id===id && item.trainerId===trainerId);
    if(!booking)throw Error('A selected booking changed or is no longer reviewed. Review and select the current itinerary again.');
    return [booking];
  });
  if(!chosen.length)throw Error('Select one reviewed booking for at least one trainer. No itinerary was attached.');
  return chosen.flatMap(booking=>booking.legs.map(leg=>{
    if(!leg.departTime || !leg.arriveDate || !leg.arriveTime)
      throw Error('Review every departure time, arrival date and arrival time in the selected booking before attaching it.');
    return {trainerId:booking.trainerId,carrier:leg.carrier,flightNumber:leg.flightNumber,
      origin:leg.origin,destination:leg.destination,departDate:leg.departDate,departTime:leg.departTime,
      arriveDate:leg.arriveDate,arriveTime:leg.arriveTime,departureZone:leg.departureZone,arrivalZone:leg.arrivalZone,
      connection:leg.connection ? {...leg.connection} : undefined,review:booking.review ? {...booking.review} : undefined,
      ...(booking.updatedAt && Number.isFinite(Date.parse(booking.updatedAt)) ? {providedAt:booking.updatedAt} : {})};
  }));
}

// Reuse saved planning fields without treating them as a reviewed reservation.
export function bookingForSavedFlights(trainerId:'trainer_a'|'trainer_b',flights:FlightInput[],bookings:BookedFlight[]):BookedFlight {
  const own=flights.filter(flight=>flight.trainerId===trainerId);
  if(!own.length)throw Error('No flight fields are saved for this trainer. Import an itinerary first.');
  const shape=(leg:FlightInput|BookedFlight['legs'][number])=>[leg.carrier,leg.flightNumber,leg.origin,leg.destination,leg.departDate,leg.departTime,leg.arriveDate,leg.arriveTime,leg.departureZone||'',leg.arrivalZone||'',leg.connection||null];
  const fingerprint=JSON.stringify(own.map(shape));
  const found=bookings.find(booking=>booking.trainerId===trainerId&&JSON.stringify(booking.legs.map(shape))===fingerprint);
  if(found)return found;
  if(bookings.length>=30)throw Error('This device already holds 30 itineraries. Review and remove an old local copy before creating another; existing records were preserved.');
  const legs=own.map(flight=>({id:crypto.randomUUID(),carrier:flight.carrier,flightNumber:flight.flightNumber,origin:flight.origin,destination:flight.destination,
    departDate:flight.departDate,departTime:flight.departTime,arriveDate:flight.arriveDate,arriveTime:flight.arriveTime,departureZone:flight.departureZone,arrivalZone:flight.arrivalZone,connection:flight.connection?{...flight.connection}:undefined}));
  if(!itineraryValid(legs))throw Error('Review the saved leg order, dates and time zones before opening this itinerary.');
  const now=new Date().toISOString();
  return {id:crypto.randomUUID(),trainerId,legs,verified:false,review:undefined,source:'manual',createdAt:now,updatedAt:now,revision:1,changes:[]};
}
