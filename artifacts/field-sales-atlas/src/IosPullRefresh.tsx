import { ArrowDown,Check,CircleAlert,RefreshCw } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';

interface Props{
  enabled:boolean;
  onRefresh:()=>Promise<void>;
}
type Phase='idle'|'loading'|'done'|'failed';

function standalone(){
  const nav=navigator as Navigator&{standalone?:boolean};
  return window.matchMedia('(display-mode: standalone)').matches||nav.standalone===true;
}

export default function IosPullRefresh({enabled,onRefresh}:Props){
  const [distance,setDistance]=useState(0);
  const [phase,setPhase]=useState<Phase>('idle');
  const start=useRef<{x:number;y:number}|null>(null);
  const pullDistance=useRef(0);
  const busy=useRef(false);
  const action=useRef(onRefresh);
  action.current=onRefresh;

  useEffect(()=>{
    if(!enabled)return;
    let finishedTimer:number|null=null;
    let active=true;
    const resetLater=()=>{
      if(finishedTimer)window.clearTimeout(finishedTimer);
      finishedTimer=window.setTimeout(()=>{if(active)setPhase('idle');},2400);
    };
    const begin=(e:TouchEvent)=>{
      if(!standalone()||busy.current||window.scrollY>4||!navigator.onLine||
        document.documentElement.dataset.atlasKeyboard==='open'||
        e.touches.length!==1)return;
      const node=e.target instanceof Element?e.target:null;
      if(!node?.closest('#field-atlas-main')||
        node.closest('button,a,input,select,textarea,summary,[role="dialog"],'+
          '.mv-map-page,.atlas-v2,.maplibregl-map,.op-table-scroll,.travel-page'))return;
      start.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
    };
    const move=(e:TouchEvent)=>{
      if(!start.current||!e.touches.length)return;
      const dx=e.touches[0].clientX-start.current.x;
      const dy=e.touches[0].clientY-start.current.y;
      if(dy>8&&Math.abs(dy)>Math.abs(dx)*1.5&&window.scrollY<=4){
        const next=Math.min(85,Math.round(Math.max(0,dy-8)*.54));
        pullDistance.current=next;
        setDistance(next);
      }
    };
    const end=()=>{
      const current=start.current;
      start.current=null;
      if(!current)return;
      const pull=pullDistance.current;
      pullDistance.current=0;
      setDistance(0);
      if(pull>=64&&!busy.current){
        busy.current=true;
        setPhase('loading');
        void action.current().then(()=>{
          if(active)setPhase('done');
        }).catch(()=>{
          if(active)setPhase('failed');
        }).finally(()=>{
          busy.current=false;
          if(active)resetLater();
        });
      }else if(active&&pull>0)setPhase('idle');
    };
    window.addEventListener('touchstart',begin,{passive:true});
    window.addEventListener('touchmove',move,{passive:true});
    window.addEventListener('touchend',end,{passive:true});
    window.addEventListener('touchcancel',end,{passive:true});
    return ()=>{
      active=false;
      if(finishedTimer)window.clearTimeout(finishedTimer);
      window.removeEventListener('touchstart',begin);
      window.removeEventListener('touchmove',move);
      window.removeEventListener('touchend',end);
      window.removeEventListener('touchcancel',end);
      start.current=null;
      pullDistance.current=0;
    };
  },[enabled]);

  if(!enabled||(distance<8&&phase==='idle'))return null;
  return <div className={'ios-pull-refresh ios-pull-'+phase}
    role="status" aria-live="polite"
    style={{transform:'translateX(-50%) translateY('+Math.min(24,distance*.24)+'px)'}}>
    {phase==='loading'?<RefreshCw size={18} className="ios-spinning"/>:
      phase==='done'?<Check size={18}/>:
      phase==='failed'?<CircleAlert size={18}/>:
      distance>=64?<RefreshCw size={18}/>:<ArrowDown size={18}/>}
    <span>{phase==='loading'?'Refreshing the shared workspace…':
      phase==='done'?'Shared records updated':
      phase==='failed'?'Refresh failed. Check your connection.':
      distance>=64?'Release to refresh':'Pull down to refresh'}</span>
  </div>;
}
