import { z } from 'zod';
const stamp = z.iso.datetime().refine(value => Date.parse(value) <= Date.now() + 300000, 'Check time cannot be in the future.');
export const flightReviewSchema = z.object({ fieldsReviewedAt: stamp.optional(), ticketingConfirmedAt: stamp.optional(), airlineCheckedAt: stamp.optional() });
export const connectionSchema = z.object({
  transferMinutes: z.number().int().min(0).max(720).optional(), boardingCutoffMinutes: z.number().int().min(0).max(180).optional(),
  ticketRelation: z.enum(['unknown', 'same-ticket-reported', 'separate-tickets']).optional(),
});
export const journeyRequirementsSchema = z.object({ trainers: z.array(z.object({
  trainerId: z.enum(['trainer_a', 'trainer_b']),
  transport: z.enum(['unknown', 'independent', 'shared-arranged', 'shared-needs-review']).default('unknown'),
  equipment: z.enum(['unknown', 'ready', 'shared-arranged', 'shared-needs-review']).default('unknown'),
  pickup: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: z.string().max(80), processingMinutes: z.number().int().min(0).max(720) }).optional(),
})).max(2).refine(rows => new Set(rows.map(row => row.trainerId)).size === rows.length, 'Each trainer can appear only once.') });
