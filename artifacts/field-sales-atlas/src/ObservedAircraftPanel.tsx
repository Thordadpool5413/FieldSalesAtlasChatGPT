import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, LocateFixed, Radar, RotateCw } from 'lucide-react';
import { api } from './workspaceApi';
import './ObservedAircraftPanel.css';

type AirportOption = { code: string; name: string };
type AircraftObservation = {
  hex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  onGround: boolean;
  groundSpeedKnots: number | null;
  trackDegrees: number | null;
  lastPositionSeconds: number | null;
  distanceNm: number;
};
type AircraftResponse = {
  airport: string;
  airportName: string;
  latitude: number;
  longitude: number;
  radiusNm: number;
  available: boolean;
  checkedAt: string;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  message: string;
  aircraft: AircraftObservation[];
  evidence: {
    state: 'current' | 'partial' | 'stale' | 'unavailable' | 'reference';
    retrievedAt: string;
    observedAt?: string;
    limitation: string;
  };
};

type PanelState = 'idle' | 'loading' | 'error' | 'unavailable' | 'empty' | 'stale' | 'partial' | 'success';

function formatTime(value?: string) {
  if (!value) return 'Time not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Timestamp unavailable'
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shortAge(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return 'Age unavailable';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} sec before check`;
  return `${Math.round(seconds / 60)} min before check`;
}

function isProductionDisabled(message: string) {
  return /production.{0,24}(disabled|off)|disabled.{0,24}production|not enabled in production/i.test(message);
}

export default function ObservedAircraftPanel({
  airports, autoCheckToken = 0
}: { airports: AirportOption[]; autoCheckToken?: number }) {
  const [selectedCode, setSelectedCode] = useState(airports[0]?.code || '');
  const [result, setResult] = useState<AircraftResponse | null>(null);
  const [state, setState] = useState<PanelState>('idle');
  const [error, setError] = useState('');
  const lastAutoCheck = useRef(0);

  useEffect(() => {
    if (!airports.some(airport => airport.code === selectedCode)) {
      setSelectedCode(airports[0]?.code || '');
      setResult(null);
      setState('idle');
      setError('');
    }
  }, [airports, selectedCode]);

  const aircraft = useMemo(() => result?.aircraft || [], [result]);
  const selectedAirport = airports.find(airport => airport.code === selectedCode);

  async function fetchObservations() {
    if (!selectedCode || state === 'loading') return;
    setState('loading');
    setError('');
    setResult(null);
    try {
      const response = await api.get('/api/travel/live-aircraft?airport=' + encodeURIComponent(selectedCode));
      const data = response.data as AircraftResponse;
      setResult(data);
      if (data.evidence.state === 'stale') {
        setState('stale');
      } else if (data.evidence.state === 'partial') {
        setState('partial');
      } else if (!data.available || data.evidence.state === 'unavailable' || data.evidence.state === 'reference') {
        setState('unavailable');
      } else if (data.aircraft.length === 0) {
        setState('empty');
      } else {
        setState('success');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The observation service could not be reached.');
      setState('error');
    }
  }

  useEffect(() => {
    if (autoCheckToken < 1 || autoCheckToken === lastAutoCheck.current ||
      state === 'loading' || !selectedCode ||
      !airports.some(airport => airport.code === selectedCode)) return;
    lastAutoCheck.current = autoCheckToken;
    void fetchObservations();
  }, [airports, autoCheckToken, selectedCode, state]);

  const statusText = state === 'idle' ? 'Ready when you are'
    : state === 'loading' ? 'Checking community observations'
      : state === 'error' ? 'Source could not be reached'
        : state === 'unavailable' ? 'Source unavailable'
          : state === 'empty' ? 'No aircraft in range'
            : state === 'stale' ? 'Stale observations'
              : state === 'partial' ? 'Partial evidence'
                : 'Observations available';

  const plotted = useMemo(() => aircraft.filter(item =>
    Number.isFinite(item.lat) && Number.isFinite(item.lon)
  ).map(item => {
    const latitudeScale = 60;
    const longitudeScale = 60 * Math.max(0.15, Math.cos((result?.latitude || 0) * Math.PI / 180));
    const eastNm = (item.lon - (result?.longitude || 0)) * longitudeScale;
    const northNm = (item.lat - (result?.latitude || 0)) * latitudeScale;
    return { item, x: 160 + (eastNm / 25) * 128, y: 160 - (northNm / 25) * 128 };
  }), [aircraft, result]);

  return <section className="oap-panel" aria-labelledby="oap-title" data-testid="observed-aircraft-panel">
    <header className="oap-header">
      <div className="oap-heading">
        <span className="oap-kicker"><Radar size={15} aria-hidden="true" /> FIELD OBSERVATIONS / ADS-B</span>
        <h2 id="oap-title">Aircraft nearby</h2>
        <p>Live community ADS-B positions around a route airport. This is not airline flight status.</p>
      </div>
      <div className={'oap-status oap-status-' + state} data-testid="status-aircraft-observations" role="status">
        <span aria-hidden="true" />
        {statusText}
      </div>
    </header>

    <div className="oap-controls">
      <label htmlFor="oap-airport">Route airport</label>
      <div className="oap-control-row">
        <select id="oap-airport" data-testid="select-observation-airport" value={selectedCode}
          onChange={event => {
            setSelectedCode(event.target.value);
            setResult(null);
            setError('');
            setState('idle');
          }} disabled={!airports.length || state === 'loading'}>
          {airports.length ? airports.map(airport =>
            <option value={airport.code} key={airport.code}>{airport.code} — {airport.name}</option>
          ) : <option value="">No route airports available</option>}
        </select>
        <button type="button" className="oap-fetch" data-testid="button-fetch-aircraft"
          onClick={fetchObservations} disabled={!selectedCode || state === 'loading'}>
          {state === 'loading' ? <Activity size={16} aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
          {state === 'loading' ? 'Checking…' : 'Check observations'}
        </button>
      </div>
      <p className="oap-control-note">Analyze flight requests one live snapshot for the selected airport. Use Check observations to refresh; no background polling.</p>
    </div>

    {state === 'idle' && <div className="oap-idle" data-testid="state-aircraft-idle">
      <div className="oap-idle-mark" aria-hidden="true"><Radar size={22} /></div>
      <div><strong>Evidence starts with your check.</strong>
        <p>Select an airport, then request a single snapshot of positions reported within the coverage area.</p>
      </div>
    </div>}

    {state === 'loading' && <div className="oap-loading" data-testid="state-aircraft-loading" aria-label="Loading aircraft observations">
      <div className="oap-skeleton oap-skeleton-map" />
      <div className="oap-skeleton-lines"><i /><i /><i /></div>
    </div>}

    {state === 'error' && <div className="oap-message oap-message-warning" data-testid="state-aircraft-error" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <div><strong>Could not retrieve observations.</strong><p>{error}</p></div>
      <button type="button" data-testid="button-retry-aircraft" onClick={fetchObservations}><RotateCw size={15} /> Retry</button>
    </div>}

    {result && <div className="oap-meta" data-testid="aircraft-evidence-meta">
      <div><span>Selected airport</span><strong>{result.airport} <em>{result.airportName || selectedAirport?.name}</em></strong></div>
      <div><span>Source</span><strong>{result.source || 'Source not specified'}</strong></div>
      <div><span>Source time</span><strong>{formatTime(result.evidence.observedAt)}<em>Checked {formatTime(result.checkedAt || result.evidence.retrievedAt)}</em></strong></div>
      <div><span>Coverage radius</span><strong>{result.radiusNm} nautical miles</strong></div>
    </div>}

    {state === 'unavailable' && <div className="oap-message oap-message-warning" data-testid="state-aircraft-unavailable" role="status">
      <AlertTriangle size={18} aria-hidden="true" />
      <div><strong>{result?.message && isProductionDisabled(result.message) ? 'Live source disabled in this environment' : 'Live observations unavailable'}</strong>
        <p>{result?.message || result?.evidence.limitation || 'The source did not provide current observations.'}</p>
      </div>
    </div>}
    {state === 'unavailable' && result && <footer className="oap-attribution" data-testid="text-aircraft-attribution">
      <span>{result.attribution || 'Source attribution unavailable'}</span>
      {result.sourceUrl && <a href={result.sourceUrl} target="_blank" rel="noreferrer" data-testid="link-aircraft-source">Source details</a>}
      <span>{result.license || 'License information unavailable'}</span>
    </footer>}

    {(state === 'success' || state === 'empty' || state === 'stale' || state === 'partial') && result && <>
      {(state === 'stale' || state === 'partial') && <div className="oap-message oap-message-caution" data-testid={'state-aircraft-' + state} role="status">
        <AlertTriangle size={17} aria-hidden="true" />
        <div><strong>{state === 'stale' ? 'These observations may be out of date.' : 'Coverage is incomplete.'}</strong>
          <p>{result.evidence.limitation || result.message || 'Use this as limited evidence, not a complete view.'}</p>
        </div>
      </div>}

      {state === 'empty' && <div className="oap-message oap-message-empty" data-testid="state-aircraft-empty" role="status">
        <Radar size={19} aria-hidden="true" />
        <div><strong>No aircraft were returned within this source’s coverage.</strong>
          <p>{result.message || 'No positions were observed in the checked radius. Missing observations do not establish that the airspace is empty.'}</p>
        </div>
      </div>}

      {aircraft.length > 0 && <div className="oap-results">
        <div className="oap-plot-wrap">
          <div className="oap-plot-heading">
            <div><span className="oap-kicker">LOCAL POSITION PLOT</span><strong>{result.airport} · {aircraft.length} reported {aircraft.length === 1 ? 'aircraft' : 'aircraft'}</strong></div>
            <span className="oap-plot-scale">25 NM range</span>
          </div>
          <svg className="oap-plot" viewBox="0 0 320 320" role="img"
            aria-label={`Geographic plot centered on ${result.airport}, showing ${aircraft.length} community ADS-B positions within approximately 25 nautical miles`}
            data-testid="plot-aircraft-observations">
            <defs>
              <pattern id="oap-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeOpacity=".09" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="320" height="320" fill="url(#oap-grid)" />
            <circle cx="160" cy="160" r="128" className="oap-range-ring" />
            <circle cx="160" cy="160" r="64" className="oap-inner-ring" />
            <path d="M160 20v280M20 160h280" className="oap-crosshair" />
            <text x="160" y="25" textAnchor="middle" className="oap-map-label">N</text>
            <text x="160" y="304" textAnchor="middle" className="oap-map-label">25 NM</text>
            <g className="oap-airport-dot"><circle cx="160" cy="160" r="6" /><path d="M153 160h14M160 153v14" /></g>
            <text x="169" y="176" className="oap-map-label">{result.airport}</text>
            {plotted.map(({ item, x, y }) => <g key={item.hex + item.lat + item.lon}
              className="oap-aircraft-point" data-testid={'plot-aircraft-' + item.hex}>
              <circle cx={x} cy={y} r="5.5" />
              <path d={`M${x - 3} ${y + 2}l3 -6 3 6z`} transform={`rotate(${item.trackDegrees || 0} ${x} ${y})`} />
              <title>{[item.callsign, item.registration, item.distanceNm.toFixed(1) + ' nautical miles'].filter(Boolean).join(' · ')}</title>
            </g>)}
          </svg>
          <p className="oap-plot-footnote">Positions are plotted relative to the airport; the 25 nm ring is a distance reference, not a boundary of observed traffic.</p>
        </div>

        <div className="oap-aircraft-list" data-testid="list-aircraft-observations">
          <h3>Reported positions <span>{aircraft.length}</span></h3>
          <ul aria-label="Community ADS-B aircraft observations">
            {aircraft.map((item, index) => <li key={item.hex + '-' + index} data-testid={'aircraft-observation-' + item.hex}>
              <span className="oap-list-index">{String(index + 1).padStart(2, '0')}</span>
              <div className="oap-aircraft-primary">
                <strong>{item.callsign || item.registration || 'Callsign not provided'}</strong>
                <span>{[item.registration, item.aircraftType, item.hex.toUpperCase()].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="oap-aircraft-detail">
                <strong>{item.onGround ? 'Ground position' : item.altitudeFt === null ? 'Altitude unavailable' : `${item.altitudeFt.toLocaleString()} ft`}</strong>
                <span>{item.distanceNm.toFixed(1)} nm · {shortAge(item.lastPositionSeconds)}</span>
              </div>
            </li>)}
          </ul>
        </div>
      </div>}

      <footer className="oap-attribution" data-testid="text-aircraft-attribution">
        <span>{result.attribution || 'Source attribution unavailable'}</span>
        {result.sourceUrl && <a href={result.sourceUrl} target="_blank" rel="noreferrer" data-testid="link-aircraft-source">Source details</a>}
        <span>{result.license || 'License information unavailable'}</span>
      </footer>
    </>}
    <p className="oap-disclaimer" data-testid="text-aircraft-disclaimer">
      Callsigns and positions are community ADS-B observations. They cannot confirm a particular flight’s status, scheduled route, arrival, cancellation, delay, or booking.
    </p>
  </section>;
}
