import type { AirportProduct } from '../shared/travel/airportBrief';
import { describeEvidence } from '../shared/travel/evidence';
import './RegionalAirportWeather.css';

export default function RegionalAirportWeather({ products }: { products: AirportProduct[] }) {
  return <section className="regional-airport-weather" aria-label="Canadian regional weather">{products.map(product => {
    const state = describeEvidence(product.evidence).state;
    const current = state === 'current';
    return <div className="fr-evidence" key={product.evidence.id}>
      <div className="fr-evidence-label">{product.evidence.provider} · {state}</div>
      <p>{product.evidence.limitation}</p>
      {current && product.data?.length ? <details className="fr-forecast" open={product.evidence.provider === 'ECCC Weather Alerts'}>
        <summary>{product.evidence.kind === 'forecast' ? 'Read published regional forecast' : 'Read regional observations and warnings'}</summary>
        {product.data.map((signal, index) => <div key={index}><strong>{signal.title}</strong><p>{signal.detail}</p>
          {signal.validFrom && <small>From {signal.validFrom}</small>}{signal.validTo && <small>Through {signal.validTo}</small>}
        </div>)}
      </details> : !current ? <strong>Current coverage unverified. Recheck this source.</strong> : null}
    </div>;
  })}</section>;
}
