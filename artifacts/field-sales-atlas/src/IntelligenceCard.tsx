import { ArrowRight } from 'lucide-react';
import type { IntelligenceToolDefinition } from './intelligenceTools';
import './IntelligenceGallery.css';

export default function IntelligenceCard({ tool, onOpen, selected, value, detail, state = 'unknown', controls }: {
  tool: IntelligenceToolDefinition; onOpen: () => void; selected?: boolean;
  value?: string; detail?: string; state?: 'observed' | 'review' | 'unknown' | 'input'; controls?: string;
}) {
  const Icon = tool.icon;
  return <button type="button" className={'ig-card fi-tool fi-tool-' + tool.id} onClick={onOpen}
    aria-label={tool.title} aria-description={value || tool.description} title={tool.description}
    aria-pressed={selected} aria-controls={controls}>
    <img className="ig-card-photo" src={'/resources/intelligence/' + tool.photo + '.jpg'} alt="" aria-hidden="true" width="640" height="427" decoding="async"/>
    <span className="ig-card-shade" aria-hidden="true"/>
    <span className="fi-tool-title"><Icon size={20}/><strong>{tool.title}</strong><ArrowRight size={16}/></span>
    <span className={'fi-tool-value fi-state-' + state}>{value || tool.description}</span>
    {detail && <small>{detail}</small>}
  </button>;
}
