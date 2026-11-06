import { lazy, Suspense, useState } from 'react';
import type { TravelPlan } from './TravelLogic';
import GuidedTripPlanner from './GuidedTripPlanner';
import { Users, ArrowRight, Sparkles, Plane, Link2 } from 'lucide-react';
import './JourneyIntelligence.css';
import './TravelIntelligenceDesk.css';

const AdvancedPlanner = lazy(() => import('./AirTravel'));
const JourneyIntelligence = lazy(() => import('./JourneyIntelligence'));
const TravelIntelligenceDesk = lazy(() => import('./TravelIntelligenceDesk'));
export default function TripPlanningExperience() {
  const [advanced, setAdvanced] = useState<TravelPlan | null>(null);
  const [together, setTogether] = useState(false);
  const [desk, setDesk] = useState<'assistant' | 'recovery' | 'connections' | null>(null);
  return desk ? <Suspense fallback={<p role="status">Opening travel intelligence…</p>}><TravelIntelligenceDesk mode={desk} onBack={() => setDesk(null)}/></Suspense> : together ? <Suspense fallback={<p role="status">Opening journey planner…</p>}><JourneyIntelligence onBack={() => setTogether(false)}/></Suspense> : advanced ? <Suspense fallback={<p role="status">Opening comparison tools…</p>}><AdvancedPlanner seedPlan={advanced}/></Suspense> : <><div className="journey-entry"><div><strong>Two trainers. One considered plan.</strong><span>Coordinate visits, working hours and travel evidence together.</span></div><div className="travel-desk-entry-actions"><button className="op-btn" onClick={() => setTogether(true)}><Users size={16}/> Plan together <ArrowRight size={15}/></button><button className="op-btn" onClick={() => setDesk('assistant')}><Sparkles size={15}/> Travel assistant</button><button className="op-btn" onClick={() => setDesk('recovery')}><Plane size={15}/> Flight change</button><button className="op-btn" onClick={() => setDesk('connections')}><Link2 size={15}/> Data connections</button></div></div><GuidedTripPlanner onAdvanced={setAdvanced}/></>;
}
