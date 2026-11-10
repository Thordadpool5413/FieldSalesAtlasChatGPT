// Point-forecast cues describe weather, never airline outcomes. Wind is in mph
// in the NWS product; do not apply these thresholds to Canadian km/h text.
export function weatherSignals(detail: string, wind: string, precip: number | null) {
  const desc = detail.toLowerCase(), cues: string[] = [];
  if (/thunderstorm|tornado/.test(desc)) cues.push('Thunderstorm conditions');
  if (/snow|ice|sleet|freezing rain|blizzard/.test(desc)) cues.push('Winter conditions');
  if (/fog/.test(desc)) cues.push('Reduced visibility possible');
  const speeds = (wind.match(/\d+/g) || []).map(Number);
  if (speeds.length && Math.max(...speeds) >= 25) cues.push('Wind at least 25 mph');
  if (precip !== null && precip >= 70) cues.push('High precipitation chance');
  return cues.slice(0, 4);
}
