import { Temporal } from '@js-temporal/polyfill';

export function interpretDeadline(question: string, startDate: string, endDate: string, explicitDate?: string, explicitTime?: string) {
  const words = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const lower = question.toLowerCase();
  const dates = [...new Set(question.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])];
  const weekdays = words.filter(word => new RegExp('\\b' + word + '\\b').test(lower));
  const supported = /\b(home|finish|complete|visits|schedule|return)\b/.test(lower);
  if (!supported) return { clarification: 'Ask about completing the selected plan and returning home by a weekday or date.' };
  let date = explicitDate || dates[0];
  if (!explicitDate && (dates.length > 1 || weekdays.length > 1)) return { clarification: 'Choose one return-home deadline date for this calculation.' };
  if (!date && weekdays.length === 1) {
    const first = Temporal.PlainDate.from(startDate), last = Temporal.PlainDate.from(endDate);
    let candidate = first;
    while (candidate.dayOfWeek !== words.indexOf(weekdays[0]) + 1) candidate = candidate.add({ days: 1 });
    if (Temporal.PlainDate.compare(candidate.add({ days: 7 }), last) <= 0) return { clarification: 'This field period contains more than one ' + weekdays[0] + '. Choose an exact deadline date.' };
    date = candidate.toString();
  }
  if (!date) return { clarification: 'Choose a return-home weekday or an exact date, such as “get home Thursday” or “get home by 2026-12-10”.' };
  Temporal.PlainDate.from(date);
  const military = lower.match(/\b(?:by|before|at)\s+([01]\d|2[0-3]):([0-5]\d)\b/);
  const meridiem = lower.match(/\b(?:by|before|at)\s+(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  const parsedTime = military ? military[1] + ':' + military[2] : meridiem ? String(Number(meridiem[1]) % 12 + (meridiem[3] === 'pm' ? 12 : 0)).padStart(2, '0') + ':' + (meridiem[2] || '00') : undefined;
  return { date, time: explicitTime || parsedTime || '23:59', assumedEndOfDay: !explicitTime && !parsedTime,
    assumptions: [!explicitDate && weekdays.length ? `“${weekdays[0]}” means ${date} in the selected field period.` : 'The supplied deadline date is used.', 'Deadlines apply in each trainer’s home-airport time zone.'] };
}
