import { Temporal } from '@js-temporal/polyfill';

export function validZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return !!zone && (zone.includes('/') || zone === 'UTC'); } catch { return false; }
}
export function zonedInstant(date: string, time: string, zone: string, disambiguation: 'reject' | 'earlier' | 'later' = 'reject'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !validZone(zone)) throw new Error('A valid local date, time and IANA time zone are required.');
  try {
    return Temporal.PlainDateTime.from(date + 'T' + time).toZonedDateTime(zone, { disambiguation }).toInstant().toString();
  } catch { throw new Error('This local time is invalid or ambiguous because of a clock change. Choose an explicit earlier/later occurrence or another time.'); }
}
export function inZone(instant: string, zone: string) {
  const value = Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
  return { date: value.toPlainDate().toString(), time: value.toPlainTime().toString({ smallestUnit: 'minute' }), offset: value.offset, timeZone: zone };
}
export function elapsedMinutes(start: string, end: string): number {
  return Number(Temporal.Instant.from(end).epochMilliseconds - Temporal.Instant.from(start).epochMilliseconds) / 60000;
}
export function addMinutes(instant: string, minutes: number): string {
  if (!Number.isFinite(minutes)) throw new Error('A finite duration is required.');
  return Temporal.Instant.from(instant).add({ minutes: Math.ceil(minutes) }).toString();
}
export function dateRange(start: string, end: string, includeWeekends = false): string[] {
  const first = Temporal.PlainDate.from(start), last = Temporal.PlainDate.from(end);
  if (Temporal.PlainDate.compare(last, first) < 0 || first.until(last).days > 31) throw new Error('Choose a date range of at most 31 days.');
  const result: string[] = [];
  for (let day = first; Temporal.PlainDate.compare(day, last) <= 0; day = day.add({ days: 1 })) if (includeWeekends || day.dayOfWeek <= 5) result.push(day.toString());
  return result;
}
