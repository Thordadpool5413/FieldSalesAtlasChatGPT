import { useEffect, useState } from 'react';
import { officialHistorySchema, type OfficialHistory } from './FlightHistoryData';
import TravelEvidence from './TravelEvidence';
import { api } from './workspaceApi';

export type OfficialHistoryLeg = { origin: string; destination: string; result?: OfficialHistory; error?: string };
const percent = (value: number | null) => value === null ? 'Insufficient evidence' :
  new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(value);

export default function OfficialFlightHistory({ origin, destination, connection, carrier, flightNumber, analysisToken, onAnalyzed }: {
  origin: string; destination: string; connection: string; carrier: string; flightNumber: string; analysisToken: number;
  onAnalyzed?: (legs: OfficialHistoryLeg[] | null) => void;
}) {
  const [state, setState] = useState<{ key: string; busy: boolean; legs: OfficialHistoryLeg[] } | null>(null);
  const key = [origin, destination, connection, carrier, flightNumber, analysisToken].join('|');
  useEffect(() => {
    onAnalyzed?.(null);
    if (!analysisToken || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return;
    let active = true;
    setState({ key, busy: true, legs: [] });
    const codes = [origin, connection, destination].filter(Boolean);
    void Promise.all(codes.slice(0, -1).map(async (from, index): Promise<OfficialHistoryLeg> => {
      const to = codes[index + 1];
      const params = new URLSearchParams({ origin: from, destination: to });
      // The supplied operating carrier/number applies only to the first leg.
      if (index === 0 && carrier) params.set('carrier', carrier);
      if (index === 0 && flightNumber) params.set('flightNumber', flightNumber);
      try {
        const parsed = officialHistorySchema.safeParse((await api.get('/api/travel/history?' + params)).data);
        return parsed.success ? { origin: from, destination: to, result: parsed.data }
          : { origin: from, destination: to, error: 'The official-history response is incomplete or incompatible. Restart the API from the current build and retry. No official rate was assigned.' };
      }
      catch { return { origin: from, destination: to, error: 'Official records could not be read. No rate was assigned.' }; }
    })).then(legs => { if (active) { setState({ key, busy: false, legs }); onAnalyzed?.(legs); } });
    return () => { active = false; };
  }, [key, analysisToken, origin, destination, connection, carrier, flightNumber, onAnalyzed]);
  if (!analysisToken || !state || state.key !== key) return null;
  return <section className="fd-official-history" aria-label="Official BTS route history">
    <h3>Official BTS records for this route</h3>
    <p>Imported U.S. reporting-carrier history. Kept separate from the independent aggregates below; sample sizes and rates are never combined.</p>
    {state.busy ? <p role="status">Reading installed official records…</p> : state.legs.map(leg => <article className="fd-metric-card" key={leg.origin + leg.destination}>
      <h4>{leg.origin} → {leg.destination}</h4>
      {leg.error ? <p role="alert">{leg.error}</p> : leg.result ? <>
        {leg.result.summary ? <>
          <p>{leg.result.summary.sampleSize.toLocaleString()} matching records · {leg.result.summary.outcomeSampleSize.toLocaleString()} eligible arrival outcomes · {leg.result.summary.cancellationSampleSize.toLocaleString()} known cancellation outcomes.</p>
          <dl className="journey-costs"><div><dt>Observed on-time rate</dt><dd>{percent(leg.result.summary.onTimeRate)}</dd></div>
            <div><dt>Observed cancellation rate</dt><dd>{percent(leg.result.summary.cancellationRate)}</dd></div>
            <div><dt>90th-percentile arrival delay</dt><dd>{leg.result.summary.p90ArrivalDelayMinutes === null ? 'Insufficient evidence' : leg.result.summary.p90ArrivalDelayMinutes + ' min'}</dd></div></dl>
          <p>{leg.result.summary.definition}</p>
        </> : <p>No official monthly history is installed. No reliability score was assigned.</p>}
        <p>Reporting months: {leg.result.coverage.periods.map(period => period.period).join(', ') || 'None'}. Historical outcomes do not predict your flight or establish current service.</p>
        <details className="journey-details"><summary>Official history source, age and limitations</summary><TravelEvidence evidence={[leg.result.evidence]}/></details>
      </> : null}
    </article>)}
  </section>;
}
