import { Activity, ArrowRight, Clock3, CloudLightning, Map, Plane, Radar, Route, ShieldCheck } from 'lucide-react';
import type { DnaResponse, DnaStatus } from './FlightDnaPanel';
import type { OfficialHistoryLeg } from './OfficialFlightHistory';
import type { AirportProduct } from '../shared/travel/airportBrief';
import { describeEvidence } from '../shared/travel/evidence';

export const flightTools = ['dna', 'pressure', 'weather', 'connection', 'security', 'alternatives', 'map', 'aircraft'] as const;
export type FlightTool = typeof flightTools[number];
export function initialFlightTool(): FlightTool {
  const value = new URLSearchParams(window.location.search).get('intel');
  return flightTools.find(tool => tool === value) || 'dna';
}
type AirportCheck = {
  code: string; faaAvailable: boolean;
  faa?: { level: string; headline: string };
  aviation?: { available: boolean; observation: null | { reportTime: string | null; category: string } };
  nws?: { available: boolean; alerts: Array<{ event: string; severity: string }> };
  regional?: AirportProduct[];
};
type Tool = { id: FlightTool; title: string; icon: typeof Plane; value: string; detail: string; state: 'observed' | 'review' | 'unknown' | 'input' };
const pct = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value)
  ? value.toFixed(1).replace(/\.0$/, '') + '%' : 'Rate unavailable';

export default function FlightToolkit({ active, onSelect, route, current, history, historyStatus, officialHistory }: {
  active: FlightTool; onSelect: (tool: FlightTool) => void;
  route: { origin: string; destination: string; connection: string; connectionMinutes: string };
  current: { at: string; airports: AirportCheck[] } | null;
  history: DnaResponse | null; historyStatus: DnaStatus; officialHistory: OfficialHistoryLeg[] | null;
}) {
  const now = Date.now();
  const airports = current && now - Date.parse(current.at) >= -60000 && now - Date.parse(current.at) <= 15 * 60000 ? current.airports : [];
  const faa = airports.filter(airport => airport.faaAvailable && airport.faa?.level !== 'unknown');
  const restrictions = faa.filter(airport => ['critical', 'caution'].includes(airport.faa?.level || ''));
  const observations = airports.filter(airport => {
    const timestamp = Date.parse(airport.aviation?.observation?.reportTime || '');
    return airport.aviation?.available && Number.isFinite(timestamp) && now - timestamp >= -60000 && now - timestamp <= 90 * 60000;
  });
  const weatherWarnings = airports.flatMap(airport => [
    ...(airport.nws?.available ? airport.nws.alerts.filter(alert => ['Severe', 'Extreme'].includes(alert.severity)).map(alert => airport.code + ' ' + alert.event) : []),
    ...(airport.regional || []).flatMap(product => product.evidence.provider === 'ECCC Weather Alerts' && describeEvidence(product.evidence, now).state === 'current'
      ? (product.data || []).filter(signal => (!signal.validFrom || Date.parse(signal.validFrom) <= now) && (!signal.validTo || Date.parse(signal.validTo) > now)).map(signal => airport.code + ' ' + signal.title) : []),
  ]);
  const official = officialHistory?.filter(leg => (leg.result?.summary?.sampleSize || 0) > 0) || [];
  const direct = !route.connection && official.length === 1 ? official[0].result?.summary : null;
  const leg = history?.available && !route.connection ? history.legs[0]?.match : null;
  const historyValue = direct ? pct(direct.onTimeRate === null ? null : direct.onTimeRate * 100) + ' observed on-time · BTS'
    : official.length ? official.length + ' legs with official history'
    : leg ? leg.basis === 'airport' ? pct(leg.onTimePct) + ' airport-wide baseline' : pct(leg.onTimePct) + ' arrived under 15 min late'
    : historyStatus === 'loading' ? 'Reading history…'
    : historyStatus === 'error' ? 'Independent feed unavailable'
    : historyStatus === 'unavailable' ? 'No aggregate coverage'
    : history?.available ? route.connection ? 'Review each leg' : 'No matched sample'
    : 'Flight & route history';
  const historyDetail = direct ? direct.sampleSize.toLocaleString() + ' official records · published history'
    : leg ? leg.flights.toLocaleString() + ' past flights · ' + (leg.basis === 'airport' ? 'airport baseline, not this route' : leg.basis + ' sample')
    : 'Official BTS + independent aggregates';
  const weatherReview = weatherWarnings.length > 0 || observations.some(airport => ['IFR', 'LIFR', 'MVFR'].includes(airport.aviation?.observation?.category || ''));
  const layover = Number(route.connectionMinutes);
  const hasLayover = !!route.connection && layover > 0;
  const tools: Tool[] = [
    { id: 'dna', title: 'Flight DNA', icon: Activity, value: historyValue, detail: historyDetail, state: official.length || leg ? 'observed' : 'unknown' },
    { id: 'pressure', title: 'Airport pressure', icon: Radar,
      value: restrictions.length ? restrictions.map(airport => airport.code + ' restriction').join(' · ') : current ? airports.length ? faa.length + ' of ' + airports.length + ' FAA statuses known' : 'Check expired · refresh' : 'Airport events & capacity',
      detail: 'FAA airport-wide notices', state: restrictions.length ? 'review' : faa.length && faa.length === airports.length ? 'observed' : 'unknown' },
    { id: 'weather', title: 'Weather risk', icon: CloudLightning,
      value: weatherWarnings[0] || (observations.length ? observations.map(airport => airport.code + ' ' + (airport.aviation?.observation?.category || 'observed')).join(' · ') : current ? 'Station coverage unverified' : 'Observations & forecasts'),
      detail: 'NOAA · NWS · ECCC', state: weatherReview ? 'review' : observations.length ? 'observed' : 'unknown' },
    { id: 'connection', title: 'Connection survival', icon: Clock3, value: hasLayover ? layover + ' min at ' + route.connection : 'Test your layover margin', detail: 'Your timing + transfer assumptions', state: hasLayover ? 'input' : 'unknown' },
    { id: 'security', title: 'Security & airport', icon: ShieldCheck, value: 'Checkpoint history & memory', detail: 'Published history + your experience', state: 'input' },
    { id: 'alternatives', title: 'Alternatives', icon: Route,
      value: history?.available ? history.alternatePaths.length + ' historical connection corridors' : 'Research backup routes',
      detail: 'Schedules & seats require verification', state: history?.available && history.alternatePaths.length ? 'observed' : 'unknown' },
  ];
  return <nav className="fi-toolkit" aria-label="Flight intelligence tools" id="flight-intelligence-tools">
    <div className="fi-toolkit-heading"><div><span className="fi-eyebrow">YOUR INTELLIGENCE TOOLKIT</span>
      <h2>Choose what you need to know.</h2></div>
      <span className="fi-toolkit-help">Every tool opens its own evidence.</span>
    </div>
    <div className="fi-tool-grid">{tools.map(tool => {
      const Icon = tool.icon;
      return <button type="button" key={tool.id} className={'fi-tool fi-tool-' + tool.id}
        aria-label={tool.title} aria-pressed={active === tool.id} aria-controls="flight-intelligence-results"
        onClick={() => onSelect(tool.id)}>
        <span className="fi-tool-title"><Icon size={19}/><strong>{tool.title}</strong><ArrowRight size={15}/></span>
        <span className={'fi-tool-value fi-state-' + tool.state}>{tool.value}</span>
        <small>{tool.detail}</small>
      </button>;
    })}</div>
    <div className="fi-context-tools"><span>Explore the area</span>
      <button type="button" aria-pressed={active === 'map'} aria-controls="flight-intelligence-results" onClick={() => onSelect('map')}><Map size={16}/> Route & airport map</button>
      <button type="button" aria-pressed={active === 'aircraft'} aria-controls="flight-intelligence-results" onClick={() => onSelect('aircraft')}><Plane size={16}/> Aircraft nearby</button>
    </div>
  </nav>;
}
