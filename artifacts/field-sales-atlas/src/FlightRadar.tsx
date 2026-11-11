import {
Activity,ArrowRight,CalendarDays,
ChevronDown,Clock3,CloudLightning,
Compass,ExternalLink,FileText,Info,
PlaneLanding,PlaneTakeoff,
Radar,RefreshCw,Route,ShieldAlert,
TicketCheck,
Wind
} from 'lucide-react';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import TravelEvidence from './TravelEvidence';
import { flightAirportData } from './FlightAirportData';
import RegionalAirportWeather from './RegionalAirportWeather';
import type { OfficialHistoryLeg } from './OfficialFlightHistory';
import type { AirportBrief, AirportProduct } from '../shared/travel/airportBrief';
import type { Evidence } from '../shared/travel/types';
import { describeEvidence } from '../shared/travel/evidence';
import FlightDecisionBrief from './FlightDecisionBrief';
import type { DnaResponse,DnaStatus } from './FlightDnaPanel';
import FlightDnaPanel from './FlightDnaPanel';
import './FlightRadar.css';
import './FlightRadarForecast.css';
import FlightToolkit, { initialFlightTool, type FlightTool } from './FlightToolkit';
import { INTELLIGENCE_NAVIGATION_EVENT } from './intelligenceTools';
import FlightNetworkMap from './FlightNetworkMap';
import './FlightIntelligence.css';
import ObservedAircraftPanel from './ObservedAircraftPanel';
import { useOp } from './Operations';
import type { Airport } from './opsModels';
import { today } from './opsModels';
import SecurityHistory from './SecurityHistory';
import type { TravelPlan } from './TravelLogic';
import { api } from './workspaceApi';

type RouteEntry = {
  origin: string;
  connection: string;
  destination: string;
  alternate: string;
  connectionMinutes: string;
};
type FaaAirport = {
  evidence?: Evidence;
  code: string;
  level: 'critical' | 'caution' | 'none' | 'unknown';
  headline: string;
  events: Array<{ kind: string; reason: string; avgMinutes: number | null; updatedAt: string }>;
  config?: {arrivalRate:number|null;arrivalRunways:string;departureRunways:string;updatedAt:string}|null;
};
type FaaResult = {
  available: boolean;
  checkedAt: string;
  airports: FaaAirport[];
  message?: string;
};
type AviationResult = {
  evidence?: Evidence[];
  icao: string;
  available: boolean;
  checkedAt: string;
  source: string;
  message: string;
  observation: null | {
    reportTime: string | null;
    category: string;
    raw: string;
    windKnots: number | null;
    visibility: string | null;
    temperatureC: number | null;
  };
  forecast: null | { raw: string; validFrom: string | null; validTo: string | null };
};
type NwsAlert = {
  id: string; event: string; severity: string; urgency: string; headline: string;
  area: string; effective: string; expires: string;
};
type NwsResult = {
  evidence?: Evidence;
  available: boolean; checkedAt: string; source: string; sourceUrl: string;
  alerts: NwsAlert[]; message: string;
};
type ForecastResult = {
  evidence?: Evidence;
  available:boolean;checkedAt:string;message:string;source:string;
  periods:Array<{
    number:number;name:string;startTime:string;temperature:number|null;
    temperatureUnit:string;shortForecast:string;windSpeed:string;signals:string[];
  }>;
};
type AirportResult = {
  code: string; airport?: Airport;
  airportName?: string; referenceKnown?: boolean;
  regional?: AirportProduct[];
  faa?: FaaAirport; faaAvailable: boolean; faaCheckedAt: string;
  aviation?: AviationResult; aviationIssue: string;
  nws?: NwsResult; nwsIssue: string;
  outlook?: ForecastResult;outlookIssue:string;
};
type Analysis = { at: string; airports: AirportResult[] };
type Level = 'critical' | 'caution' | 'none' | 'unknown';
const defaultRoute: RouteEntry = {
  origin: '', connection: '', destination: '', alternate: '', connectionMinutes: ''
};
const airportCode = (code: string) => /^[A-Z]{3}$/.test(code);
const isoAirport = (value: string) => value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
function initiallySaved(): RouteEntry {
  try {
    const raw = window.localStorage.getItem('atlas-free-flight-radar-v1');
    if (!raw) return { ...defaultRoute };
    const parsed = JSON.parse(raw) as Partial<RouteEntry>;
    const origin=isoAirport(String(parsed.origin||''));
    const destination=isoAirport(String(parsed.destination||''));
    const candidate=isoAirport(String(parsed.connection||''));
    const connection=candidate===origin||candidate===destination?'':candidate;
    const candidateAlternate=isoAirport(String(parsed.alternate||''));
    const alternate=[origin,destination,connection].includes(candidateAlternate)?'':candidateAlternate;
    const minutes=String(parsed.connectionMinutes||'').replace(/[^\d]/g,'').slice(0,3);
    return {origin,connection,destination,alternate,
      connectionMinutes:connection&&Number(minutes)>=1&&Number(minutes)<=600?minutes:''};
  } catch {
    return { ...defaultRoute };
  }
}
function timeLabel(value: string | null | undefined) {
  if (!value) return 'Time not provided';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Timestamp unavailable'
    : parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.floor((Date.now() - at) / 60000) : null;
}
function grade(report: AirportResult): { level: Level; findings: string[]; unknowns: string[] } {
  const findings: string[] = [];
  const unknowns: string[] = [];
  let impact = 0;
  let evidence = 0;
  if (!report.airport && !report.referenceKnown) unknowns.push('Airport missing from the current directory');
  if (report.faaAvailable && (!report.faa?.evidence || describeEvidence(report.faa.evidence).state === 'current')) {
    if (report.faa?.level === 'critical') {
      impact = Math.max(impact, 2);
      findings.push('FAA lists a significant airport-wide traffic-management event');
    } else if (report.faa?.level === 'caution') {
      impact = Math.max(impact, 1);
      findings.push('FAA lists an arrival or departure delay event');
    } else if (report.faa?.level === 'none') {
      evidence += 1;
    } else {
      unknowns.push('No FAA entry found for this airport');
    }
    if (report.faa?.level === 'critical' || report.faa?.level === 'caution') evidence += 1;
  } else {
    unknowns.push('FAA live events unavailable');
  }
  const obs = report.aviation?.observation;
  if (report.aviation?.available && obs && (!report.aviation.evidence?.[0] || describeEvidence(report.aviation.evidence[0]).state === 'current')) {
    const age = ageMinutes(obs.reportTime);
    if (age === null || age > 90 || age < -5) {
      unknowns.push('Aviation observation time is missing or stale');
    } else {
      evidence += 1;
      const category = obs.category.toUpperCase();
      if (category === 'LIFR') {
        findings.push('NOAA reports low instrument flight-rule conditions (LIFR)');
        impact = Math.max(impact, 2);
      } else if (category === 'IFR') {
        findings.push('NOAA reports instrument flight-rule conditions (IFR)');
        impact = Math.max(impact, 1);
      } else if (category === 'MVFR') {
        findings.push('NOAA reports marginal visual flight-rule conditions (MVFR)');
        impact = Math.max(impact, 1);
      }
      if (obs.windKnots !== null && obs.windKnots >= 30) {
        findings.push('Observed sustained wind is at least 30 knots; review airline/airport operations');
        impact = Math.max(impact, 1);
      }
    }
  } else {
    unknowns.push(report.aviationIssue || 'Current NOAA station observation unavailable');
  }
  if (report.nws?.available && (!report.nws.evidence || describeEvidence(report.nws.evidence).state === 'current')) {
    evidence += 1;
    for (const alert of report.nws.alerts.slice(0, 3)) {
      const severe = alert.severity === 'Severe' || alert.severity === 'Extreme';
      impact = Math.max(impact, severe ? 2 : 1);
      findings.push('NWS ' + alert.event + ' (' + alert.severity.toLowerCase() + ' alert)');
    }
  } else if (!report.regional?.length) {
    unknowns.push(report.nwsIssue || 'Local weather alert coverage unavailable');
  }
  for (const product of report.regional || []) {
    if (describeEvidence(product.evidence).state !== 'current') {
      unknowns.push(product.evidence.provider + ': ' + product.evidence.limitation);
    } else if (product.evidence.provider === 'ECCC Weather Alerts') {
      evidence += 1;
      for (const signal of product.data || []) {
        if (signal.validFrom && Date.parse(signal.validFrom) > Date.now()) continue;
        if (signal.validTo && Date.parse(signal.validTo) <= Date.now()) continue;
        impact = Math.max(impact, 1);
        findings.push('ECCC regional warning: ' + signal.title + '. Airport-specific impact is unverified.');
      }
    }
  }
  return {
    level: impact === 2 ? 'critical' : impact === 1 ? 'caution' : evidence ? 'none' : 'unknown',
    findings, unknowns
  };
}
const rank = (level: Level) =>
  level === 'critical' ? 3 : level === 'caution' ? 2 : level === 'unknown' ? 1 : 0;
function roleName(route: RouteEntry, code: string) {
  const parts = [
    route.origin === code ? 'Departure' : '',
    route.connection === code ? 'Connection' : '',
    route.destination === code ? 'Arrival' : '',
    route.alternate === code ? 'Alternative' : ''
  ].filter(Boolean);
  return parts.join(' · ');
}

type GuardianHandoff={origin:string;destination:string;travelDate:string;carrier:string;flightNumber:string};
function readGuardianHandoff():GuardianHandoff|null{
  try{
    const raw=sessionStorage.getItem('atlas-guardian-research-v1');
    if(!raw)return null;
    const data=JSON.parse(raw) as Partial<GuardianHandoff>;
    if(!/^[A-Z]{3}$/.test(data.origin||'')||!/^[A-Z]{3}$/.test(data.destination||'')||
      !/^20\d{2}-\d{2}-\d{2}$/.test(data.travelDate||''))return null;
    return {origin:data.origin!,destination:data.destination!,travelDate:data.travelDate!,
      carrier:String(data.carrier||'').slice(0,2),flightNumber:String(data.flightNumber||'').slice(0,4)};
  }catch{return null;}
}
export default function FlightRadar({onToolChange}:{onToolChange?:(tab:'radar'|'travel'|'trips'|'week'|'coordinate'|'booked')=>void}) {
  const ctx = useOp();
  const [guardian]=useState<GuardianHandoff|null>(readGuardianHandoff);
  const [route, setRoute] = useState<RouteEntry>(()=>guardian?
    {...defaultRoute,origin:guardian.origin,destination:guardian.destination}:initiallySaved());
  const [travelDate,setTravelDate]=useState(()=>guardian?.travelDate||today());
  const [showAdvanced,setShowAdvanced]=useState(()=>{const saved=initiallySaved();return !!(saved.connection||saved.alternate||saved.connectionMinutes);});
  const [activeTool, setActiveTool] = useState<FlightTool>(initialFlightTool);
  const [aircraftOpened, setAircraftOpened] = useState(() => initialFlightTool() === 'aircraft');
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const restoreTool = () => {
      const tool = initialFlightTool();
      setActiveTool(tool);
      if (tool === 'aircraft') setAircraftOpened(true);
    };
    window.addEventListener('popstate', restoreTool);
    window.addEventListener(INTELLIGENCE_NAVIGATION_EVENT, restoreTool);
    return () => {
      window.removeEventListener('popstate', restoreTool);
      window.removeEventListener(INTELLIGENCE_NAVIGATION_EVENT, restoreTool);
    };
  }, []);
  function selectTool(tool: FlightTool) {
    setActiveTool(tool);
    if (tool === 'aircraft') setAircraftOpened(true);
    if (tool !== activeTool) {
      const address = new URL(window.location.href);
      address.searchParams.set('intel', tool);
      window.history.pushState(window.history.state, '', address.pathname + address.search + address.hash);
    }
    requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }
  function editConnection() {
    setShowAdvanced(true);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Connecting IATA airport code"]')?.focus());
  }
  const [savedPlans, setSavedPlans] = useState<TravelPlan[]>([]);
  const [chosenPlan, setChosenPlan] = useState('');
  const [savedError, setSavedError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [, refreshAge] = useState(0);
  useEffect(() => { const timer = setInterval(() => refreshAge(value => value + 1), 60000); return () => clearInterval(timer); }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [routeAttempted, setRouteAttempted] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [historical, setHistorical] = useState<DnaResponse|null>(null);
  const [officialHistory, setOfficialHistory] = useState<OfficialHistoryLeg[] | null>(null);
  const onOfficialAnalysis = useCallback((legs: OfficialHistoryLeg[] | null) => setOfficialHistory(legs), []);
  const [historyStatus,setHistoryStatus]=useState<DnaStatus>('idle');
  const [faaDeltas, setFaaDeltas] = useState<Record<string, string[]>>({});
  const [researchRun,setResearchRun] = useState(0);
  const [offlineNotice,setOfflineNotice] = useState('');
  const requestId = useRef(0);
  const guardianStarted=useRef(false);
  const originInputRef=useRef<HTMLInputElement>(null);
  const destinationInputRef=useRef<HTMLInputElement>(null);
  const onHistoricalAnalysis=useCallback((data:DnaResponse|null,status:DnaStatus)=>{
    setHistorical(data);
    setHistoryStatus(status);
  },[]);
  const airportIndex = useMemo(() => new Map(ctx.airports.map(a => [a.iata, a])), [ctx.airports]);
  const codes = useMemo(() => [...new Set([
    route.origin, route.connection, route.destination, route.alternate
  ].filter(airportCode))], [route]);
  const valid = airportCode(route.origin) && airportCode(route.destination) &&
    route.origin !== route.destination &&
    (!route.connection || (airportCode(route.connection) &&
      route.connection !== route.origin && route.connection !== route.destination)) &&
    (!route.alternate || (airportCode(route.alternate) &&
      route.alternate !== route.destination && route.alternate !== route.origin &&
      route.alternate !== route.connection)) &&
    (route.connectionMinutes===''||(Number(route.connectionMinutes)>=1&&Number(route.connectionMinutes)<=600));
  const routeHint=!airportCode(route.origin)||!airportCode(route.destination)
    ?'Enter a three-letter departure and arrival airport code to run live checks.'
    :route.origin===route.destination?'Departure and arrival airports must differ.'
    :route.connection&&(!airportCode(route.connection)||[route.origin,route.destination].includes(route.connection))
      ?'The connecting airport must differ from departure and arrival.'
    :route.alternate&&(!airportCode(route.alternate)||[route.origin,route.destination,route.connection].includes(route.alternate))
      ?'The alternate airport must differ from every other airport.'
    :route.connectionMinutes!==''&&(Number(route.connectionMinutes)<1||Number(route.connectionMinutes)>600)
      ?'Layover duration must be 1 to 600 minutes.'
    :'Review the optional airport details before analyzing.';

  useEffect(() => {
    if (!route.origin && ctx.activeTrainer.homeAirports[0]) {
      setRoute(current => ({ ...current, origin: current.origin || ctx.activeTrainer.homeAirports[0] }));
    }
  }, [ctx.activeTrainer.homeAirports.join(',')]);
  useEffect(() => {
    try { window.localStorage.setItem('atlas-free-flight-radar-v1', JSON.stringify(route)); }
    catch { /* Local storage is optional. */ }
  }, [route]);
  useEffect(()=>{
    if(!guardian||ctx.identity!=='member'||guardianStarted.current)return;
    guardianStarted.current=true;
    try{sessionStorage.removeItem('atlas-guardian-research-v1');}catch{}
    void analyze();
  },[guardian,ctx.identity]);
  useEffect(() => {
    if (ctx.identity !== 'member') return;
    let alive = true;
    api.get('/api/travel/plans').then(response => {
      if (alive) setSavedPlans((response.data.plans || []) as TravelPlan[]);
    }).catch(() => { if (alive) setSavedError('Saved itineraries could not be loaded. Manual airport entry still works.'); });
    return () => { alive = false; };
  }, [ctx.identity, ctx.syncRevision]);

  function invalidateResearch() {
    setRouteAttempted(false);
    requestId.current += 1;
    setLoading(false);
    setAnalysis(null);
    setHistorical(null);
    setOfficialHistory(null);
    setHistoryStatus('idle');
    setFaaDeltas({});
    setError('');
    setCopyMessage('');
    setOfflineNotice('');
  }
  function setField(key: keyof RouteEntry, value: string) {
    invalidateResearch();
    setRouteAttempted(false);
    setRoute(previous => ({ ...previous, [key]: key === 'connectionMinutes'
      ? value.replace(/[^\d]/g, '').slice(0, 3) : isoAirport(value) }));
  }
  function swapRoute(){
    invalidateResearch();
    setRoute(previous=>({
      ...previous,origin:previous.destination,destination:previous.origin,
      connection:'',alternate:'',connectionMinutes:''
    }));
    setShowAdvanced(false);
  }
  function loadPlan(id: string) {
    setChosenPlan(id);
    const selected = savedPlans.find(plan => plan.id === id);
    if (!selected) return;
    invalidateResearch();
    setRoute(previous => ({
      ...previous,
      origin: isoAirport(selected.origins[0] || ''),
      destination: isoAirport(selected.selectedArrival || ''),
      connection: '',
      alternate: '',
      connectionMinutes: ''
    }));
  }
  async function analyze() {
    if (loading) return;
    if (!valid) {
      setRouteAttempted(true);
      const invalidOrigin = !airportCode(route.origin);
      const invalidDestination = !airportCode(route.destination) || route.origin === route.destination;
      (invalidOrigin ? originInputRef : invalidDestination ? destinationInputRef : null)?.current?.focus();
      return;
    }
    setRouteAttempted(false);
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    setAnalysis(null);
    setHistorical(null);
    setOfficialHistory(null);
    setHistoryStatus('loading');
    setCopyMessage('');
    // One tap runs live airport checks and distinct historical sample research.
    setResearchRun(run => run + 1);
    requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    const airports = codes.map(code => ({ code, airport: airportIndex.get(code) }));
    const faaPromise = api.get('/api/travel/disruptions?airports=' + encodeURIComponent(codes.join(',')))
      .then(res => res.data as FaaResult).catch(() => null);
    const detailPromise = Promise.all(airports.map(async item => {
      const brief = await api.get('/api/travel/airports/' + item.code + '/brief')
        .then(response => response.data as AirportBrief).catch(() => null);
      const data = brief ? flightAirportData(brief) : null;
      return {
        code: item.code,
        airport: item.airport,
        airportName: brief?.airport.name || item.airport?.name,
        referenceKnown: !!brief,
        aviation: data?.aviation,
        aviationIssue: data?.aviation.message || 'Current station observation unavailable; inspect source evidence.',
        nws: data?.nws,
        nwsIssue: data?.nws?.message || 'Current local alert coverage unverified.',
        outlook: data?.outlook,
        outlookIssue: data?.outlook?.message || 'A dated forecast is unavailable for this airport.',
        regional: data?.regional || [],
      };
    }));
    try {
      const [faa, details] = await Promise.all([faaPromise, detailPromise]);
      if (currentRequest !== requestId.current) return;
      const byCode = new Map(faa?.airports.map(item => [item.code, item]) || []);
      const differences: Record<string,string[]> = {};
      try {
        const old = JSON.parse(localStorage.getItem('atlas-faa-configuration-watch-v1') || '{}') as Record<string,{
          checkedAt:string;arrivalRate:number|null;arrivalRunways:string;departureRunways:string}>;
        const next = {...old};
        for (const airport of faa?.airports || []) {
          if (!airport.config) continue;
          const last = old[airport.code];
          const delta: string[] = [];
          if (last && last.checkedAt !== faa?.checkedAt) {
            if (last.arrivalRate !== null && airport.config.arrivalRate !== null &&
              last.arrivalRate !== airport.config.arrivalRate)
              delta.push('Published arrival rate changed from '+last.arrivalRate+' to '+airport.config.arrivalRate+'.');
            if (last.arrivalRunways && airport.config.arrivalRunways &&
              last.arrivalRunways !== airport.config.arrivalRunways)
              delta.push('Published arrival-runway configuration changed since previous check.');
            if (last.departureRunways && airport.config.departureRunways &&
              last.departureRunways !== airport.config.departureRunways)
              delta.push('Published departure-runway configuration changed since previous check.');
          }
          if (delta.length) differences[airport.code]=delta;
          next[airport.code]={...airport.config,checkedAt:faa?.checkedAt || ''};
        }
        localStorage.setItem('atlas-faa-configuration-watch-v1',JSON.stringify(next));
      } catch { /* Device storage may be unavailable. */ }
      setFaaDeltas(differences);
      setAnalysis({
        at: new Date().toISOString(),
        airports: details.map(item => ({
          ...item, faa: byCode.get(item.code),
          faaAvailable: faa?.available === true && !!byCode.get(item.code) && byCode.get(item.code)?.level !== 'unknown',
          faaCheckedAt: faa?.checkedAt || ''
        }))
      });
      if (!faa) {
        setError('The FAA check could not be reached. Airport status remains unknown; other official observations are shown separately.');
      } else if (!faa.available && faa.airports.length > 0) {
        setError('The FAA returned no current airport listing for ' + codes.join(', ') +
          '. Their FAA status remains unknown; other official observations are shown separately.');
      } else if (!faa.available) {
        setError(faa.message || 'The FAA source did not return current airport evidence. Airport status remains unknown.');
      }
    } catch {
      if (currentRequest === requestId.current) setError('The free public feeds could not be queried. Try refreshing.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }
  const currentAnalysis = analysis ? { ...analysis, airports: analysis.airports.map(item => {
    const current = (evidence?: Evidence) => !evidence || describeEvidence(evidence).state === 'current';
    return { ...item, faaAvailable: item.faaAvailable && current(item.faa?.evidence),
      faa: item.faa && !current(item.faa.evidence) ? { ...item.faa, level: 'unknown' as const,
        headline: 'Previous FAA evidence expired; current airport status is unknown', events: [], config: null } : item.faa,
      aviation: item.aviation ? { ...item.aviation,
        observation: current(item.aviation.evidence?.[0]) ? item.aviation.observation : null,
        forecast: current(item.aviation.evidence?.[1]) ? item.aviation.forecast : null } : undefined,
      nws: item.nws ? { ...item.nws, available: item.nws.available && current(item.nws.evidence),
        alerts: item.nws.alerts.filter(alert => (!alert.effective || Date.parse(alert.effective) <= Date.now()) && (!alert.expires || Date.parse(alert.expires) > Date.now())) } : undefined,
      outlook: item.outlook ? { ...item.outlook, available: item.outlook.available && current(item.outlook.evidence) } : undefined };
  }) } : null;
  const rows = currentAnalysis?.airports.map(item => ({...item, assessment: grade(item)})) || [];
  const origin = rows.find(item => item.code === route.origin);
  const connection = rows.find(item => item.code === route.connection);
  const destination = rows.find(item => item.code === route.destination);
  const alternative = rows.find(item => item.code === route.alternate);
  const highlights: string[] = [];
  if (connection?.assessment.level === 'critical') {
    highlights.push('Your connection airport has a significant active operating-condition signal. Check the airline before relying on a tight connection.');
  } else if (connection?.assessment.level === 'caution') {
    highlights.push('The connection airport has current reported conditions to review before travel.');
  }
  if (route.connection && route.connectionMinutes &&
    Number(route.connectionMinutes) < 75) {
    highlights.push('Your entered ' + route.connectionMinutes + '-minute connection deserves a margin review. This is a planning heuristic, not an airline-specific minimum connection time.');
  }
  if (destination?.assessment.level === 'critical') {
    highlights.push('Your arrival airport has a significant reported operating-condition signal. Review arrival flexibility and airport alternatives.');
  } else if (destination?.assessment.level === 'caution') {
    highlights.push('Your arrival airport has current weather or FAA signals worth reviewing.');
  }
  if (origin?.assessment.level === 'critical') {
    highlights.push('Your departure airport has a significant reported operating-condition signal. Verify the airline schedule and allow for disruption.');
  }
  if (alternative && destination && rank(alternative.assessment.level) <
    rank(destination.assessment.level) && alternative.assessment.level !== 'unknown') {
    highlights.push('The alternate airport has fewer flagged conditions in the available feeds. That does not establish flight service, available seats, or a shorter door-to-door journey.');
  }
  if (rows.some(item => item.assessment.unknowns.length > 0)) {
    highlights.push('Some source or airport details are unavailable. Missing information is not evidence of normal operations.');
  }
  for (const item of rows) {
    if (!item.outlook?.available) continue;
    const signals=[...new Set(item.outlook.periods
      .filter(period=>period.startTime.slice(0,10)===travelDate)
      .flatMap(period=>period.signals))].slice(0,3);
    if (signals.length)highlights.push(
      'NWS seven-day point forecast for '+item.code+' on '+travelDate+
      ' includes '+signals.join(', ')+'. Check updated weather closer to travel; this does not predict a flight delay.'
    );
  }
  if (analysis && !highlights.length) {
    highlights.push('No significant issues were reported by available sources. Confirm which sources actually returned evidence: unreported airports and individual flight status remain unknown.');
  }
  function saveOfflineBrief() {
    if (!valid) return;
    try {
      // Deliberate local opt-in: never copy team records or expiring live alerts.
      localStorage.setItem('atlas-travel-offline-brief-v1',JSON.stringify({
        route:[route.origin,route.connection,route.destination].filter(Boolean).join(' → '),
        alternate:route.alternate,travelDate,
        connectionMinutes:route.connectionMinutes,savedAt:new Date().toISOString(),
        historical:historical?.available?historical.legs.map(leg=>({
          segment:leg.origin+' → '+leg.destination,
          basis:leg.match?.basis||'none',sample:leg.match?.flights||0,
          periodEnd:leg.match?.periodEnd||''
        })):[],
        warning:'Offline information is not current FAA, weather or airline status.'
      }));
      setOfflineNotice('Saved on this device. Live conditions are never cached.');
    }catch{
      setOfflineNotice('Device storage is unavailable; no offline card was saved.');
    }
  }
  async function copyBrief() {
    if (!analysis) return;
    const text = [
      'FIELD SALES ATLAS · FREE FLIGHT OPERATIONS BRIEF',
      'Route: ' + [route.origin, route.connection, route.destination].filter(Boolean).join(' → '),
      route.alternate ? 'Possible alternate: ' + route.alternate : '',
      'Checked: ' + timeLabel(analysis.at),
      '',
      ...rows.flatMap(row => [
        row.code + ' ' + roleName(route, row.code) + ' · ' + row.assessment.level.toUpperCase(),
        ...row.assessment.findings.map(v => 'Observed: ' + v),
        ...row.assessment.unknowns.map(v => 'Unknown: ' + v),
        ...(row.outlook?.available
          ? [...new Set(row.outlook.periods
              .filter(period=>period.startTime.slice(0,10)===travelDate)
              .flatMap(period=>period.signals))].map(v=>'Forecast weather cue: '+v)
          : []),
      ]),
      '', 'REVIEW: ', ...highlights,
      '', 'Sources: FAA NAS, NOAA Aviation Weather, NWS point products and ECCC Canadian regional observations, forecasts and warnings. See each source’s coverage and time limits.',
      'Not airline flight status, a reservation, a booking service, or a forecast of cancellation.'
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('Evidence brief copied.');
    } catch {
      setCopyMessage('Clipboard unavailable. Use the on-screen brief.');
    }
  }
  const visibleEvidence=Boolean(analysis||historical||historyStatus!=='idle');
  const aircraftAirports=useMemo(()=>codes.flatMap(code=>{
    const airport=airportIndex.get(code);
    return /^[A-Z]{3}$/.test(code)?[{code,name:airport?.name||code}]:[];
  }),[codes,airportIndex]);
  return <section className="fr-page fi-page" aria-label="Flight intelligence workspace">
    <header className="fi-header">
      <div><span className="fi-eyebrow"><PlaneTakeoff size={16}/> YOUR TRAVEL INTELLIGENCE</span>
        <h1>Flight <span>intelligence.</span></h1>
        <p>Your route. The evidence. A more informed next move.</p>
      </div>
      <button type="button" className="fi-booked-link" onClick={() => onToolChange?.('booked')}>
        <TicketCheck size={18}/> Already booked? <span>Open your itinerary</span><ArrowRight size={16}/>
      </button>
    </header>
    <FlightToolkit active={activeTool} onSelect={selectTool} route={route} current={currentAnalysis}
      history={historical} historyStatus={historyStatus} officialHistory={officialHistory}/>
    {guardian&&<div className="fr-guardian-handoff" role="status">
      <TicketCheck size={18}/>
      <span>Imported booked flight · {guardian.origin} → {guardian.destination}
        {' · '+guardian.travelDate}. Atlas is checking public aviation evidence.
        It cannot verify the reservation or live airline flight status.</span>
      <button type="button" onClick={()=>onToolChange?.('booked')}>Back to itinerary</button>
    </div>}
    <section id="flight-route-composer" className="fr-card fr-builder fi-composer" aria-label="Flight research route and date">
      <div className="fs-route-primary">
        <label><span><PlaneTakeoff size={17}/> From <small>(required)</small></span>
          <input type="text" maxLength={3} list="fr-known-airports" placeholder="MCO"
            aria-label="Departure IATA airport code" autoCapitalize="characters"
            aria-required="true" ref={originInputRef} aria-invalid={routeAttempted && !airportCode(route.origin)}
            autoCorrect="off" spellCheck={false} value={route.origin}
            onChange={e=>setField('origin',e.target.value)}/>
        </label>
        <button className="fs-route-swap" type="button"
          onClick={swapRoute} aria-label="Swap departure and arrival airports"
          title="Swap airports"><Route size={20}/></button>
        <label><span><PlaneLanding size={17}/> To <small>(required)</small></span>
          <input type="text" maxLength={3} list="fr-known-airports" placeholder="ATL"
            aria-label="Arrival IATA airport code" autoCapitalize="characters"
            aria-required="true" ref={destinationInputRef} aria-invalid={routeAttempted && (!airportCode(route.destination) || route.origin === route.destination)}
            autoCorrect="off" spellCheck={false} value={route.destination}
            onChange={e=>setField('destination',e.target.value)}/>
        </label>
        <label className="fs-route-date"><span><Clock3 size={17}/> Date</span>
          <input type="date" value={travelDate}
            aria-label="Travel date for planning and historical context"
            onChange={e=>{invalidateResearch();setTravelDate(e.target.value);}}/>
        </label>
        <button className="fr-check-button" type="button" disabled={loading}
          aria-describedby={!valid?'fr-route-guidance':undefined}
          onClick={()=>void analyze()}>
          {loading?<RefreshCw size={17} className="fr-spinning"/>:<Radar size={18}/>}
          {loading?'Checking…':analysis?'Refresh flight brief':'Analyze flight'}
          <ArrowRight size={17}/>
        </button>
      </div>
      <datalist id="fr-known-airports">
        {ctx.airports.filter(a=>a.scheduled!==false).slice(0,1200).map(a=>
          <option key={a.iata+a.name} value={a.iata} label={a.name}/>)}
      </datalist>
      <div className="fs-route-utilities">
        <button type="button" className="fs-advanced-toggle"
          aria-expanded={showAdvanced} onClick={()=>{
             if(showAdvanced){
               invalidateResearch();
               setRoute(previous=>({...previous,connection:'',alternate:'',connectionMinutes:''}));
             }
             setShowAdvanced(value=>!value);
           }}>
          <Compass size={14}/>
          {showAdvanced?'Clear and hide optional airports':'Add connection, alternative or layover'}
          <ChevronDown size={14}/>
        </button>
        <span>Free public aviation research. Not a ticketing or booking service.</span>
      </div>
      <details className="fs-offline-tools">
        <summary><ShieldAlert size={15}/> Offline travel card <ChevronDown size={15}/></summary>
        <div className="fs-offline-row">
        <button type="button" disabled={!valid} onClick={saveOfflineBrief}>
          <ShieldAlert size={15}/> Save offline travel card
        </button>
        <button type="button" className="fs-clear-offline" onClick={()=>{
          try{localStorage.removeItem('atlas-travel-offline-brief-v1');
            setOfflineNotice('This device’s offline travel card was cleared.');}
          catch{setOfflineNotice('Could not clear device storage.');}
        }}>Clear offline copy</button>
        {offlineNotice&&<span role="status">{offlineNotice}</span>}
        </div>
      </details>
      {showAdvanced&&<div className="fs-advanced-fields">
        <label>Connecting airport
          <input aria-label="Connecting IATA airport code" type="text" maxLength={3}
            list="fr-known-airports" placeholder="ATL" value={route.connection}
            onChange={e=>setField('connection',e.target.value)}/>
        </label>
        <label>Alternative arrival
          <input aria-label="Alternative IATA airport code" type="text" maxLength={3}
            list="fr-known-airports" placeholder="MDW" value={route.alternate}
            onChange={e=>setField('alternate',e.target.value)}/>
        </label>
        <label>Connection minutes
          <input aria-label="Connection time in minutes" type="number" min={1} max={600}
            inputMode="numeric" placeholder="65" disabled={!route.connection}
            value={route.connection?route.connectionMinutes:''}
            onChange={e=>setField('connectionMinutes',e.target.value)}/>
        </label>
      </div>}
      {savedPlans.length>0&&<label className="fs-saved-plan">Saved trip
        <select value={chosenPlan} onChange={e=>loadPlan(e.target.value)}>
          <option value="">Load a saved trip (optional)</option>
          {[...savedPlans].sort((a,b)=>b.departDate.localeCompare(a.departDate)).slice(0,60)
            .map(plan=><option key={plan.id} value={plan.id}>
              {plan.title||'Unnamed trip'} · {plan.origins[0]||'---'} → {plan.selectedArrival||'---'}
            </option>)}
        </select>
      </label>}
      {savedError&&<p className="fr-note">{savedError}</p>}
      {!valid&&(routeAttempted||route.origin||route.destination)&&<p className="fr-validation" id="fr-route-guidance" role={routeAttempted ? 'alert' : 'status'}>
        {routeHint}
      </p>}
    </section>
    <p className="fi-run-status" role="status">
      {loading ? 'Checking airport and weather sources. Historical results load separately.' : analysis
        ? 'Airport checks completed ' + timeLabel(analysis.at) + '. Each source keeps its own coverage and age.'
        : 'Enter your airports and choose Analyze flight. No booking or manager record is required.'}
      {' '}Current conditions are checked now; historical records do not forecast your travel date.
    </p>
    <section className="fi-results" id="flight-intelligence-results" aria-label="Flight intelligence results" tabIndex={-1} ref={resultRef}>
      <div className="fi-result-toolbar"><span>{[route.origin, route.connection, route.destination].filter(Boolean).join(' → ') || 'Your flight research'}
        {valid && ' · ' + travelDate}</span>
        <button type="button" onClick={() => {
          const selected = document.querySelector<HTMLButtonElement>('.fi-toolkit button[aria-pressed="true"]');
          selected?.focus({ preventScroll: true });
          document.getElementById('flight-intelligence-tools')?.scrollIntoView({ block: 'start' });
        }}>All intelligence tools ↑</button>
      </div>
      <div hidden={!['dna', 'connection', 'alternatives'].includes(activeTool)} id="atlas-flight-dna">
        <FlightDnaPanel origin={route.origin} destination={route.destination}
          connection={route.connection} alternate={route.alternate} connectionMinutes={route.connectionMinutes}
          view={activeTool === 'connection' || activeTool === 'alternatives' ? activeTool : 'dna'} onEditConnection={editConnection}
          onEditAlternative={() => {
            setShowAdvanced(true);
            requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Alternative IATA airport code"]')?.focus());
          }}
          onAnalyzed={onHistoricalAnalysis} onOfficialAnalyzed={onOfficialAnalysis}
          analysisToken={researchRun} travelDate={travelDate}
          initialCarrier={guardian?.carrier || ''} initialFlightNumber={guardian?.flightNumber || ''}
          onDateChange={value => { invalidateResearch(); setTravelDate(value); }}/>
      </div>
      {(activeTool === 'pressure' || activeTool === 'weather') && <>
        <header className="fi-panel-heading"><span className="fi-eyebrow">{activeTool === 'pressure' ? 'FAA / AIRPORT OPERATIONS' : 'NOAA / NWS / ECCC'}</span>
          <h2>{activeTool === 'pressure' ? 'Airport pressure' : 'Weather risk'}</h2>
          <p>{activeTool === 'pressure' ? 'Airport-wide operating notices and published runway configuration. Missing FAA entries leave status unknown.'
            : 'Station observations, published forecasts and regional warnings. Every airport is checked separately.'}</p>
        </header>
        {activeTool === 'pressure' && error && <p className="fi-source-gap" role="status"><Info size={18}/>{error}</p>}
    {analysis && <section id="atlas-airport-operations" className="fr-findings" aria-live="polite">
      <div className="fr-results-heading">
        <div><span className="fr-overline">CURRENT AIRPORT-LEVEL EVIDENCE</span>
          <h3>{[route.origin, route.connection, route.destination].filter(Boolean).join(' → ')}</h3>
          <p>Checked {timeLabel(analysis.at)}. This is not a live flight-status or booking service.</p></div>
        <button type="button" className="fr-secondary" onClick={() => void copyBrief()}>
          <FileText size={17}/> Copy evidence brief
        </button>
      </div>
      {copyMessage && <p className="fr-note" role="status">{copyMessage}</p>}
      <div className="fr-airports">
        {rows.map(row => <article className={'fr-airport fr-level-' + (activeTool === 'pressure' && row.faaAvailable ? row.faa?.level : 'unknown')} key={row.code}>
          <div className="fr-airport-top">
            <div><span className="fr-code">{row.code}</span>
              <span className="fr-role">{roleName(route, row.code)}</span></div>
            <span className={'fr-level-pill fr-pill-' + (activeTool === 'pressure' && row.faaAvailable ? row.faa?.level : 'unknown')}>
              {activeTool === 'weather' ? row.aviation?.observation ? 'Station report available' : 'Station report unavailable'
                : !row.faaAvailable ? 'FAA status unknown' : row.faa?.level === 'critical' ? 'Immediate review'
                : row.faa?.level === 'caution' ? 'Conditions to review' : 'FAA entry available'}
            </span>
          </div>
          <h3>{row.airportName || row.airport?.name || 'Airport name not mapped'}</h3>
          {activeTool === 'pressure' && <>
          <div className="fr-evidence">
            <div className="fr-evidence-label"><Activity size={16}/> FAA airport events</div>
            <strong>{row.faaAvailable ? row.faa?.headline ||
              'No FAA entry; event status unknown' : row.faa?.headline ||
                'FAA feed unavailable; airport status unknown'}</strong>
            {row.faa?.events.slice(0, 3).map((event, idx) => <small key={idx}>
              {event.kind}{event.reason ? ' · ' + event.reason : ''}
              {event.avgMinutes !== null ? ' · FAA average ' + event.avgMinutes + ' min' : ''}
            </small>)}
            {row.faaAvailable && <small>FAA checked {timeLabel(row.faaCheckedAt)}</small>}
          </div>
          {row.faa?.config && <div className="fr-evidence">
            <div className="fr-evidence-label"><Activity size={16}/> FAA operational configuration</div>
            <strong>{row.faa.config.arrivalRate === null ? 'Published arrival rate not available' :
              'Published arrival rate: '+row.faa.config.arrivalRate+' aircraft/hour'}</strong>
            {row.faa.config.arrivalRunways && <small>Arrival runways: {row.faa.config.arrivalRunways}</small>}
            {row.faa.config.departureRunways && <small>Departure runways: {row.faa.config.departureRunways}</small>}
            {row.faa.config.updatedAt && <small>FAA config timestamp: {timeLabel(row.faa.config.updatedAt)}</small>}
            {(faaDeltas[row.code] || []).map((change,index) =>
              <p key={index} className="fr-configuration-change">{change}</p>)}
            <small>Change detection compares only this device's previously saved FAA snapshot, not a historical airport capacity model.</small>
          </div>}
          </>}
          {activeTool === 'weather' && <>
          <div className="fr-evidence">
            <div className="fr-evidence-label"><Wind size={16}/> NOAA station weather</div>
            {row.aviation?.observation ? <>
              <strong>{row.aviation.observation.category || 'Flight category unavailable'}
                {row.aviation.observation.windKnots !== null ?
                  ' · ' + row.aviation.observation.windKnots + ' kt sustained' : ''}
              </strong>
              <small>Observed {timeLabel(row.aviation.observation.reportTime)}
                {ageMinutes(row.aviation.observation.reportTime) !== null &&
                  ageMinutes(row.aviation.observation.reportTime)! > 180 ? ' · STALE' : ''}</small>
            </> : <strong>{row.aviationIssue}</strong>}
            {row.aviation?.forecast?.raw && <details className="fr-forecast">
              <summary>Read terminal forecast <ChevronDown size={15}/></summary>
              <p>{row.aviation.forecast.raw}</p>
            </details>}
          </div>
          {!row.regional?.length && <><div className="fr-evidence">
            <div className="fr-evidence-label"><CloudLightning size={16}/> NWS alerts at airport</div>
            {row.nws?.available ? row.nws.alerts.length ?
              row.nws.alerts.slice(0, 3).map((alert, idx) => <div className="fr-nws-alert" key={idx}>
                <strong>{alert.event} · {alert.severity}</strong>
                {alert.headline && <small>{alert.headline}</small>}
                {alert.expires && <small>Expires {timeLabel(alert.expires)}</small>}
              </div>) : <strong>No active NWS alerts returned for this point</strong> :
              <strong>{row.nwsIssue}</strong>}
          </div>
          <div className="fr-evidence fr-future-forecast">
            <div className="fr-evidence-label"><CalendarDays size={16}/> NWS travel-date weather outlook</div>
            {row.outlook?.available ? row.outlook.periods.some(period=>period.startTime.slice(0,10)===travelDate) ? <>
              <small>Forecast for {travelDate}. National Weather Service point forecast, not a flight-status prediction.</small>
              <div className="fr-outlook-period-list">
                {row.outlook.periods.filter(period=>period.startTime.slice(0,10)===travelDate)
                  .map(period=><div key={period.number} className={'fr-outlook-period'+(period.signals.length?' has-weather-cues':'')}>
                    <span>{period.name}</span>
                    <strong>{period.temperature===null?'Temperature unavailable':period.temperature+'°'+period.temperatureUnit}
                      {' · '}{period.shortForecast||'Forecast detail unavailable'}</strong>
                    {period.windSpeed&&<small>Wind: {period.windSpeed}</small>}
                    {period.signals.length>0&&<small className="fr-outlook-cue">
                      <CloudLightning size={13}/>{period.signals.join(' · ')}
                    </small>}
                  </div>)}
              </div>
              <small>Checked {timeLabel(row.outlook.checkedAt)} · Recheck before departure.</small>
            </> : <strong>The selected travel date falls outside the published NWS forecast window.</strong>
              : <strong>{row.outlookIssue}</strong>}
          </div></>}
          {!!row.regional?.length && <RegionalAirportWeather products={row.regional}/>}
          </>}
          <TravelEvidence evidence={activeTool === 'pressure' ? (row.faa?.evidence ? [row.faa.evidence] : []) : [
            ...(row.aviation?.evidence || []), ...(row.nws?.evidence ? [row.nws.evidence] : []),
            ...(row.outlook?.evidence ? [row.outlook.evidence] : []), ...(row.regional || []).map(product => product.evidence)
          ]}/>
          <small className="fi-evidence-note">Missing or expired evidence does not establish current conditions.</small>
        </article>)}
      </div>
      <div className="fr-source-list">
        <div><span className="fr-overline">VERIFY AT THE SOURCE</span>
          <p>These public observations do not confirm a specific airline flight's status,
            gate, assigned aircraft, seat availability or future arrival time.</p></div>
        <div className="fr-source-links">
          <a href="https://nasstatus.faa.gov/" target="_blank" rel="noreferrer">FAA NAS <ExternalLink size={13}/></a>
          <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer">NOAA Aviation <ExternalLink size={13}/></a>
          <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">NWS Alerts <ExternalLink size={13}/></a>
        </div>
      </div>
    </section>}
    {!analysis && !loading && <section id="atlas-airport-operations" className="fr-quiet">
      <Radar size={28}/><strong>Your first real travel intelligence brief is one check away.</strong>
      <p>Pick the airports involved in your trip. Atlas will request current FAA operating events,
        official aviation conditions and local weather alerts, then explain what warrants attention.</p>
      <button type="button" onClick={() => { originInputRef.current?.focus(); }}>Enter route airports <ArrowRight size={16}/></button>
    </section>}
      </>}
      <div id="atlas-security-history" hidden={activeTool !== 'security'}>
        <SecurityHistory key={ctx.activeTrainerId} airport={route.origin} travelDate={travelDate}/>
      </div>
      {activeTool === 'map' && <FlightNetworkMap origin={route.origin} connection={route.connection} destination={route.destination} alternate={route.alternate}/>}
      <div hidden={activeTool !== 'aircraft'}>
        {aircraftOpened && aircraftAirports.length > 0 ? <ObservedAircraftPanel airports={aircraftAirports} autoCheckToken={activeTool === 'aircraft' ? researchRun : 0}/>
          : activeTool === 'aircraft' && <div className="fi-empty"><Radar size={26}/><h2>Aircraft nearby</h2><p>Enter a route airport to request a community observation snapshot.</p></div>}
      </div>
    </section>
    {visibleEvidence && <details className="fi-trip-brief"><summary><Compass size={18}/> How this evidence affects your trip <ChevronDown size={16}/></summary>
      <FlightDecisionBrief route={route} now={currentAnalysis} history={historical} officialHistory={officialHistory}/>
      <div className="fi-evidence-basis"><Info size={17}/><p>FAA and station observations describe conditions at check time. Historical samples, transfer assumptions and future forecasts have different scopes. Missing data remains unknown.</p></div>
    </details>}
  </section>;
}
