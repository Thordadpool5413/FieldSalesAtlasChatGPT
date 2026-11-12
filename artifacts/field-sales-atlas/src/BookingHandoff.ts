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
