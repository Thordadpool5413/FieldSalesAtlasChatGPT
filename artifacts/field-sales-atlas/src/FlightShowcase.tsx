import {
Activity,ArrowRight,ChevronRight,Clock3,CloudLightning,
Compass,Info,Layers3,Plane,Radar,Route,ShieldCheck,Sparkles
} from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import type { DnaResponse,DnaStatus } from './FlightDnaPanel';
import FlightNetworkMap from './FlightNetworkMap';
import './FlightShowcase.css';

type RouteInput = {
  origin:string;
  connection:string;
  destination:string;
  alternate:string;
  connectionMinutes:string;
};
type AirportSignal = {
  code:string;
  faaAvailable:boolean;
  faa?:{
    level:'critical'|'caution'|'none'|'unknown';
    headline:string;
    config?:{arrivalRate:number|null;arrivalRunways:string;departureRunways:string}|null;
  };
  aviation?:{
    available:boolean;
    observation:null|{
      reportTime:string|null;
      category:string;
      windKnots:number|null;
    };
  };
  nws?:{
    available:boolean;
    alerts:Array<{event:string;severity:string}>;
  };
};
type OfficialCheck = {at:string;airports:AirportSignal[]};

type Tile = {
  slug:string;
  title:string;
  subtitle:string;
  detail:string;
  eyebrow:string;
  value:string;
  state:'known'|'review'|'pending';
  icon:typeof Plane;
  link:string;
};
const percent=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(1).replace(/\.0$/,'')+'%':null;
function dateLabel(value:string){
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())
    ?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
    :'date not supplied';
}
function freshObservation(at:string|null|undefined,now:number){
  if(!at)return false;
  const t=Date.parse(at);
  return Number.isFinite(t)&&now-t>=-60000&&now-t<=180*60000;
}
function valueKind(kind:Tile['state']){
  return kind==='review'?'fsc-review':kind==='known'?'fsc-known':'fsc-pending';
}

export default function FlightShowcase({
  route, current, history, historyStatus, historyError, travelDate
}:{
  route:RouteInput;
  current:OfficialCheck|null;
  history:DnaResponse|null;
  historyStatus:DnaStatus;
  historyError:string;
  travelDate:string;
}){
  const [now,setNow]=useState(()=>Date.now());
  const railRef=useRef<HTMLElement|null>(null);
  const [activeTile,setActiveTile]=useState(0);
  function scrollToTile(index:number){
    const container=railRef.current;
    const target=container?.children.item(index) as HTMLElement|null;
    if(!container||!target)return;
    container.scrollTo({left:target.offsetLeft-container.offsetLeft,behavior:'smooth'});
    setActiveTile(index);
  }
  function railScrolled(){
    const container=railRef.current;
    const first=container?.querySelector<HTMLElement>('.fsc-card');
    if(!container||!first)return;
    const gap=parseFloat(getComputedStyle(container).columnGap||'0')||0;
    const step=first.getBoundingClientRect().width+gap;
    if(step<=0)return;
    const next=Math.max(0,Math.min(5,Math.round(container.scrollLeft/step)));
    setActiveTile(current=>current===next?current:next);
  }
  useEffect(()=>{
    const tick=window.setInterval(()=>setNow(Date.now()),60000);
    return()=>window.clearInterval(tick);
  },[]);
  const airports=useMemo(()=>{
    const checked=current?Date.parse(current.at):NaN;
    return Number.isFinite(checked)&&now-checked>=-60000&&now-checked<=15*60000
      ?current!.airports:[];
  },[current,now]);
  const operationsChecked=airports.length>0;
  const staleCurrent=!!current&&!operationsChecked;
  const hasRoute=/^[A-Z]{3}$/.test(route.origin)&&/^[A-Z]{3}$/.test(route.destination)&&route.origin!==route.destination;
  const travelLabel=hasRoute?[route.origin,route.connection,route.destination].filter(Boolean).join(' → '):'Your next flight';
  const reported=airports.flatMap(item=>{
    const notices=[];
    if(item.faa?.level==='critical')notices.push({severity:'high' as const,text:item.code+' FAA restriction'});
    else if(item.faa?.level==='caution')notices.push({severity:'review' as const,text:item.code+' airport delay'});
    const obs=item.aviation?.observation;
    if(obs&&freshObservation(obs.reportTime,now)&&['LIFR','IFR','MVFR'].includes(obs.category)){
      notices.push({severity:obs.category==='LIFR'?'high' as const:'review' as const,text:item.code+' '+obs.category+' weather'});
    }
    const severe=item.nws?.alerts.find(a=>['Severe','Extreme'].includes(a.severity));
    if(severe)notices.push({severity:'high' as const,text:item.code+' '+severe.event});
    return notices;
  });
  const high=reported.some(item=>item.severity==='high');
  const review=reported.length>0;
  const coverage=airports.filter(a=>a.faaAvailable&&a.faa?.level!=='unknown').length;
  const metar=airports.filter(a=>a.aviation?.available&&a.aviation.observation&&
    freshObservation(a.aviation.observation.reportTime,now));
  const severeWx=airports.flatMap(a=>a.nws?.available?a.nws.alerts.filter(
    alert=>alert.severity==='Severe'||alert.severity==='Extreme'
  ).map(alert=>a.code+' '+alert.event):[]);
  const histories=history?.available?history.legs:[];
  const firstSpecific=histories.find(leg=>leg.match?.basis==='flight number'||leg.match?.basis==='route')?.match;
  const fallback=histories.find(leg=>leg.match?.basis==='airport')?.match;
  const metric=firstSpecific||fallback;
  // A connecting journey is not represented by the rate of its first leg.
  const multiLeg=histories.length>1;
  const ontime=multiLeg?null:percent(metric?.onTimePct);
  const dnaValue=historyStatus==='loading'?'Loading historical results…':
    historyStatus==='error'?'History temporarily unavailable':
    historyStatus==='unavailable'?'No history feed available':
    history?.available&&multiLeg?'Review each leg':
    history?.available&&metric?
      (percent(metric.onTimePct)||'Rate unavailable')+' arrived ≤15 min late':
    history?.available?'No covered route sample':'Not analyzed';
  const dnaDetails=historyStatus==='loading'?'Checking published history separately from current conditions.':
    historyStatus==='error'?'The historical source could not be reached. Current airport checks remain separate.':
    historyStatus==='unavailable'?'No source returned usable historical rows; missing data is not proof of no service.':
    history?.available&&multiLeg?histories.map(leg=>{
      const row=leg.match;
      return `${leg.origin}–${leg.destination}: ${row
        ?`${percent(row.onTimePct)||'rate unavailable'} arrived ≤15 min late · ${row.flights.toLocaleString('en-US')} flights`
        :'no covered sample'}`;
    }).join(' · '):
    history?.available&&metric?
      `${metric.basis==='flight number'?'Flight-number':metric.basis==='route'?'Directional route':'Airport baseline'} · ${metric.flights.toLocaleString('en-US')} past flights`:
    history?.available?'No covered route or airport sample. This does not mean no airline service.':
    'Run Analyze flight to retrieve public historical samples.';
  const dnaRateDetail=historyStatus==='ready'&&history?.available&&!multiLeg&&metric
    ?[
      metric.cancelPct===null?null:`${percent(metric.cancelPct)} cancelled`,
      metric.severePct===null?null:`${percent(metric.severePct)} 60+ min late`
    ].filter(Boolean).join(' · ')
    :'';
  const dnaDateDetail=historyStatus==='ready'&&history?.available
    ?multiLeg?'Each leg has its own reporting window.':
      metric?.periodEnd?`Historical data through ${dateLabel(metric.periodEnd)}; not a travel-date forecast.`:
        'The source did not provide a reporting cutoff.'
    :'';
  const dnaTileDetail=[dnaDetails,dnaRateDetail,dnaDateDetail].filter(Boolean).join(' · ');
  const sourceCount=history?.sources.filter(source=>source.available).length||0;
  const sourceTotal=history?.sources.length||0;
  const evidencePoints=airports.filter(a=>
    (a.faaAvailable&&a.faa?.level!=='unknown')||
    (a.aviation?.available&&a.aviation.observation&&freshObservation(a.aviation.observation.reportTime,now))||
    a.nws?.available).length;
  const required=[route.origin,route.connection,route.destination].filter(Boolean);
  // A successful NWS point query alone does not establish that FAA and
  // aviation operating conditions are known at this airport.
  const limitedEvidence=required.some(code=>{
    const a=airports.find(item=>item.code===code);
    return !a||!a.faaAvailable||!a.faa||a.faa.level==='unknown'||
      !a.nws?.available||
      !a.aviation?.available||!a.aviation.observation||
      !freshObservation(a.aviation.observation.reportTime,now);
  });
  const riskLabel=high?'Investigate disruption':review?'Review airport conditions':
    !operationsChecked?'Not checked yet':
    !evidencePoints?'Evidence unavailable':
    limitedEvidence?'Coverage incomplete':'No alerts in checked evidence';
  const layover=Number(route.connectionMinutes);
  const canCompare=!!route.connection&&Number.isFinite(layover)&&layover>0;
  const possiblePaths=history?.available?history.alternatePaths.length:0;
  const destination=airports.find(item=>item.code===route.destination);
  const routeAirports=airports.filter(item=>required.includes(item.code));
  const pressureAirport=routeAirports.find(item=>item.faa?.level==='critical')||
    routeAirports.find(item=>item.faa?.level==='caution')||destination;
  const destinationFaa=pressureAirport?.faa;
  const weatherAirport=routeAirports.find(item=>item.nws?.available&&
    item.nws.alerts.some(alert=>['Severe','Extreme'].includes(alert.severity)))||
    routeAirports.find(item=>item.aviation?.observation&&
      freshObservation(item.aviation.observation.reportTime,now)&&
      ['LIFR','IFR','MVFR'].includes(item.aviation.observation.category))||destination;
  const destinationWeather=weatherAirport?.aviation?.observation;
  const tiles:Tile[]=[
    {
      slug:'dna',eyebrow:'HISTORICAL RELIABILITY',
      icon:Activity,title:'Flight DNA',
      subtitle:'Published flight, route and airport patterns',
      detail:dnaTileDetail,
      value:dnaValue,
      state:historyStatus==='ready'&&history?.available?'known':'pending',link:'#atlas-flight-dna'
    },
    {
      slug:'pressure',eyebrow:'FAA / CAPACITY',
      icon:Radar,title:'Airport pressure',
      subtitle:'Current FAA airport events and runway configuration',
      detail:destinationFaa?.config?.arrivalRate!==null&&
        typeof destinationFaa?.config?.arrivalRate==='number'?
        'Published arrival rate · '+destinationFaa.config.arrivalRate+' aircraft/hr':
        'Official FAA status is airport-level only',
      value:destinationFaa?.level==='critical'?(pressureAirport?.code||'FAA')+' alert':
        destinationFaa?.level==='caution'?(pressureAirport?.code||'FAA')+' delay':
        destinationFaa?.level==='none'?'No event listed':'Check FAA',
      state:destinationFaa?.level==='critical'||destinationFaa?.level==='caution'?'review':
        destinationFaa?.level==='none'?'known':'pending',link:'#atlas-airport-operations'
    },
    {
      slug:'weather',eyebrow:'NOAA / NWS',
      icon:CloudLightning,title:'Weather risk',
      subtitle:'Aviation observations and active severe alerts',
      detail:severeWx[0]||(
        destinationWeather&&freshObservation(destinationWeather.reportTime,now)?
          'Observed '+weatherAirport?.code+' flight category':'No fresh forecast is inferred'
      ),
      value:severeWx[0]?'Severe alert':
        destinationWeather&&freshObservation(destinationWeather.reportTime,now)?
          destinationWeather.category||'Observed':
          'Check weather',
      state:severeWx[0]?'review':
        destinationWeather&&freshObservation(destinationWeather.reportTime,now)?'known':'pending',
      link:'#atlas-airport-operations'
    },
    {
      slug:'connection',eyebrow:'LAYOVER / WHAT-IF',
      icon:Clock3,title:'Connection survival',
      subtitle:'Test your delay and gate-transfer allowance',
      detail:'Illustrative arithmetic, not an actual missed-connection probability',
      value:canCompare?layover+' min entered':'Add a layover',
      state:canCompare&&layover<90?'review':canCompare?'known':'pending',
      link:'#atlas-flight-dna'
    },
    {
      slug:'security',eyebrow:'SECURITY / TERMINALS',
      icon:ShieldCheck,title:'Security & airport',
      subtitle:'Published checkpoint history plus your actual experience',
      detail:'Terminal and screening lane details vary by airport',
      value:'Open security memory',
      state:'pending',
      link:'#atlas-security-history'
    },
    {
      slug:'alternatives',eyebrow:'BACKUP TRAVEL',
      icon:Route,title:'Alternatives',
      subtitle:'Compare historically documented connecting corridors',
      detail:history?.available?(possiblePaths>0?'Historical paths are not confirmed flights':
        'No covered connecting path found; this does not prove none exists'):
        'Search supported historical corridors',
      value:history?.available?(possiblePaths>0?possiblePaths+' research hubs':'No covered hubs'):'Explore options',
      state:history?.available?'known':'pending',
      link:'#atlas-flight-dna'
    }
  ];
  const summary=[
    {
      label:'Historical performance',
      icon:Activity,
      detail:multiLeg?'Connecting journey: inspect each leg separately; no combined rate calculated':
        ontime?(ontime+' arrivals on-time · '+metric!.flights.toLocaleString('en-US')+
        ' flights · '+metric!.basis+' sample'):'No matched history analyzed',
      state:ontime?'known' as const:'pending' as const,
      target:'atlas-flight-dna'
    },
    {
      label:'Current operations',
      icon:Radar,
      detail:operationsChecked?(coverage+' of '+airports.length+
        ' mapped airports have FAA status · '+riskLabel):
        staleCurrent?'Official checks expired; refresh':'Official FAA check pending',
      state:review?'review' as const:operationsChecked?'known' as const:'pending' as const,
      target:'atlas-airport-operations'
    },
    {
      label:'Weather observations',
      icon:CloudLightning,
      detail:severeWx[0]||(
        metar.length?metar.map(item=>item.code+' '+item.aviation?.observation?.category).join(' · '):
          'No fresh airport weather observation checked'
      ),
      state:severeWx[0]?'review' as const:metar.length?'known' as const:'pending' as const,
      target:'atlas-airport-operations'
    },
    {
      label:'Connection margin',
      icon:Clock3,
      detail:canCompare?layover+' minutes entered; test your actual transfer allowance':
        'Add a connecting airport and layover to compare scenarios',
      state:canCompare&&layover<90?'review' as const:canCompare?'known' as const:'pending' as const,
      target:'atlas-flight-dna'
    },
    {
      label:'Security & arrival',
      icon:ShieldCheck,
      detail:'Check historical checkpoint postings and your saved personal experience',
      state:'pending' as const,
      target:'atlas-security-history'
    }
  ];
  return <div className="fsc-root">
    <section className={'fsc-brief '+(high?'fsc-brief-high':review?'fsc-brief-review':'')}
      aria-label="Flight evidence at a glance">
      <div className="fsc-brief-head">
        <span className="fsc-brief-plane"><Plane size={27}/></span>
        <div className="fsc-brief-text">
          <strong>{hasRoute?'Flight brief: '+travelLabel:'Your next flight brief'}</strong>
          <span>{hasRoute?'Planning date '+travelDate+' · present-day airport checks and selective flight history':
            'Choose departure and arrival airports above to begin'}</span>
        </div>
      </div>
      <div className="fsc-brief-column">
        <span className="fsc-mini-label">AIRPORT OUTLOOK</span>
        <strong className={high?'fsc-pink':review?'fsc-gold':'fsc-cyan'}>{riskLabel}</strong>
        <span className="fsc-brief-sub">{operationsChecked?
          limitedEvidence?'Partial source coverage; missing does not mean clear':
          'Airport-level status at check time; not a travel-date forecast':
          staleCurrent?'On-demand evidence expired':'Official feeds unchecked'}</span>
      </div>
      <div className="fsc-brief-column">
        <span className="fsc-mini-label">KEY CONSIDERATIONS</span>
        <strong className={high?'fsc-pink':'fsc-white'}>
          {reported[0]?.text|| (canCompare&&layover<90?'Tight connection allowance':
            'No flight-specific conclusion yet')}
        </strong>
        <span className="fsc-brief-sub">{reported.length>1?reported.length+' flagged conditions':
          'Verify your actual itinerary with the airline'}</span>
      </div>
      <div className="fsc-brief-column">
        <span className="fsc-mini-label">HISTORICAL EVIDENCE</span>
        <strong className={historyStatus==='error'||historyStatus==='unavailable'?'fsc-gold':'fsc-cyan'}
          data-testid="flight-history-value">{dnaValue}</strong>
        <span className="fsc-brief-sub" data-testid="flight-history-detail" aria-live="polite">
          {dnaDetails}
        </span>
        {dnaRateDetail&&<span className="fsc-brief-sub">{dnaRateDetail}</span>}
        {dnaDateDetail&&<span className="fsc-brief-sub">{dnaDateDetail}</span>}
        {historyStatus==='ready'&&history?.available&&sourceTotal>0&&
          <span className="fsc-brief-sub">{sourceCount} of {sourceTotal} historical datasets available · lookup completed {new Date(history.checkedAt).toLocaleString()}</span>}
        {historyStatus==='error'&&historyError&&
          <span className="fsc-brief-sub">Details: {historyError}</span>}
        <a className="fsc-history-action" href="#atlas-flight-dna">
          Open full Flight DNA evidence <ArrowRight size={13}/>
        </a>
      </div>
    </section>
    <div className="fsc-mobile-toolhead">
      <div>
        <span>YOUR INTELLIGENCE TOOLKIT</span>
        <h2>Everything before takeoff.</h2>
        <p>Choose a tool to explore its evidence.</p>
      </div>
      <div className="fsc-mobile-toolbuttons">
        <button type="button" aria-label="Previous flight tool"
          disabled={activeTile===0}
          onClick={()=>scrollToTile(Math.max(0,activeTile-1))}>‹</button>
        <button type="button" aria-label="Next flight tool"
          disabled={activeTile===5}
          onClick={()=>scrollToTile(Math.min(5,activeTile+1))}>›</button>
      </div>
    </div>
    <nav ref={railRef} onScroll={railScrolled}
      className="fsc-cards" aria-label="Swipeable flight intelligence tools">
      {tiles.map(tile=>{
        const Icon=tile.icon;
        return <a className={'fsc-card fsc-card-'+tile.slug} key={tile.slug}
            href={tile.link}>
          <div className="fsc-card-picture" aria-hidden="true"/>
          <div className="fsc-card-inner">
            <div className="fsc-card-kicker">{tile.eyebrow}</div>
            <div className="fsc-card-icon"><Icon size={21}/></div>
            <strong>{tile.title}</strong>
            <p>{tile.subtitle}</p>
            {tile.slug==='dna'&&tile.detail&&
              <small className="fsc-card-detail" data-testid="flight-history-card-detail">{tile.detail}</small>}
            <span className={'fsc-card-value '+valueKind(tile.state)}>
              {tile.value}<ChevronRight size={16}/>
            </span>
          </div>
        </a>;
      })}
    </nav>
    <div className="fsc-mobile-pager" aria-label="Select a flight tool">
      {tiles.map((tile,index)=><button key={tile.slug} type="button"
        aria-label={'Show '+tile.title} aria-pressed={activeTile===index}
        className={index===activeTile?'is-active':''}
        onClick={()=>scrollToTile(index)}>
        <span/>
      </button>)}
    </div>
    <div className="fsc-below-fold">
      <div className="fsc-map-panel" id="atlas-airport-corridors">
        <FlightNetworkMap
          origin={route.origin}
          connection={route.connection}
          destination={route.destination}
          alternate={route.alternate}
        />
      </div>
      <section className="fsc-summary" aria-label="Travel intelligence summary">
        <div className="fsc-summary-heading">
          <span className="fsc-summary-symbol"><Layers3 size={25}/></span>
          <div>
            <h2>Intelligence summary</h2>
            <p>What the actual public evidence says about your route.</p>
          </div>
        </div>
        <div className="fsc-summary-list">
          {summary.map(item=>{
            const Icon=item.icon;
            return <a key={item.label} href={'#'+item.target} className="fsc-summary-row">
              <Icon size={20}/>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
              <i className={valueKind(item.state)}>{item.state==='pending'?'Unknown':
                item.state==='review'?'Review':'Observed'}</i>
            </a>;
          })}
        </div>
        <div className="fsc-summary-actions">
          <a className="fsc-summary-primary" href="#atlas-deep-research">
            <Sparkles size={17}/> View detailed analysis <ArrowRight size={17}/>
          </a>
          <a className="fsc-summary-secondary" href="#atlas-flight-dna">
            <Compass size={17}/> Compare alternatives
          </a>
        </div>
        <p className="fsc-summary-note">
          <Info size={14}/> Airport-level checks and historical samples have different
          meanings. This does not confirm flight availability or predict individual delays.
        </p>
      </section>
    </div>
  </div>;
}
