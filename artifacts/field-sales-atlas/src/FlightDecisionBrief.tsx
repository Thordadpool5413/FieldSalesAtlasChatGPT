import {
Activity,ArrowRight,CheckCircle2,CircleAlert,Compass,
Database,Info,
ShieldAlert,Sparkles
} from 'lucide-react';
import { useEffect,useState } from 'react';
import './FlightDecisionBrief.css';
import type { DnaResponse } from './FlightDnaPanel';
import type { AirportProduct } from '../shared/travel/airportBrief';
import { describeEvidence } from '../shared/travel/evidence';
import type { OfficialHistoryLeg } from './OfficialFlightHistory';

type AirportSignal = {
  code:string;
  regional?: AirportProduct[];
  faa?: {level:'critical'|'caution'|'none'|'unknown';headline:string};
  aviation?: {
    available:boolean;
    observation:null|{category:string; reportTime:string|null;windKnots:number|null};
  };
  nws?: {available:boolean;alerts:Array<{event:string;severity:string}>};
};
type Now = {at:string;airports:AirportSignal[]};
type Route = {origin:string;destination:string;connection:string;alternate:string;connectionMinutes:string};
type Signal = {kind:'critical'|'review'|'context';title:string;body:string};
function currentObservation(report:AirportSignal):boolean{
  const raw=report.aviation?.observation;
  if(!raw?.reportTime)return false;
  const age=Date.now()-Date.parse(raw.reportTime);
  return Number.isFinite(age)&&age>=-300000&&age<=90*60000;
}
function qualify(sig:AirportSignal){
  const notices:Signal[]=[];
  if(sig.faa?.level==='critical')
    notices.push({kind:'critical',title:'FAA restriction at '+sig.code,
      body:'A significant FAA airport-wide event is reported. This is an operational signal, not your airline flight status.'});
  else if(sig.faa?.level==='caution')
    notices.push({kind:'review',title:'FAA delay advisory at '+sig.code,
      body:'The FAA reports airport-level delays. Departure/arrival gate times remain unverified.'});
  const metar=sig.aviation?.observation;
  if(metar && currentObservation(sig) && ['IFR','LIFR','MVFR'].includes(metar.category)){
    notices.push({
      kind:metar.category==='LIFR'?'critical':'review',
      title:metar.category+' observed at '+sig.code,
      body:'Current aviation visibility/cloud category. This is not evidence of a specific flight cancellation.'
    });
  }
  const severe=sig.nws?.available && sig.nws.alerts.find(alert=>alert.severity==='Extreme'||alert.severity==='Severe');
  if(severe)notices.push({
    kind:'critical',title:severe.event+' near '+sig.code,
    body:'An active severe local National Weather Service warning affects the airport point. Verify timing and airline guidance.'
  });
  for (const product of sig.regional || []) {
    if (product.evidence.provider !== 'ECCC Weather Alerts' || describeEvidence(product.evidence).state !== 'current') continue;
    for (const signal of product.data || []) {
      if (signal.validFrom && Date.parse(signal.validFrom) > Date.now()) continue;
      if (signal.validTo && Date.parse(signal.validTo) <= Date.now()) continue;
      notices.push({ kind: 'review', title: 'ECCC regional warning near ' + sig.code,
        body: signal.title + '. This warning covers a regional query area; airport and individual flight impact remain unverified.' });
    }
  }
  return notices;
}
export default function FlightDecisionBrief({route,now,history,officialHistory}:{
  route:Route;now:Now|null;history:DnaResponse|null;officialHistory?:OfficialHistoryLeg[]|null
}){
  const [checkedClock,setCheckedClock]=useState(()=>Date.now());
  useEffect(()=>{
    const timer=window.setInterval(()=>setCheckedClock(Date.now()),60000);
    return ()=>window.clearInterval(timer);
  },[]);
  const routeString=[route.origin,route.connection,route.destination].filter(Boolean).join(' → ');
  const checkTime=now?Date.parse(now.at):NaN;
  const freshNow=!!now&&Number.isFinite(checkTime)&&checkedClock-checkTime>=-60000&&
    checkedClock-checkTime<=15*60000;
  // Ignore expired observations. A previous on-demand snapshot must not be presented as live.
  const current = new Map(freshNow?now!.airports.map(row=>[row.code,row]):[]);
  const signals = [...current.values()].flatMap(qualify);
  const important = signals.filter(row=>row.kind==='critical');
  const caution = signals.filter(row=>row.kind==='review');
  const missing=history?.available ? history.legs.filter(leg=>!leg.route).length : 0;
  const actual = history?.legs.filter(leg=>leg.match?.basis !== 'airport' && leg.match) || [];
  const connecting = current.get(route.connection);
  const arriving = current.get(route.destination);
  const alternate = current.get(route.alternate);
  const requiredCodes=[route.origin,route.destination,route.connection].filter(Boolean);
  const missingOperational = !freshNow || requiredCodes.some(code=>{
    const row=current.get(code);
    return !row||!row.faa||row.faa.level==='unknown';
  });
  const highRate = actual.find(leg=>leg.match?.severePct !== null &&
    leg.match!.severePct!>=10);
  const officialCovered = officialHistory?.length === (route.connection ? 2 : 1) && officialHistory.every(leg => (leg.result?.summary?.outcomeSampleSize || 0) >= 30);
  const historicalAvailability = officialCovered || (history?.available && actual.length>0);
  const hasScenario = Number(route.connectionMinutes)>0&&Boolean(route.connection);
  const layover = Number(route.connectionMinutes);
  const tightConnection = hasScenario && layover < 90;
  const major = important.length>0;
  const headline = major ?
    'Investigate contingency options before relying on this route' :
    caution.length ?
      'Review exposure before treating this itinerary as resilient' :
    highRate ?
      'A historically variable flight leg deserves review' :
    tightConnection ?
      'Your entered connection time deserves additional margin' :
    !freshNow ?
      now?'Your airport observations expired. Refresh before deciding.':
        'Check current conditions before deciding' :
    !historicalAvailability || missingOperational ?
      'Evidence is incomplete. Verify the missing parts first.' :
      'No major signals were found in the checked public evidence. Verify your airline.';
  const status = major?'critical':caution.length||highRate||tightConnection?'review':'context';
  const reasons:Signal[]=[];
  if(route.connection&&connecting&&qualify(connecting).length)
    reasons.push({kind:qualify(connecting).some(x=>x.kind==='critical')?'critical':'review',
      title:'Your connection is exposed',
      body:'Current conditions at '+route.connection+' deserve more scrutiny because the itinerary depends on this transfer.'});
  else if(route.connection&&connecting&&connecting.faa?.level==='none')
    reasons.push({kind:'context',title:'Connecting airport FAA entry checked',
      body:'No active restriction is shown in the returned FAA entry for '+route.connection+'. This does not verify your specific flight.'});
  else if(route.connection&&connecting)
    reasons.push({kind:'review',title:'Connection airport status is incomplete',
      body:'No confirmed FAA airport-level status is available for '+route.connection+'. An omitted airport is not proof that operations are normal.'});
  if(tightConnection)reasons.push({
    kind:'review',title:layover+'-minute scheduled connection',
    body:'Your layover could leave little room after gate transfer and boarding-door cutoff. Use the connection scenarios below with your own transfer allowance.'
  });
  if(highRate?.match)reasons.push({
    kind:'review',title:'Historically variable leg: '+highRate.origin+' → '+highRate.destination,
    body:'The published matched historical population recorded '+highRate.match.severePct!.toFixed(1)+
      '% arriving 60+ minutes late, among completed flights. Sample: '+
      highRate.match.flights.toLocaleString('en-US')+'. This is not a forecast for your travel date.'
  });
  if(important.length&&reasons.length<4)reasons.push(...important.slice(0,2));
  if(!freshNow){
    reasons.unshift({kind:'review',title:now?'Airport observations need refreshing':'Current airport observations not yet checked',
      body:now?'This on-demand analysis is more than 15 minutes old. Atlas has excluded its FAA, NOAA and NWS findings from current recommendations. Run a new airport check above.':
        'Run the official FAA, NOAA and NWS check above before relying on current conditions.'});
  }
  if(!reasons.length){
    reasons.push({kind:'context',title:'Evidence available but not conclusive',
      body:'A lack of flagged conditions cannot establish that your itinerary or individual flight will operate on time.'});
  }
  const suggestions:string[]=[];
  if(major){
    suggestions.push('Verify the current airline itinerary directly; seek a longer connection or alternate gateway if needed.');
    if(route.alternate)suggestions.push('Review '+route.alternate+' as a possible alternative airport, but confirm available airline service and ground transfer independently.');
  }
  if(route.connection){
    suggestions.push('Compare a nonstop itinerary or a connection with a larger arrival-to-boarding margin.');
  }
  if(history?.available&&history.alternatePaths.length){
    const best=history.alternatePaths[0];
    if(best.connection!==route.connection)
      suggestions.push(best.connection+' appears in the historical two-leg route network. Check whether a current airline itinerary exists before treating it as an option.');
  }
  if(alternate&&arriving&&alternate.faa&&alternate.faa.level!=='unknown'&&
     qualify(arriving).some(s=>s.kind==='critical')&&!qualify(alternate).some(s=>s.kind==='critical')){
    suggestions.push('Fewer flagged conditions were observed at '+route.alternate+' than '+route.destination+'. That alone does not prove the alternative is safer or bookable.');
  }
  if(!suggestions.length)
    suggestions.push('Keep an airline-controlled confirmation of your itinerary and allow extra time for the parts of the journey you cannot verify in the public feeds.');
  const coverage=[];
  coverage.push(freshNow?'Airport observation checked in the last 15 minutes':
    now?'Airport observations expired: last checked '+new Date(now.at).toLocaleString():'Current operating conditions not checked');
  coverage.push(officialCovered ? 'Official BTS samples loaded for each leg; reporting months shown below' : history?.available?'Independent historical samples loaded':'Complete route history not yet available');
  if(missingOperational)coverage.push('Some airport operating observations may be missing');
  if(history?.available&&missing)coverage.push(missing+' leg(s) lack a matched directional route');
  return <section className={'fdb-root fdb-'+status} aria-label="Combined flight decision intelligence">
    <header className="fdb-head">
      <div>
        <span className="fdb-overline"><Sparkles size={16}/> ATLAS DECISION INTELLIGENCE</span>
        <h2>One route. <span>What we know.</span></h2>
        <p>Compare the sources Atlas could check, inspect what is missing, and decide what to verify before you travel. No airline-specific or future flight status is inferred.</p>
      </div>
      <ShieldAlert size={24}/>
    </header>
    <div className="fdb-main">
      <div className="fdb-status"><span>{routeString||'Your selected flight corridor'}</span>
        <strong>{headline}</strong>
        <small>{freshNow?'Airport signals checked recently':now?'Airport signals stale: recheck required':'Run the official airport analysis'} ·
          {history?.available?' Historical samples ready':' Analyze historical flight records'}</small>
      </div>
      <div className="fdb-signal-list">
        {reasons.slice(0,4).map((row,index)=><div className="fdb-signal" key={index}>
          <span className={'fdb-signal-icon fdb-icon-'+row.kind}>
            {row.kind==='critical'?<CircleAlert size={17}/>:
              row.kind==='review'?<Activity size={17}/>:<CheckCircle2 size={17}/>}
          </span>
          <div><strong>{row.title}</strong><p>{row.body}</p></div>
        </div>)}
      </div>
    </div>
    <div className="fdb-actions">
      <div><span className="fdb-overline"><Compass size={14}/> NEXT SMART CHECKS</span>
        {suggestions.slice(0,3).map((suggestion,index)=><p key={index}>
          <ArrowRight size={14}/>{suggestion}</p>)}
      </div>
      <div className="fdb-evidence">
        <span className="fdb-overline"><Database size={14}/> EVIDENCE COVERAGE</span>
        {coverage.map(item=><p key={item}><Info size={14}/>{item}</p>)}
      </div>
    </div>
    <p className="fdb-disclaimer">
      These are rule-based travel research suggestions, not individualized probabilities of missed connections,
      flight cancellation, exact airline operating predictions, flight availability, or booking advice.
      Missing public observations remain unknown.
    </p>
  </section>;
}
