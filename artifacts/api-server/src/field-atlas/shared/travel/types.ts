import type { FlightReview, ConnectionRequirements } from './readiness';
export type EvidenceState = 'current' | 'stale' | 'unavailable' | 'partial' | 'reference';
export type Evidence = {
  failureCode?: 'timeout' | 'network' | 'access-denied' | 'rate-limited' | 'http' | 'schema';
  id: string; provider: string; subject: string; sourceUrl: string;
  kind: 'observation' | 'forecast' | 'reference' | 'historical' | 'estimate' | 'traveler';
  state: EvidenceState; retrievedAt: string; observedAt?: string; validFrom?: string; validTo?: string;
  expiresAt?: string; version: string; scope: string; limitation: string;
};
export type Point = { id: string; name: string; lat: number; lon: number; timeZone?: string };
export type FlightInput = {
  trainerId: 'trainer_a' | 'trainer_b'; carrier: string; flightNumber: string; origin: string; destination: string;
  departDate: string; departTime: string; arriveDate: string; arriveTime: string;
  departureZone?: string; arrivalZone?: string; fare?: number | null;
  providedAt?: string; review?: FlightReview; connection?: ConnectionRequirements;
};
export type JourneyLeg = {
  kind: 'home-access' | 'airport-processing' | 'flight' | 'arrival-processing' | 'road' | 'visit' | 'return-road';
  label: string; minutes: number | null; start?: string; end?: string; timeZone?: string;
  basis: string; evidenceIds: string[];
};
export type Matrix = { durations: Array<Array<number | null>>; distances: Array<Array<number | null>>; evidence: Evidence; roadBased: boolean };
export type ScenarioVisit = { managerId: string; trainerId: string; date: string; startTime: string; endTime: string; timeZone: string; startInstant: string; endInstant: string; location: string; stateCode: string; lat: number; lon: number; transferMinutes: number };
export type Scenario = {
  id: string; title: string; objective: 'balanced' | 'home' | 'cost';
  feasible: boolean; provisional: boolean; reasons: string[]; gaps: string[];
  visits: ScenarioVisit[]; unplaced: string[]; travelMinutes: number;
  trainerIds: string[]; legs: JourneyLeg[];
  budget: { knownAmount: number; currency: 'USD'; items: Array<{ label: string; amount: number | null; basis: string }>; complete: boolean };
};
export type ScenarioReport = {
  id: string; createdAt: string; expiresAt: string; workspaceRevision: number;
  startDate: string; endDate: string; arrivalAirport: string;
  scenarios: Scenario[]; evidence: Evidence[]; notes: string[];
  optimizer: string; sourceStatus: string;
  signals?: Array<{ sourceId: string; title: string; detail: string; validFrom?: string; validTo?: string }>;
};
