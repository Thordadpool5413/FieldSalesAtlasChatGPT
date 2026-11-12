import { z } from 'zod';

const minutes = z.number().finite().min(0).max(1440);
const stamp = z.string().datetime({ offset: true });
const queue = z.enum(['standard', 'precheck']);
export const securityHistorySchema = z.object({
  state: z.enum(['historical', 'stale', 'unavailable']).optional(),
  lastAttemptAt: stamp.optional(),
  archive: z.object({ sourceUrl: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/i), retrievedAt: stamp, revision: z.string().regex(/^[a-f0-9]{40}$/i) }).optional(),
  available: z.boolean(), checkedAt: stamp, airport: z.string().regex(/^[A-Z]{3}$/),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), localHour: z.number().int().min(0).max(23),
  etHour: z.number().int().min(0).max(23).nullable(), etWeekday: z.number().int().min(0).max(6).nullable(), timezone: z.string(),
  rows: z.array(z.object({ terminal: z.string(), queue, hourRecords: z.number().int().positive(),
    historicalMedianPosted: minutes, typicalHourlyP75: minutes, typicalHourlyP95: minutes.nullable(),
    p95Records: z.number().int().nonnegative().optional(),
    observedStart: stamp, observedEnd: stamp,
  // P95 can cover fewer hourly records than P50/P75. Comparing these medians
  // for monotonicity would reject a valid archive with missing P95 values.
  }).refine(row => row.typicalHourlyP75 >= row.historicalMedianPosted && (row.p95Records === undefined || row.p95Records <= row.hourRecords && (row.p95Records === 0 ? row.typicalHourlyP95 === null : row.typicalHourlyP95 !== null)) && Date.parse(row.observedEnd) >= Date.parse(row.observedStart) && Date.parse(row.observedEnd) <= Date.now() + 300000)),
  requestedQueues: z.array(queue), limitations: z.array(z.string()),
  source: z.string(), sourceUrl: z.string().url(), attribution: z.string(), license: z.string(), message: z.string(),
}).refine(report => Date.parse(report.checkedAt) <= Date.now() + 300000 && (!report.available || report.rows.length > 0));
export type SecurityHistoryReport = z.infer<typeof securityHistorySchema>;
