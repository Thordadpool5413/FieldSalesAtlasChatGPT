import type { Evidence } from './types';

export function describeEvidence(item: Evidence, now = Date.now()) {
  const age = (value?: string) => { const ms = value ? Date.parse(value) : NaN; return Number.isFinite(ms) && ms <= now + 300000 ? Math.max(0, Math.floor((now - ms) / 60000)) : null; };
  const expired = [item.expiresAt, ...(item.kind === 'forecast' ? [item.validTo] : [])].some(value => value && Date.parse(value) <= now);
  const state = !['reference', 'unavailable'].includes(item.state) && expired ? 'stale' : item.state;
  return { state, observationAgeMinutes: age(item.observedAt), retrievalAgeMinutes: age(item.retrievedAt),
    label: (minutes: number | null) => minutes === null ? 'Age unknown' : minutes < 1 ? 'Under a minute old' : minutes < 60 ? `${minutes} min old` : minutes < 1440 ? `${Math.floor(minutes / 60)} h old` : `${Math.floor(minutes / 1440)} days old` };
}
