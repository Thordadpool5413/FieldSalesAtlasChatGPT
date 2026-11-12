import { intelligenceToolImage, type IntelligenceToolDefinition } from './intelligenceTools';
import './IntelligenceToolVisual.css';

export default function IntelligenceToolVisual({ tool }: { tool: IntelligenceToolDefinition }) {
  return <figure className="fi-tool-visual" aria-label={tool.title + ' visual guide'} data-tool={tool.id}>
    <img src={intelligenceToolImage(tool)} alt={tool.imageAlt} width="1200" height="800" decoding="async"/>
    <figcaption>
      <p className="fi-tool-visual-title">{tool.title}</p>
      <p>{tool.description}</p>
      <small>Illustrative image</small>
    </figcaption>
  </figure>;
}
