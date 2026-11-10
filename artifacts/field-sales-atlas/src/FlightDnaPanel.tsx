import {
Activity,ArrowRight,CalendarDays,Check,ChevronDown,Clock3,
Compass,Database,ExternalLink,FileText,Info,
RefreshCw,
Route,
TrendingUp
} from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import './FlightDnaPanel.css';
import { api } from './workspaceApi';
import OfficialFlightHistory from './OfficialFlightHistory';
import type { OfficialHistoryLeg } from './OfficialFlightHistory';

type Metric = {
  basis: 'flight number'|'route'|'airport';
  label: string;
  origin: string; destination: string; carrier: string; flightNumber: string;
  flights: number; onTimePct: number|null; cancelPct: number|null; severePct: number|null;
  avgArrivalDelay: number|null; medianArrivalDelay: number|null;
  departureOnTimePct: number|null; periodStart: string; periodEnd: string;
};
type Leg = {
  origin: string; destination: string;
  match: Metric|null; route: Metric|null; airportBaseline: Metric|null; note: string;
};
type Path = {connection: string; legs: Metric[]; index: number; description: string};
export type DnaResponse = {
  available: boolean; checkedAt: string; source: string; sourceUrl: string;
  attribution: string; license: string;
  period: {start: string; end: string}|null;
  sources: Array<{name: string; available: boolean; records: number; periodEnd: string}>;
  legs: Leg[]; alternatePaths: Path[]; alternateArrival: Leg|null;
  selectedMonth: string;
  monthly: Array<{month: string; flights: number; onTimePct: number|null; cancelPct: number|null}>;
  notes: string[];
};
export type DnaStatus = 'idle'|'loading'|'ready'|'unavailable'|'error';
type Props = {
  onOfficialAnalyzed?: (legs: OfficialHistoryLeg[] | null) => void;
  origin: string; destination: string; connection: string;
  alternate: string; connectionMinutes: string;
  travelDate:string;
  onDateChange:(date:string)=>void;
  analysisToken?:number;
  initialCarrier?:string;initialFlightNumber?:string;
  onAnalyzed?: (data:DnaResponse|null,status:DnaStatus,message?:string)=>void;
};
function readable(value: number|null, suffix: string, decimals = 1) {
  return value === null || !Number.isFinite(value) ? 'Not available' :
    value.toFixed(decimals) + suffix;
}
function number(value: number) { return value.toLocaleString('en-US'); }
function coverageDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'cutoff not supplied';
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())
    ?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
    :'cutoff not supplied';
}
function bufferInitial(): number {
  try {
    const value = Number(localStorage.getItem('atlas-transfer-buffer-min-v1'));
    return [25,35,45,60,75].includes(value) ? value : 45;
  } catch { return 45; }
}
function MetricCard({metric,subtitle}:{metric:Metric|null;subtitle:string}) {
  if (!metric) return <div className="fd-metric-empty">
    <Info size={18}/><strong>Insufficient historical coverage</strong>
    <span>Atlas does not invent rates for flights excluded from the dataset.</span>
  </div>;
  return <div className="fd-metric-card">
    <div className="fd-metric-heading">
      <span>{metric.basis === 'flight number' ? 'EXACT FLIGHT-NUMBER HISTORY' :
        metric.basis === 'route' ? 'DIRECTIONAL ROUTE HISTORY' : 'AIRPORT-LEVEL FALLBACK'}</span>
      <span>{number(metric.flights)} historical flights</span>
    </div>
    <h4>{metric.label}</h4>
    <p>{subtitle}</p>
    <div className="fd-metric-grid">
      <div><span>Arrived under 15 min late</span><strong>{readable(metric.onTimePct, '%')}</strong></div>
      <div><span>Cancelled</span><strong>{readable(metric.cancelPct, '%', 2)}</strong></div>
      <div><span>60+ min late</span><strong>{readable(metric.severePct, '%')}</strong></div>
      <div><span>Average arrival difference</span>
        <strong>{metric.avgArrivalDelay === null ? 'Not available' :
          Math.round(metric.avgArrivalDelay) > 0 ? '+' + readable(metric.avgArrivalDelay, ' min') :
            readable(metric.avgArrivalDelay, ' min')}</strong></div>
    </div>
    <small>Historical period: {metric.periodStart || 'Unknown'} to {metric.periodEnd || 'Unknown'}.
      On-time and 60+ minute delay rates exclude cancelled and diverted flights.</small>
  </div>;
}

export default function FlightDnaPanel({
  origin,destination,connection,alternate,connectionMinutes,onAnalyzed,travelDate,onDateChange,
  analysisToken=0,initialCarrier='',initialFlightNumber='',onOfficialAnalyzed
}: Props) {
  const [carrier,setCarrier] = useState(initialCarrier);
  const [flightNumber,setFlightNumber] = useState(initialFlightNumber);
  const [buffer,setBuffer] = useState(bufferInitial);
  const [report,setReport] = useState<DnaResponse|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [copied,setCopied] = useState(false);
  const [officialRun, setOfficialRun] = useState({ key: '', run: 0 });
  const request = useRef(0);
  const sourceKey = [origin,destination,connection,alternate,travelDate,carrier,flightNumber].join('|');
  useEffect(() => {
    request.current += 1;
    setBusy(false);
    setReport(null);
    onAnalyzed?.(null,'idle');
    setError('');
    setCopied(false);
  }, [sourceKey,onAnalyzed]);
  useEffect(() => {
    try { localStorage.setItem('atlas-transfer-buffer-min-v1',String(buffer)); }
    catch { /* User preference persistence unavailable. */ }
  },[buffer]);
  const valid = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination) &&
    origin !== destination && (!connection || /^[A-Z]{3}$/.test(connection));
  const transferScenarios = useMemo(() => {
    const layover = Number(connectionMinutes);
    return connection && layover >= 1 ?
      [0,15,30,60].map(delay => ({
        delay, remaining: layover - buffer - delay
      })) : [];
  },[connection,connectionMinutes,buffer]);
  async function analyze(automatic = false) {
    if (!valid || (busy && !automatic)) return;
    const token = ++request.current;
    setBusy(true);
    setOfficialRun(previous => ({ key: sourceKey, run: previous.run + 1 }));
    setReport(null);
    setError('');
    onAnalyzed?.(null,'loading');
    const params = new URLSearchParams({origin,destination});
    if(connection) params.set('connection',connection);
    if(alternate) params.set('alternate',alternate);
    if(travelDate) params.set('date',travelDate);
    if(carrier) params.set('carrier',carrier.trim().toUpperCase());
    if(flightNumber) params.set('flightNumber',flightNumber);
    try {
      const response = await api.get('/api/travel/flight-history?' + params.toString());
      if (token === request.current) {
        const data=response.data as DnaResponse;
        setReport(data);
        onAnalyzed?.(data,data.available?'ready':'unavailable',
          data.available?'':'No historical flight dataset is currently available.');
      }
    } catch {
      if (token === request.current) {
        const message='Independent historical data could not be loaded. Check the separate official records and current airport evidence.';
        onAnalyzed?.(null,'error',message);
        setError(message);
      }
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  // One-tap Analyze Flight launches this in parallel with FAA, NOAA and NWS.
  // Manual deep lookup stays available for airline/flight-specific research.
  useEffect(() => {
    // Automatic research can supersede a stale request whose busy flag was
    // set on the previous route. The token gates late responses.
    if (analysisToken > 0) void analyze(true);
  }, [analysisToken]);
  function copiedBrief() {
    if (!report) return;
    const content = [
      'FIELD SALES ATLAS · FLIGHT DNA · HISTORICAL EVIDENCE',
      'Route: ' + [origin,connection,destination].filter(Boolean).join(' → '),
      'Travel planning date: ' + travelDate,
      'Common source period: ' + (report.period ? report.period.start+' to '+report.period.end : 'Not applicable: source reporting periods differ; see each metric'),
      ...report.legs.flatMap(leg => [
        leg.origin+' → '+leg.destination,
        leg.note,
        leg.match ? [
          'Basis '+leg.match.basis+'; sample '+leg.match.flights,
          'On-time among completed '+readable(leg.match.onTimePct,'%'),
          'Cancelled '+readable(leg.match.cancelPct,'%',2),
          '60+ min late among completed '+readable(leg.match.severePct,'%')
        ].join('; ') : 'No eligible historical match'
      ]),
      'Statistics describe past covered flights, not the date-specific chance of disruption.',
      report.attribution,
      'https://flyerintel.com/data/'
    ].join('\n');
    navigator.clipboard.writeText(content).then(
      () => setCopied(true), () => setCopied(false));
  }
  return <section className="fd-root" aria-label="Flight DNA historical intelligence">
    <header className="fd-head">
      <div>
        <span className="fd-overline"><Database size={16}/> PUBLIC HISTORY · OUR DECISION LOGIC</span>
        <h2>Flight DNA <span>See the past behind the route.</span></h2>
        <p>Analyze published, selectively covered historical flight outcomes, compare possible connection corridors, and test your layover margin. This is not a comprehensive nationwide flight database.</p>
      </div>
      <div className="fd-head-icon"><Activity size={27}/></div>
    </header>

    <div className="fd-controls">
      <label><CalendarDays size={15}/> Travel date
        <input type="date" value={travelDate} onChange={e=>onDateChange(e.target.value)}/>
      </label>
      <label>Operating airline (optional)
        <input value={carrier} onChange={e=>setCarrier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,2))}
          maxLength={2} placeholder="DL / AA / WN"/>
      </label>
      <label>First-leg flight number (optional)
        <input inputMode="numeric" value={flightNumber}
          onChange={e=>setFlightNumber(e.target.value.replace(/\D/g,'').slice(0,4))}
          maxLength={4} placeholder="e.g. 1046"/>
      </label>
      <button type="button" className="fd-cta" onClick={()=>void analyze()} disabled={!valid||busy}>
        {busy?<RefreshCw size={17} className="fd-spin"/>:<Database size={17}/>}
        {busy ? 'Reading history…' : 'Analyze historical flights'}
        <ArrowRight size={17}/>
      </button>
    </div>
    <p className="fd-intro-warning"><Info size={15}/>
      Use the airline operating the flight, which can differ from the brand on your ticket.
      If you leave it blank, Atlas uses available route or airport history instead.
    </p>
    {error && <div className="fd-error" role="alert">{error}</div>}
    <OfficialFlightHistory origin={origin} destination={destination} connection={connection} carrier={carrier} flightNumber={flightNumber} analysisToken={officialRun.key === sourceKey ? officialRun.run : 0} onAnalyzed={onOfficialAnalyzed}/>
    {report && !report.available && <div className="fd-error" role="status">
      <strong>Independent historical aggregates are unavailable.</strong> Check the separate official BTS results above.
      {report.sources.length>0&&<ul>{report.sources.map(source=><li key={source.name}>
        {source.name.replaceAll('-',' ')}: {source.available?'available':'unavailable'}
      </li>)}</ul>}
      Try again later. Current airport and weather checks are separate.

    </div>}
    {report?.available && <div className="fd-results" aria-live="polite">
      <div className="fd-results-head">
        <div>
          <span className="fd-overline">HISTORICAL MATCH RESULTS</span>
          <h3>{[origin,connection,destination].filter(Boolean).join(' → ')}</h3>
          <p>Atlas completed this lookup {new Date(report.checkedAt).toLocaleString()}.
            Reporting cutoffs are shown on each result and source below. This is not a forecast of your exact flight.</p>
        </div>
        <button type="button" className="fd-copy" onClick={copiedBrief}>
          {copied?<Check size={16}/>:<FileText size={16}/>}
          {copied?'Copied':'Copy evidence'}
        </button>
      </div>
      <div className="fd-legs">
        {report.legs.map((leg,i)=><div className="fd-leg" key={leg.origin+'-'+leg.destination+'-'+i}>
          <div className="fd-leg-title">
            <div><span>LEG {i+1}</span><strong>{leg.origin} <ArrowRight size={17}/> {leg.destination}</strong></div>
            <span>{leg.match?.basis === 'flight number'?'Flight matched':
              leg.match?.basis === 'route'?'Route matched':
                leg.match?.basis === 'airport'?'Airport fallback':'No coverage'}</span>
          </div>
          <MetricCard metric={leg.match} subtitle={leg.note}/>
          {leg.match?.basis === 'flight number' && leg.route &&
            <details className="fd-explainer">
              <summary>Compare with all airlines on this directional route <ChevronDown size={15}/></summary>
              <MetricCard metric={leg.route} subtitle="Route benchmark; different population and sample."/>
            </details>}
          {leg.match?.basis === 'route' && leg.airportBaseline &&
            <div className="fd-benchmark"><Info size={16}/>
              Compare with the departure airport's broader network:
              <strong>{readable(leg.airportBaseline.onTimePct,'%')} on-time</strong>
              <span>Airport-wide completed departures, not a matched itinerary.</span>
            </div>}
        </div>)}
      </div>
      {report.alternateArrival?.match &&
        <div className="fd-alternate-summary">
          <Compass size={21}/>
          <div><span>ALTERNATE ARRIVAL RESEARCH</span>
            <strong>{origin} → {alternate}: {report.alternateArrival.match.basis === 'route' ?
              'historical directional route found':'airport-level baseline only'}</strong>
            <small>{report.alternateArrival.note}</small></div>
          <strong>{readable(report.alternateArrival.match.onTimePct,'%')}</strong>
        </div>}
      {report.alternatePaths.length > 0 && <section className="fd-paths">
        <div className="fd-section-label">
          <div><span className="fd-overline">OPEN DATA NETWORK SCAN</span>
            <h3>Other connecting hubs worth researching</h3>
            <p>Atlas joins two historical directional routes into possible connection corridors. This does not establish a bookable itinerary, actual schedule, or protected connection.</p></div>
          <Route size={22}/>
        </div>
        <div className="fd-path-list">
          {report.alternatePaths.slice(0,6).map((path,i)=><div className="fd-path" key={path.connection}>
            <span className="fd-path-index">{i+1}</span>
            <div><strong>{origin} → {path.connection} → {destination}</strong>
              <small>{path.legs.map(leg=>leg.origin+'–'+leg.destination+' · '+readable(leg.severePct,'%')+' severe / '+readable(leg.cancelPct,'%',2)+' cancelled').join(' | ')}</small>
            </div>
            <div className="fd-path-proxy">
              <strong>{path.index.toFixed(1)}</strong><small>Exposure proxy*</small>
            </div>
          </div>)}
        </div>
        <p className="fd-note">* Lowest proxy listed first. The proxy is the largest leg's historical 60+ minute delay percentage plus the largest leg's cancellation percentage. It is an internal comparison heuristic, not a probability or a guarantee of better routing. Actual airline schedules remain unverified.</p>
      </section>}
      {report.monthly.length > 0 && <section className="fd-months">
        <div className="fd-section-label"><div><span className="fd-overline">AIRPORT TREND · HISTORICAL</span>
          <h3>{origin} monthly departure reliability</h3>
          <p>Recent months across the airport's entire reporting-airline network, not your selected flight or route.</p></div>
          <TrendingUp size={21}/></div>
        <div className="fd-monthly-chart" aria-label="Monthly completed-flight on-time percentages">
          {report.monthly.map(row=><div className="fd-month-col" key={row.month}>
            <strong>{row.onTimePct === null?'N/A':Math.round(row.onTimePct)+'%'}</strong>
            <div className="fd-month-track"><div style={{height:(row.onTimePct??0)+'%'}}/></div>
            <span>{row.month.slice(5)}/{row.month.slice(2,4)}</span>
          </div>)}
        </div>
        <p className="fd-note">BTS-derived monthly airport-level figures. Cancelled and diverted flights are excluded from the on-time denominator; not all airports meet publication thresholds.</p>
      </section>}
      <div className="fd-sources">
        <div><strong>Source coverage</strong><span>CC BY 4.0 public data · No paid API key</span></div>
        <div className="fd-source-status">
          {report.sources.map(item=><span key={item.name} className={item.available?'available':'unavailable'}>
            {item.available?<Check size={13}/>:<Info size={13}/>}
            {item.name.replaceAll('-',' ')} · {item.available?
              number(item.records)+' rows · through '+coverageDate(item.periodEnd):'unavailable'}
          </span>)}
        </div>
        <p>{report.attribution}. <a href="https://flyerintel.com/data/" target="_blank" rel="noreferrer">
          Dataset and reuse terms <ExternalLink size={13}/></a>
          {' · '}<a href="https://www.transtats.bts.gov/" target="_blank" rel="noreferrer">
            Original US DOT BTS source <ExternalLink size={13}/></a></p>
        {report.notes.map((note,i)=><p key={i} className="fd-note">{note}</p>)}
      </div>
    </div>}

    {connection && <section className="fd-connection" aria-label="Connection survival scenarios">
      <div className="fd-section-label">
        <div><span className="fd-overline">LAYOVER ENGINE · YOUR ASSUMPTIONS</span>
          <h3>How much of your connection survives a delay?</h3>
          <p>Simple what-if arithmetic using the layover you entered above and your personal gate-transfer allowance.</p></div>
        <Clock3 size={21}/>
      </div>
      <div className="fd-buffer-row">
        <span>Allow for terminal / gate transfer</span>
        <select value={buffer} onChange={e=>setBuffer(Number(e.target.value))}>
          {[25,35,45,60,75].map(value=><option value={value} key={value}>{value} minutes</option>)}
        </select>
        <small>Remembered on this device</small>
      </div>
      {transferScenarios.length > 0 ? <div className="fd-scenarios">
        {transferScenarios.map(row=><div key={row.delay} className={row.remaining<0?'failed':row.remaining<15?'tight':'roomy'}>
          <span>Inbound arrives {row.delay} min late</span>
          <strong>{row.remaining < 0 ? Math.abs(row.remaining)+' min short' :
            row.remaining+' min spare'}</strong>
        </div>)}
      </div> : <p className="fd-empty">Enter the connecting layover above to see your margin under different delay scenarios.</p>}
      <p className="fd-note">This is not a missed-connection probability. It excludes airline minimum connection rules, boarding-door cutoffs, aircraft and gate movements, separate tickets, immigration and accessibility needs.</p>
    </section>}
    {!report && !busy && <p className="fd-empty">
      <Database size={21}/> Enter your actual flight or leave the optional airline fields empty.
      Atlas will retrieve documented historical records and identify the strongest matching level.
    </p>}
  </section>;
}
