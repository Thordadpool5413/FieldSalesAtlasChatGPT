import { useState } from 'react';
import { api } from './workspaceApi';

type Result = { state: string; coverage: { limitation: string; periods: Array<{ period: string; sourceUrl: string }> }; summary: null | {
  sampleSize: number; outcomeSampleSize: number; cancellationSampleSize: number; cancelled: number; diverted: number;
  cancellationRate: number | null; onTimeRate: number | null; medianArrivalDelayMinutes: number | null; p90ArrivalDelayMinutes: number | null; definition: string;
} };
const percent = (value: number | null) => value === null ? 'Insufficient evidence' : new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(value);
export default function HistoricalRouteCheck() {
  const [origin, setOrigin] = useState(''), [destination, setDestination] = useState(''), [carrier, setCarrier] = useState(''), [flightNumber, setFlight] = useState('');
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <details className="journey-details journey-history"><summary>Learn from observed flight history</summary><p>Check imported U.S. DOT/BTS reporting-carrier records. Historical outcomes describe the covered sample; they do not establish today’s schedule or predict your flight.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setResult(null);
      try { setResult((await api.get('/api/travel/history?' + new URLSearchParams({ origin, destination, carrier, flightNumber }))).data); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not check history.'); }
      finally { setBusy(false); }
    }}><div className="journey-fields"><label>History origin<input required pattern="[A-Z]{3}" maxLength={3} value={origin} onChange={event => setOrigin(event.target.value.toUpperCase())}/></label><label>History destination<input required pattern="[A-Z]{3}" maxLength={3} value={destination} onChange={event => setDestination(event.target.value.toUpperCase())}/></label><label>Carrier (optional)<input pattern="[A-Z0-9]{2}" maxLength={2} value={carrier} onChange={event => setCarrier(event.target.value.toUpperCase())}/></label><label>Flight number (optional)<input inputMode="numeric" pattern="[0-9]{1,4}" maxLength={4} value={flightNumber} onChange={event => setFlight(event.target.value)}/></label></div><button className="op-btn" disabled={busy}>{busy ? 'Checking…' : 'Check observed history'}</button></form>
    {error && <p role="alert">{error}</p>}{result && <div role="status"><p>{result.coverage.limitation}</p>{result.summary ? <><p>{result.summary.sampleSize} matching records · {result.summary.outcomeSampleSize} eligible arrival outcomes · {result.summary.cancelled} cancellations · {result.summary.diverted} diversions.</p><dl className="journey-costs"><div><dt>Observed on-time rate</dt><dd>{percent(result.summary.onTimeRate)}</dd></div><div><dt>Observed cancellation rate</dt><dd>{percent(result.summary.cancellationRate)}</dd></div><div><dt>90th-percentile arrival delay</dt><dd>{result.summary.p90ArrivalDelayMinutes === null ? 'Insufficient evidence' : `${result.summary.p90ArrivalDelayMinutes} min`}</dd></div></dl><p>{result.summary.definition}</p></> : <p>No history is available for this check. No reliability score was assigned.</p>}{!!result.coverage.periods.length && <p>Reporting months: {result.coverage.periods.map(period => period.period).join(', ')}</p>}</div>}
  </details>;
}
