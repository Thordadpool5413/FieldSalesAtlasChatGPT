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
import { connectionMargin } from '../shared/travel/readiness';
import OfficialFlightHistory from './OfficialFlightHistory';
import type { OfficialHistoryLeg } from './OfficialFlightHistory';

import { flightHistorySchema, type DnaResponse, type DnaStatus } from './FlightHistoryData';
export type { DnaResponse, DnaStatus } from './FlightHistoryData';
type Metric = DnaResponse['legs'][number]['match'];
type Props = {
  view?: 'dna' | 'connection' | 'alternatives';
  onEditConnection?: () => void;
  onEditAlternative?: () => void;
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
function connectionPreference(key:'transferMinutes'|'boardingCutoffMinutes'): number | null {
  try {
    const value = JSON.parse(localStorage.getItem('atlas-connection-allowances-v2') || '{}')[key];
    return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=(key==='transferMinutes'?720:180)?value:null;
  } catch { return null; }
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
  analysisToken=0,initialCarrier='',initialFlightNumber='',onOfficialAnalyzed,
  view='dna',onEditConnection,onEditAlternative
}: Props) {
  const [carrier,setCarrier] = useState(initialCarrier);
  const [flightNumber,setFlightNumber] = useState(initialFlightNumber);
  const [buffer,setBuffer] = useState(()=>connectionPreference('transferMinutes'));
  const [boarding,setBoarding] = useState(()=>connectionPreference('boardingCutoffMinutes'));
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
    if(buffer===null&&boarding===null)return;
    try { localStorage.setItem('atlas-connection-allowances-v2',JSON.stringify({transferMinutes:buffer,boardingCutoffMinutes:boarding})); }
    catch { /* User preference persistence unavailable. */ }
  },[buffer,boarding]);
  const valid = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination) &&
    origin !== destination && (!connection || /^[A-Z]{3}$/.test(connection));
  const transferScenarios = useMemo(() => {
    const layover = Number(connectionMinutes);
    return connection && layover >= 1 ?
      [0,15,30,60].map(delay => ({
        delay, remaining: connectionMargin(layover,{transferMinutes:buffer??undefined,boardingCutoffMinutes:boarding??undefined},delay)
      })) : [];
  },[connection,connectionMinutes,buffer,boarding]);
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
        const parsed=flightHistorySchema.safeParse(response.data);
        if(!parsed.success)throw Error('Incomplete independent-history response.');
        const data=parsed.data;
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
  return <section className="fd-root" aria-label={view === 'dna' ? 'Flight DNA historical intelligence' : view === 'connection' ? 'Connection survival scenarios' : 'Alternative route research'}>
    <header className="fd-head">
      <div>
        <span className="fd-overline"><Database size={16}/>{view === 'connection' ? 'YOUR TIMING / EXPLICIT ASSUMPTIONS' : 'PUBLIC HISTORY / SOURCE RECORDS'}</span>
        <h2>{view === 'dna' ? 'Flight DNA' : view === 'connection' ? 'Connection survival' : 'Alternative routes'}</h2>
        <p>{view === 'dna' ? 'See the records behind your route: arrival reliability, cancellations, severe delays and reporting coverage. Official records and independent samples stay separate.'
          : view === 'connection' ? 'See what remains of your layover after a late arrival and your own gate-transfer allowance.'
          : 'Compare historically documented connecting corridors and a different arrival airport. Schedules and seats still need airline verification.'}</p>
      </div>
      <div className="fd-head-icon"><Activity size={27}/></div>
    </header>

    {view !== 'connection' && <><div className="fd-controls">
      <label><CalendarDays size={15}/> Travel date
        <input type="date" value={travelDate} onChange={e=>onDateChange(e.target.value)}/>
      </label>
      <label>Operating airline (optional)
        <input value={carrier} onChange={e=>setCarrier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,2))}
          maxLength={2} placeholder="Operating carrier code"/>
      </label>
      <label>First-leg flight number (optional)
        <input inputMode="numeric" value={flightNumber}
          onChange={e=>setFlightNumber(e.target.value.replace(/\D/g,'').slice(0,4))}
          maxLength={4} placeholder="Flight number on your itinerary"/>
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
    </p></>}
    {view === 'alternatives' && <button type="button" className="fi-inline-action" onClick={onEditAlternative}><Compass size={17}/>{alternate ? 'Change alternative arrival ' + alternate : 'Add an alternative arrival airport'}<ArrowRight size={16}/></button>}
    {view !== 'connection' && error && <div className="fd-error" role="alert">{error}</div>}
    <div hidden={view !== 'dna'}><OfficialFlightHistory origin={origin} destination={destination} connection={connection} carrier={carrier} flightNumber={flightNumber} analysisToken={officialRun.key === sourceKey ? officialRun.run : 0} onAnalyzed={onOfficialAnalyzed}/></div>
    {view !== 'connection' && report && !report.available && <div className="fd-error" role="status">
      <strong>Independent historical aggregates are unavailable.</strong> Check the separate official BTS results above.
      {report.sources.length>0&&<ul>{report.sources.map(source=><li key={source.name}>
        {source.name.replaceAll('-',' ')}: {source.available?'available':'unavailable'}
      </li>)}</ul>}
      Try again later. Current airport and weather checks are separate.

    </div>}
    {view !== 'connection' && report?.available && <div className="fd-results" aria-live="polite">
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
      {view === 'dna' && !report.legs.length && <p className="fd-empty">No matched historical leg was returned for this route. Review the source coverage below; no reliability rate was assigned.</p>}
      {view === 'dna' && <div className="fd-legs">
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
      </div>}
      {view === 'alternatives' && report.alternateArrival?.match &&
        <div className="fd-alternate-summary">
          <Compass size={21}/>
          <div><span>ALTERNATE ARRIVAL RESEARCH</span>
            <strong>{origin} → {alternate}: {report.alternateArrival.match.basis === 'route' ?
              'historical directional route found':'airport-level baseline only'}</strong>
            <small>{report.alternateArrival.note}</small></div>
          <strong>{readable(report.alternateArrival.match.onTimePct,'%')}</strong>
        </div>}
      {view === 'alternatives' && !report.alternatePaths.length && <p className="fd-empty">No connecting corridor was found in this source's historical coverage. That does not establish that no airline option exists. Verify alternatives with the airline.</p>}
      {view === 'alternatives' && alternate && !report.alternateArrival?.match && <p className="fd-empty">No matched historical sample for {origin} → {alternate}. No reliability rate was assigned.</p>}
      {view === 'alternatives' && report.alternatePaths.length > 0 && <section className="fd-paths">
        <div className="fd-section-label">
          <div><span className="fd-overline">OPEN DATA NETWORK SCAN</span>
            <h3>Other connecting hubs worth researching</h3>
            <p>Atlas joins two historical directional routes into possible connection corridors. This does not establish a bookable itinerary, actual schedule, or protected connection.</p></div>
          <Route size={22}/>
        </div>
        <div className="fd-path-list">
          {report.alternatePaths.slice(0,8).map((path,i)=><div className="fd-path" key={path.connection}>
            <span className="fd-path-index">{i+1}</span>
            <div className="fd-path-evidence"><strong>{origin} → {path.connection} → {destination}</strong>
              <div className="fd-path-legs">{path.legs.map(leg=><div key={leg.origin+leg.destination}>
                <strong>{leg.origin} → {leg.destination}</strong>
                <span>{readable(leg.severePct,'%')} arrived 60+ min late · {readable(leg.cancelPct,'%',2)} cancelled</span>
                <small>{number(leg.flights)} historical flights · {coverageDate(leg.periodStart)} – {coverageDate(leg.periodEnd)}</small>
              </div>)}</div>
              <small className="fd-path-verification">Schedule, seats and connection protection: verify with your airline.</small>
            </div>
          </div>)}
        </div>
        <details className="fd-ranking-method"><summary>How these corridors are ordered</summary><p className="fd-note">Lower historical disruption exposure is listed first: the largest leg's 60+ minute arrival-delay percentage plus the largest leg's cancellation percentage. This internal sorting method is not a journey probability, a schedule check or a guarantee of better routing. Samples cover different flights and reporting periods.</p></details>
      </section>}
      {view === 'dna' && report.monthly.length > 0 && <section className="fd-months">
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

    {view === 'connection' && <section className="fd-connection">
      <div className="fd-section-label">
        <div><span className="fd-overline">LAYOVER ENGINE · YOUR ASSUMPTIONS</span>
          <h3>{connection ? 'Your layover at ' + connection : 'Start with your connecting airport'}</h3>
          <p>{connection ? 'Uses your entered layover of ' + (connectionMinutes || 'an unknown number of') + ' minutes, gate-transfer allowance and airline boarding cutoff. The same margin calculation is used in journey readiness.' : 'Add a connecting airport and scheduled layover to calculate your margin. Atlas will not guess either value.'}</p></div>
        <Clock3 size={21}/>
      </div>
      <button type="button" className="fi-inline-action" onClick={onEditConnection}><Clock3 size={17}/>{connection ? 'Edit connecting airport & layover' : 'Add connecting airport & layover'}<ArrowRight size={16}/></button>
      {connection && <div className="fd-buffer-row">
        <span>Allow for terminal / gate transfer</span>
        <select aria-label="Gate-transfer allowance" value={buffer??''} onChange={e=>setBuffer(e.target.value===''?null:Number(e.target.value))}>
          <option value="">Choose a reviewed allowance</option>
          {[25,35,45,60,75].map(value=><option value={value} key={value}>{value} minutes</option>)}
        </select>
        <label>Boarding cutoff before departure (minutes)<input aria-label="Boarding cutoff before departure in minutes" type="number" min="0" max="180" value={boarding??''} onChange={e=>setBoarding(e.target.value===''?null:Number(e.target.value))}/></label>
        <small>Remembered on this device</small>
      </div>}
      {transferScenarios.length > 0 ? <div className="fd-scenarios">
        {transferScenarios.map(row=><div key={row.delay} className={row.remaining===null?'unknown':row.remaining<0?'failed':row.remaining<15?'tight':'roomy'}>
          <span>Inbound arrives {row.delay} min late</span>
          <strong>{row.remaining===null?'Needs allowances':row.remaining < 0 ? Math.abs(row.remaining)+' min short' :
            row.remaining+' min spare'}</strong>
        </div>)}
      </div> : <p className="fd-empty">Enter the connecting layover above to see your margin under different delay scenarios.</p>}
      <p className="fd-note">Supply the transfer time and boarding cutoff you reviewed for this connection. Include applicable baggage, security, border and accessibility processing in your transfer allowance. This is a timing calculation, not a missed-connection probability, an authoritative airline minimum connection time or confirmation of ticket protection.</p>
    </section>}
    {view !== 'connection' && busy && <p className="fd-empty" role="status"><RefreshCw size={18} className="fd-spin"/> Reading independent historical samples. Official records load separately.</p>}
    {view !== 'connection' && !report && !busy && !error && <p className="fd-empty">
      <Database size={21}/> {valid ? 'Choose Analyze flight above, or Analyze historical flights to query this route. Optional operating-airline and flight-number filters narrow the match.' : 'Enter your departure and arrival airports above, then choose Analyze flight. Optional airline and flight-number filters can narrow the historical match.'}
    </p>}
  </section>;
}
