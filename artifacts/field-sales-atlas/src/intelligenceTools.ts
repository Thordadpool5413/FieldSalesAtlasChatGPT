import { Activity, Clock3, CloudLightning, Radar, Route, ShieldCheck } from 'lucide-react';

export const INTELLIGENCE_TOOLS = [
  { id: 'dna', title: 'Flight DNA', icon: Activity, description: 'Explore historical arrivals, cancellations and route patterns.', terms: 'history airline reliability flight number BTS', photo: 'flight-performance-research-v3.webp', photoPosition: 'center 62%', imageAlt: 'A traveler reviews historical flight-performance charts and a route map on a tablet beside an airport window.' },
  { id: 'pressure', title: 'Airport pressure', icon: Radar, description: 'Review FAA airport events and runway configuration.', terms: 'FAA airport delays ground stop capacity', photo: 'airport-congestion-v3.webp', photoPosition: 'center 58%', imageAlt: 'Passenger aircraft queue on a taxiway beneath an air traffic control tower at a busy airport.' },
  { id: 'weather', title: 'Weather risk', icon: CloudLightning, description: 'Check aviation observations, forecasts and weather warnings.', terms: 'NOAA NWS ECCC METAR TAF forecast weather', photo: 'aviation-storm-risk-v3.webp', photoPosition: 'center 55%', imageAlt: 'A passenger jet sits at its gate in heavy rain beneath a storm front, with a windsock and wet apron.' },
  { id: 'connection', title: 'Connection survival', icon: Clock3, description: 'Test a layover against delays and your transfer allowance.', terms: 'layover connecting gate terminal margin', photo: 'timed-airport-connection-v3.webp', photoPosition: 'center 35%', imageAlt: 'A traveler with a rolling suitcase hurries between gate corridors beneath a large airport clock.' },
  { id: 'security', title: 'Security & airport', icon: ShieldCheck, description: 'Explore checkpoint history and your airport experience.', terms: 'TSA checkpoint queues security airport memory', photo: 'airport-security-screening-v3.webp', photoPosition: 'center 55%', imageAlt: 'A traveler places a carry-on bag and a tray on a baggage X-ray conveyor at an airport security checkpoint.' },
  { id: 'alternatives', title: 'Alternatives', icon: Route, description: 'Research historical connections and alternative arrival airports.', terms: 'backup alternative corridor connecting hubs', photo: 'alternate-flight-planning-v3.webp', photoPosition: 'center 60%', imageAlt: 'A traveler and an airline agent compare two itinerary options and a branching flight-route map.' },
] as const;

export type CoreFlightTool = typeof INTELLIGENCE_TOOLS[number]['id'];
export type IntelligenceToolDefinition = typeof INTELLIGENCE_TOOLS[number];
export const intelligenceToolImage = (tool: IntelligenceToolDefinition) => '/resources/intelligence/' + tool.photo;
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
  const state = { ...window.history.state, atlasPage: 'plan', atlasTool: 'radar', atlasFocusTool: true };
  if (next !== window.location.pathname + window.location.search + window.location.hash)
    window.history.pushState(state, '', next);
  else window.history.replaceState(state, '', next);
  window.dispatchEvent(new Event(INTELLIGENCE_NAVIGATION_EVENT));
}
