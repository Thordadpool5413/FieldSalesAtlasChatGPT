import type { Evidence, FlightInput, Scenario, ScenarioReport } from './types';

export type FlightChange = {
  id: string; reportId: string; originalLeg: FlightInput; replacementLeg?: FlightInput;
  status: 'delayed' | 'changed' | 'canceled'; checkedAt: string; notes: string;
  createdAt: string; state: 'pending' | 'applied' | 'retracted'; evidence: Evidence;
};
export type VisitImpact = { managerId: string; managerName: string; trainerId: string; trainerName: string;
  date: string; localTime: string; timeZone: string; level: 'affected' | 'review' | 'unchanged'; reason: string; evidenceIds: string[] };
export type VisitDifference = { managerId: string; managerName: string; from: { trainer: string; date: string; time: string }; to: { trainer: string; date: string; time: string }; changed: boolean };
export type RecoveryOption = { id: string; label: string; scenario: Scenario; evidence: Evidence[]; differences: VisitDifference[]; consequences: string[]; report: ScenarioReport };
export type RecoveryPreview = { id: string; changeId: string; reportId: string; workspaceRevision: number; createdAt: string; expiresAt: string;
  change: FlightChange; impacts: VisitImpact[]; options: RecoveryOption[]; limitations: string[] };
export type AssistantClaim = { text: string; evidenceIds: string[]; limitation?: string };
export type AssistantAnswer = { id: string; question: string; createdAt: string; workspaceRevision: number;
  verdict: 'provisional' | 'not-with-current-itinerary' | 'unknown' | 'clarification'; title: string;
  claims: AssistantClaim[]; missing: string[]; assumptions: string[]; evidence: Evidence[]; deadlineDate?: string;
  trainers: Array<{ id: string; name: string; visitCount: number; homeArrival?: string; homeLocal?: string; timeZone?: string; deadline?: string; meetsDeadline: boolean | null }>;
  scenario?: Scenario; followups: string[]; pendingChangeId?: string;
};
export type PlanSummary = { id: string; title: string; startDate: string; endDate: string; arrivalAirport: string;
  trainerNames: string[]; flightLegs: FlightInput[]; pendingChange?: FlightChange; tripIds: string[] };
