import { Activity, Clock3, CloudLightning, Radar, Route, ShieldCheck } from 'lucide-react';

export const INTELLIGENCE_TOOLS = [
  { id: 'dna', title: 'Flight DNA', icon: Activity, description: 'Explore historical arrivals, cancellations and route patterns.', terms: 'history airline reliability flight number BTS', photo: 'dna' },
  { id: 'pressure', title: 'Airport pressure', icon: Radar, description: 'Review FAA airport events and runway configuration.', terms: 'FAA airport delays ground stop capacity', photo: 'pressure' },
  { id: 'weather', title: 'Weather risk', icon: CloudLightning, description: 'Check aviation observations, forecasts and weather warnings.', terms: 'NOAA NWS ECCC METAR TAF forecast weather', photo: 'weather' },
  { id: 'connection', title: 'Connection survival', icon: Clock3, description: 'Test a layover against delays and your transfer allowance.', terms: 'layover connecting gate terminal margin', photo: 'connection' },
  { id: 'security', title: 'Security & airport', icon: ShieldCheck, description: 'Explore checkpoint history and your airport experience.', terms: 'TSA checkpoint queues security airport memory', photo: 'security' },
  { id: 'alternatives', title: 'Alternatives', icon: Route, description: 'Research historical connections and alternative arrival airports.', terms: 'backup alternative corridor connecting hubs', photo: 'alternatives' },
] as const;

export type CoreFlightTool = typeof INTELLIGENCE_TOOLS[number]['id'];
export type IntelligenceToolDefinition = typeof INTELLIGENCE_TOOLS[number];
export const flightTools = [...INTELLIGENCE_TOOLS.map(tool => tool.id), 'map', 'aircraft'] as const;
export type FlightTool = typeof flightTools[number];
export const INTELLIGENCE_NAVIGATION_EVENT = 'atlas:intelligence-navigation';
export function initialFlightTool(): FlightTool {
  const value = new URLSearchParams(window.location.search).get('intel');
  return flightTools.find(tool => tool === value) || 'dna';
}

// Use the existing router. Preserve the workspace fragment
// and update an already mounted intelligence view as well as other pages.
export function openIntelligenceTool(tool: FlightTool) {
  const address = new URL(window.location.href);
  address.searchParams.set('page', 'plan');
  address.searchParams.set('tool', 'radar');
  address.searchParams.set('intel', tool);
  const next = address.pathname + address.search + address.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash)
    window.history.pushState({ atlasPage: 'plan', atlasTool: 'radar' }, '', next);
  window.dispatchEvent(new Event(INTELLIGENCE_NAVIGATION_EVENT));
}
