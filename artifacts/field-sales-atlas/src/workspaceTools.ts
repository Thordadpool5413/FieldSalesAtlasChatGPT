import {
  Activity,CalendarDays,ClipboardCheck,Compass,Database,Map as MapIcon,
  Plane,PlaneTakeoff,Route,ShieldCheck,Sparkles,TicketCheck,Users,
} from 'lucide-react';
import type { Page } from './Operations';

export type TravelTool = 'week'|'coordinate'|'travel'|'radar'|'booked'|'trips';

export type WorkspaceTool = {
  id:string;
  page:Page;
  travelTool?:TravelTool;
  label:string;
  description:string;
  terms:string;
  icon:typeof Plane;
};

export const WORKSPACE_TOOLS:WorkspaceTool[] = [
  {id:'atlas',page:'home',label:'Atlas',description:'Explore territories, managers, and airport locations.',terms:'map geography states',icon:MapIcon},
  {id:'travel',page:'plan',label:'Travel',description:'Review trip plans, flights, and trainer travel options.',terms:'travel booking flight planning',icon:Plane},
  {id:'intelligence',page:'radar',label:'Intelligence',description:'Open the flight, airport, weather and connection toolkit.',terms:'aviation intelligence toolkit',icon:Sparkles},
  {id:'people',page:'people',label:'People',description:'Browse manager profiles and territory assignments.',terms:'contacts roster managers',icon:Users},
  {id:'calendar',page:'calendar',label:'Calendar',description:'Review visits and trainer availability.',terms:'appointments agenda schedule',icon:CalendarDays},
  {id:'mission',page:'mission',label:'Mission Control',description:'Review field readiness and find work that needs attention.',terms:'dashboard mission overview',icon:Sparkles},
  {id:'radar',page:'radar',travelTool:'radar',label:'Flight DNA',description:'Check past flights, airport alerts, and weather.',terms:'weather delays flight radar',icon:Activity},
  {id:'booked',page:'booked',travelTool:'booked',label:'Booked flights',description:'Review imported itineraries and flight details.',terms:'flight guardian ticket',icon:TicketCheck},
  {id:'coordinate',page:'coordinate',travelTool:'coordinate',label:'Coordinate trainers',description:'Balance trainer coverage and find better visit options.',terms:'two-trainer availability work',icon:Route},
  {id:'coaching',page:'coaching',label:'Coaching desk',description:'Review coaching notes and follow-up commitments.',terms:'ride along notes follow-up',icon:ClipboardCheck},
  {id:'reports',page:'overview',label:'Reports',description:'See regional coverage and manager activity.',terms:'dashboard charts distribution metrics',icon:Activity},
  {id:'air',page:'air',travelTool:'travel',label:'Airport & route planner',description:'Compare airports and routes for a trip.',terms:'route airports comparison',icon:PlaneTakeoff},
  {id:'map',page:'map',label:'County & ZIP explorer',description:'Explore counties, towns, and ZIP territories.',terms:'geography county drilldown',icon:Compass},
  {id:'data',page:'data',label:'Data & exports',description:'Import or download workspace records.',terms:'csv download backup',icon:Database},
  {id:'sharing',page:'team',label:'Sharing & recovery',description:'Manage sharing and restore workspace data.',terms:'shared access restore',icon:ShieldCheck},
  {id:'itineraries',page:'trips',travelTool:'trips',label:'Itineraries',description:'Review saved trip plans.',terms:'saved trip itinerary',icon:Route},
  {id:'week',page:'week',travelTool:'week',label:'Our Week',description:'See the team’s weekly schedule.',terms:'shared weekly agenda',icon:CalendarDays},
];

export function workspaceTool(id:string):WorkspaceTool {
  const tool=WORKSPACE_TOOLS.find(item=>item.id===id);
  if(!tool)throw new Error(`Unknown workspace tool: ${id}`);
  return tool;
}
