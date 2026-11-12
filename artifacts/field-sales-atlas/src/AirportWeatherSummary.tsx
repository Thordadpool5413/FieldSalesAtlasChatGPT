import { Eye, Thermometer, Wind } from 'lucide-react';
import type { flightAirportData } from './FlightAirportData';
type Aviation = ReturnType<typeof flightAirportData>['aviation'];
const categories: Record<string, string> = {
  VFR: 'Visual flight rules', MVFR: 'Marginal visual flight rules',
  IFR: 'Instrument flight rules', LIFR: 'Low instrument flight rules',
};
const time = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Time not reported';
export default function AirportWeatherSummary({ aviation, issue }: { aviation?: Aviation; issue: string }) {
  const observed = aviation?.observation;
  return <div className="fr-weather-summary">
    {observed ? <>
      <div className="fr-weather-condition"><strong>{observed.category}</strong><span>{categories[observed.category] || 'Published station category'}</span></div>
      <p className="fr-observation-time">Observed {time(observed.reportTime)} · Aviation category describes visibility and cloud ceiling; it does not predict your flight.</p>
      <dl className="fr-weather-metrics">
        <div><dt><Thermometer size={16}/>Temperature</dt><dd>{observed.temperatureC === null ? 'Not reported' : <>{observed.temperatureC}°C <small>{Math.round(observed.temperatureC * 9 / 5 + 32)}°F</small></>}</dd></div>
        <div><dt><Eye size={16}/>Visibility</dt><dd>{observed.visibility === null ? 'Not reported' : <>{observed.visibility} <small>statute mi</small></>}</dd></div>
        <div><dt><Wind size={16}/>Wind</dt><dd>{observed.windKnots === null ? 'Not reported' : <>{observed.windKnots} <small>kt</small></>}</dd><small>{[observed.windDirection, observed.windGustKnots == null ? '' : 'Gusts ' + observed.windGustKnots + ' kt'].filter(Boolean).join(' · ')}</small></div>
      </dl>
      <details className="fr-forecast"><summary>Read station report</summary><p className="fr-raw-weather">{observed.raw}</p></details>
    </> : <p className="fr-weather-unavailable">{issue || 'Current station observation unavailable.'}</p>}
    {aviation?.forecast && <div className="fr-taf-coverage"><strong>Terminal aviation forecast</strong><p>Valid {time(aviation.forecast.validFrom)} – {time(aviation.forecast.validTo)}.</p><details className="fr-forecast"><summary>Read terminal forecast</summary><p className="fr-raw-weather">{aviation.forecast.raw}</p></details></div>}
    {!aviation?.forecast && <p className="fr-observation-time">No current terminal aviation forecast verified. Future airport conditions remain unknown.</p>}
  </div>;
}
