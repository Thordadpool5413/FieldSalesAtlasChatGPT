import { describeEvidence } from '../shared/travel/evidence';
import type { Evidence } from '../shared/travel/types';

export type AnalysisSnapshot<T> = { context: string; result: T };
export function currentAnalysisResult<T>(snapshot: AnalysisSnapshot<T> | null, context: string,
  evidence: Evidence[] = [], expiresAt?: string, now = Date.now()): T | null {
  if (!snapshot || snapshot.context !== context) return null;
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now)) return null;
  if (evidence.some(item => item.state === 'current' && describeEvidence(item, now).state !== 'current')) return null;
  return snapshot.result;
}
