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
  const [guidedDraft, setGuidedDraft] = useState<TravelPlan | undefined>();
  const [together, setTogether] = useState(false);
  const [desk, setDesk] = useState<'assistant' | 'recovery' | 'connections' | null>(null);
  return <><nav className="journey-entry" aria-label="Travel intelligence tools"><div><strong>Two trainers. One considered plan.</strong><span>Coordinate visits, working hours and travel evidence together.</span></div><div className="travel-desk-entry-actions"><button className="op-btn" aria-pressed={together&&!desk} onClick={() => {setDesk(null);setTogether(true);}}><Users size={16}/> Plan together <ArrowRight size={15}/></button><button className="op-btn" aria-pressed={desk==='assistant'} onClick={() => setDesk('assistant')}><Sparkles size={15}/> Travel assistant</button><button className="op-btn" aria-pressed={desk==='recovery'} onClick={() => setDesk('recovery')}><Plane size={15}/> Flight change</button><button className="op-btn" aria-pressed={desk==='connections'} onClick={() => setDesk('connections')}><Link2 size={15}/> Data connections</button></div></nav>
    {desk ? <Suspense fallback={<p role="status">Opening travel intelligence…</p>}><TravelIntelligenceDesk mode={desk} onBack={() => setDesk(null)}/></Suspense>
      : together ? <Suspense fallback={<p role="status">Opening journey planner…</p>}><JourneyIntelligence seedPlan={advanced||guidedDraft} joint backLabel={advanced?'Back to airport comparison':'Guided planner'} onBack={() => setTogether(false)}/></Suspense>
      : advanced ? <Suspense fallback={<p role="status">Opening comparison tools…</p>}><AdvancedPlanner seedPlan={advanced} onDraft={setAdvanced} onBack={plan=>{setGuidedDraft(plan);setAdvanced(null);}}/></Suspense>
      : <GuidedTripPlanner initialPlan={guidedDraft} onDraft={setGuidedDraft} onAdvanced={plan=>{setGuidedDraft(plan);setAdvanced(plan);}}/>}
  </>;
}
