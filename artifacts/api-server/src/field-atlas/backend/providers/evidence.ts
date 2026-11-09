import { createHash } from 'node:crypto';
import { db } from '../runtime/sdk';
import type { Evidence } from '../../shared/travel/types';

export type SourceResult<T> = { evidence: Evidence; data: T | null };
type Parsed<T> = { data: T; observedAt?: string; validFrom?: string; validTo?: string; limitation?: string };
type SourceRequest<T> = {
  provider: string; subject: string; url: string; kind: Evidence['kind']; scope: string;
  ttlMs: number; maxAgeMs: number; version: string; parse: (value: unknown) => Parsed<T> | Promise<Parsed<T>>;
  load?: () => Promise<unknown>;
};
class ProviderFailure extends Error {
  constructor(readonly code: Evidence['failureCode'], message: string) { super(message); }
}
function failureDetail(failure: unknown): { code: Evidence['failureCode']; message: string } {
  if (failure instanceof ProviderFailure) return { code: failure.code, message: failure.message };
  if (failure instanceof Error && ['TimeoutError', 'AbortError'].includes(failure.name)) return { code: 'timeout', message: 'Provider request timed out.' };
  return { code: 'schema', message: 'Provider response did not pass data or timestamp validation; current status is unknown.' };
}
const pending = new Map<string, Promise<SourceResult<unknown>>>();
const table = 'atlas_public_evidence_v1';

export function sourceId(provider: string, subject: string) { return createHash('sha256').update(provider + ':' + subject).digest('hex'); }
export function dated(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
export function evidenceState(evidence: Evidence, now = Date.now()): Evidence['state'] {
  if (evidence.state === 'unavailable' || evidence.state === 'reference') return evidence.state;
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) <= now) return 'stale';
  if (evidence.validTo && Date.parse(evidence.validTo) <= now) return 'stale';
  return evidence.state;
}
function currentEvidence(evidence: Evidence, now = Date.now()): Evidence {
  const state = evidenceState(evidence, now);
  const limitation = state === 'stale' && !/current status is unknown/i.test(evidence.limitation)
    ? evidence.limitation + ' Current status is unknown because the evidence is stale.'
    : evidence.limitation;
  return { ...evidence, state, limitation };
}
const inFlightJson = new Map<string, Promise<unknown>>();
export async function officialRequest(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json, application/geo+json', 'User-Agent': 'FieldSalesAtlas/2.0 (https://github.com/Thordadpool5413/FieldSalesAtlasChatGPT)', ...init.headers }, signal: AbortSignal.timeout(8500) }).catch((failure: unknown) => {
    const timeout = failure instanceof Error && ['TimeoutError', 'AbortError'].includes(failure.name);
    throw new ProviderFailure(timeout ? 'timeout' : 'network', timeout ? 'Provider request timed out.' : 'Provider network request failed.');
  });
  if (!response.ok) throw new ProviderFailure([401,403].includes(response.status) ? 'access-denied' : response.status === 429 ? 'rate-limited' : 'http', 'Provider returned HTTP ' + response.status + '.');
  if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Provider response exceeds limit.');
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('Provider response exceeds limit.');
  return JSON.parse(text);
}
export function officialJson(url: string): Promise<unknown> {
  const running = inFlightJson.get(url);
  if (running) return running;
  const work = officialRequest(url).finally(() => inFlightJson.delete(url));
  inFlightJson.set(url, work);
  return work;
}
export async function source<T>(request: SourceRequest<T>): Promise<SourceResult<T>> {
  const id = sourceId(request.provider, request.subject + ':' + request.version + ':' + request.url);
  const [saved] = await db.get<{ id: string; result: SourceResult<T>; retryAfter: string }>(table, [id]);
  if (saved && Date.parse(saved.retryAfter) > Date.now()) return { data: saved.result.data, evidence: currentEvidence(saved.result.evidence) };
  const running = pending.get(id);
  if (running) return running as Promise<SourceResult<T>>;
  const work = (async (): Promise<SourceResult<T>> => {
    const now = new Date().toISOString();
    let result: SourceResult<T>;
    try {
      const parsed = await request.parse(await (request.load ? request.load() : officialJson(request.url)));
      const issueTime = parsed.observedAt ? Date.parse(parsed.observedAt) : NaN;
      const sourceTimeValid = Number.isFinite(issueTime) && issueTime <= Date.now() + 300000 && Date.now() - issueTime <= request.maxAgeMs;
      const expiresAt = new Date(Math.min(Date.now() + request.ttlMs, Number.isFinite(issueTime) ? issueTime + request.maxAgeMs : Infinity, parsed.validTo ? Date.parse(parsed.validTo) : Infinity)).toISOString();
      const staleLimitation = !sourceTimeValid && parsed.observedAt ? ' The source timestamp is outside the accepted freshness window; current status is unknown.' : '';
      const evidence: Evidence = { id, provider: request.provider, subject: request.subject, sourceUrl: request.url,
        kind: request.kind, state: sourceTimeValid ? 'current' : parsed.observedAt ? 'stale' : 'partial', retrievedAt: now,
        observedAt: parsed.observedAt, validFrom: parsed.validFrom, validTo: parsed.validTo, expiresAt,
        version: request.version, scope: request.scope, limitation: (parsed.limitation || (!parsed.observedAt ? 'The source did not provide a usable issue/observation time.' : '')) + staleLimitation };
      evidence.state = evidenceState(evidence);
      result = { data: parsed.data, evidence };
    } catch (failure) {
      const detail = failureDetail(failure);
      result = saved?.result.data ? { data: saved.result.data, evidence: { ...saved.result.evidence, state: 'stale', failureCode: detail.code, limitation: saved.result.evidence.limitation + ' ' + detail.message + ' Current status is unknown; showing the last validated snapshot.' } } : {
        data: null, evidence: { id, provider: request.provider, subject: request.subject, sourceUrl: request.url, kind: request.kind,
          state: 'unavailable', failureCode: detail.code, retrievedAt: now, version: request.version, scope: request.scope,
          limitation: detail.message + ' Current status is unknown. No current-data conclusion is available.' },
      };
    }
    const retryMs = result.evidence.state === 'current' ? request.ttlMs : 60000;
    await db.tx.update(table, [{ id, record: { result, retryAfter: new Date(Date.now() + retryMs).toISOString(), lastAttemptAt: now } }]);
    return result;
  })().finally(() => pending.delete(id));
  pending.set(id, work as Promise<SourceResult<unknown>>);
  return work;
}

export async function sourceStatuses() {
  const latest = new Map<string, Evidence & { lastAttemptAt: string }>();
  let nextToken: string | undefined;
  do {
    const result = await db.list<{ result: SourceResult<unknown>; lastAttemptAt: string }>(table, { limit: 1000, nextToken });
    for (const row of result.items) {
      const evidence = currentEvidence(row.result.evidence);
      // Routing evidence contains private journey coordinates. Never enumerate it
      // in the shared diagnostics returned to other workspaces.
      if (evidence.kind === 'estimate') continue;
      const key = evidence.provider + '\0' + evidence.subject;
      if (!latest.has(key) || latest.get(key)!.lastAttemptAt < row.lastAttemptAt) latest.set(key, { ...evidence, lastAttemptAt: row.lastAttemptAt });
    }
    nextToken = result.nextToken;
  } while (nextToken);
  return [...latest.values()].sort((a, b) => (a.provider + a.subject).localeCompare(b.provider + b.subject));
}
