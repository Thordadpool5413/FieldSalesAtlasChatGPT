import IntelligenceCard from './IntelligenceCard';
import { INTELLIGENCE_TOOLS, openIntelligenceTool } from './intelligenceTools';
import { Map, Plane } from 'lucide-react';

export default function IntelligenceGallery() {
  return <section className="ig-gallery" aria-label="Intelligence toolkit">
    <header className="ig-gallery-heading"><div><span>YOUR INTELLIGENCE TOOLKIT</span><h2>Know more before you go.</h2></div>
      <p>Six tools. Open the one you need.</p></header>
    <nav className="ig-gallery-grid" aria-label="Intelligence toolkit shortcuts">
      {INTELLIGENCE_TOOLS.map(tool => <IntelligenceCard key={tool.id} tool={tool} onOpen={() => openIntelligenceTool(tool.id)}/>)}</nav>
    <div className="ig-context-links"><button type="button" onClick={() => openIntelligenceTool('map')}><Map size={16}/> Route & airport map</button>
      <button type="button" onClick={() => openIntelligenceTool('aircraft')}><Plane size={16}/> Aircraft nearby</button></div>
    <p className="ig-gallery-note">Public evidence and your planning assumptions. Source times and coverage are shown inside each tool.</p>
  </section>;
}
