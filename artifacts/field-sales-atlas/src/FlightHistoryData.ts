import { z } from 'zod';

// Validate the data used by the UI before assigning rates or rendering sources.
// An older API build or a malformed response must leave one source unavailable,
// rather than taking the entire travel page down.
const rate = z.number().min(0).max(100).nullable();
const count = z.number().int().nonnegative();
const metric = z.object({
  basis: z.enum(['flight number', 'route', 'airport']), label: z.string(),
  origin: z.string(), destination: z.string(), carrier: z.string(), flightNumber: z.string(),
  flights: count, onTimePct: rate, cancelPct: rate, severePct: rate,
  avgArrivalDelay: z.number().nullable(), medianArrivalDelay: z.number().nullable(),
  departureOnTimePct: rate, periodStart: z.string(), periodEnd: z.string(),
});
const leg = z.object({ origin: z.string(), destination: z.string(), match: metric.nullable(), route: metric.nullable(), airportBaseline: metric.nullable(), note: z.string() });
export const flightHistorySchema = z.object({
  available: z.boolean(), checkedAt: z.string(), source: z.string(), sourceUrl: z.string(), attribution: z.string(), license: z.string(),
  period: z.object({ start: z.string(), end: z.string() }).nullable(),
  sources: z.array(z.object({ name: z.string(), available: z.boolean(), records: count, periodEnd: z.string() })),
  legs: z.array(leg), alternatePaths: z.array(z.object({ connection: z.string(), legs: z.array(metric), index: z.number(), description: z.string() })),
  alternateArrival: leg.nullable(), selectedMonth: z.string(),
  monthly: z.array(z.object({ month: z.string(), flights: count, onTimePct: rate, cancelPct: rate })), notes: z.array(z.string()),
});
export type DnaResponse = z.infer<typeof flightHistorySchema>;
export type DnaStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const evidence = z.object({
  id: z.string(), provider: z.string(), subject: z.string(), sourceUrl: z.string(),
  kind: z.enum(['observation', 'forecast', 'reference', 'historical', 'estimate', 'traveler']),
  state: z.enum(['current', 'stale', 'unavailable', 'partial', 'reference']),
  retrievedAt: z.string(), observedAt: z.string().optional(), validFrom: z.string().optional(), validTo: z.string().optional(), expiresAt: z.string().optional(),
  version: z.string(), scope: z.string(), limitation: z.string(),
  failureCode: z.enum(['timeout', 'network', 'access-denied', 'rate-limited', 'http', 'schema']).optional(),
});
export const officialHistorySchema = z.object({
  state: z.enum(['historical', 'sparse', 'unavailable']),
  coverage: z.object({ periods: z.array(z.object({ period: z.string() })) }), evidence,
  summary: z.object({
    sampleSize: count, outcomeSampleSize: count, cancellationSampleSize: count,
    onTimeRate: z.number().min(0).max(1).nullable(), cancellationRate: z.number().min(0).max(1).nullable(),
    p90ArrivalDelayMinutes: z.number().nullable(), definition: z.string(),
  }).nullable(),
});
export type OfficialHistory = z.infer<typeof officialHistorySchema>;
