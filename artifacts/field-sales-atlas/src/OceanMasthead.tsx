import { ArrowRight } from 'lucide-react';

/** Decorative, locally bundled art. All travel information remains live HTML. */
export default function OceanMasthead({title,description,mobileDescription,action,onAction,compact=false}:{
  title:string;description:string;mobileDescription?:string;action?:string;onAction?:()=>void;compact?:boolean;
}) {
  return <header className={'vice-masthead'+(compact?' vice-masthead-compact':'')}>
    <picture className="vice-masthead-image" aria-hidden="true">
      <source media="(max-width: 600px)" srcSet="/resources/vice/ocean-drive-dusk-small.webp"/>
      <img src="/resources/vice/ocean-drive-dusk.webp" alt="" decoding="async" fetchPriority="high"/>
    </picture>
    <div className="vice-masthead-content">
      <h1>{title}</h1><p>{mobileDescription?<><span className="vice-description-desktop">{description}</span><span className="vice-description-mobile">{mobileDescription}</span></>:description}</p>
      {action&&onAction&&<button type="button" className="vice-primary" onClick={onAction}>{action}<ArrowRight size={20}/></button>}
    </div>
  </header>;
}
