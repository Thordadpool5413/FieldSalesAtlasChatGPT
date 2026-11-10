import { useEffect, useId, useState } from 'react';
import type { Evidence } from '../shared/travel/types';
import { describeEvidence } from '../shared/travel/evidence';
import './TravelEvidence.css';

export function EvidenceLinks({ ids, evidence }: { ids: string[]; evidence: Evidence[] }) {
  return <span className="travel-citations" aria-label="Supporting evidence">{[...new Set(ids)].map(id => {
    const index = evidence.findIndex(item => item.id === id);
    return index >= 0 ? <button type="button" key={id} aria-label={'Evidence ' + (index + 1) + ': ' + evidence[index].provider} onClick={event => {
      // More than one report may be visible. Resolve citations within their nearest
      // containing report instead of targeting another panel's duplicate source ID.
      let scope: Element | null = event.currentTarget.parentElement, node: HTMLElement | undefined;
      while(scope && !node){
        node=Array.from(scope.querySelectorAll<HTMLElement>('[data-travel-evidence-id]')).find(item=>item.dataset.travelEvidenceId===id);
        scope=scope.parentElement;
      }
      for (let parent = node?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
      node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }}>[{index + 1}]</button> : null;
  })}</span>;
}
export default function TravelEvidence({ evidence }: { evidence: Evidence[] }) {
  const instanceId=useId();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  return <div className="travel-evidence-grid">{evidence.map((item, index) => {
    const detail = describeEvidence(item, now);
    return <article className="journey-source" tabIndex={-1} key={item.id} data-travel-evidence-id={item.id} id={instanceId + '-travel-evidence-' + encodeURIComponent(item.id)}>
      <div><strong>[{index + 1}] {item.provider}</strong><span className={'journey-state state-' + detail.state}>{detail.state}</span></div>
      <p>{item.subject}</p><small>{item.kind === 'traveler' ? 'Supplied/imported fields: ' : 'Retrieval: '}{detail.label(detail.retrievalAgeMinutes)}</small>
      {item.kind !== 'traveler' && <small>Source observation/issue: {detail.label(detail.observationAgeMinutes)}</small>}
      {item.kind === 'traveler' && item.observedAt && <small>Traveler-reported check: {detail.label(detail.observationAgeMinutes)}</small>}
      {item.validFrom && <small>Coverage begins {item.validFrom}</small>}{item.validTo && <small>Valid through {item.validTo}</small>}
      {item.failureCode&&<small>Latest check issue: {item.failureCode.replaceAll('-', ' ')}</small>}<p>{item.scope}</p><p>{item.limitation}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">View source</a>}
    </article>;
  })}</div>;
}
