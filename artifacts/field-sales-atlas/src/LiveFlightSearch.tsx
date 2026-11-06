
import { ArrowRight,Check,CircleAlert,ExternalLink,Plane,RefreshCw } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import './LiveFlightSearch.css';
import type { Airport } from './opsModels';
import { dateLabel,today } from './opsModels';
import type { FlightQuote,TravelPlan } from './TravelLogic';
import { api } from './workspaceApi';

type Leg={from:string;to:string;depart:string;arrive:string;durationMinutes:number;connections:number;operatingCarriers:string[];mainCarrier:string};
type Offer={id:string;totalAmount:number;currency:string;expiresAt:string;outbound:Leg;inbound:Leg|null;connections:number};
type SearchResult={provider:string;liveMode:boolean;checkedAt:string;offers:Offer[];warning:string};
type Props={
  plan:TravelPlan;origins:string[];arrivalCode:string;airports:Airport[];
  destinationOptions:string[];maxConnections:number;
  onAddQuote:(q:FlightQuote)=>void;
};
export default function LiveFlightSearch({plan,origins,arrivalCode,airports,destinationOptions,maxConnections,onAddQuote}:Props){
  const [connected,setConnected]=useState(false);
  const [checking,setChecking]=useState(true);
  const [origin,setOrigin]=useState(origins[0]||'');
  const [destination,setDestination]=useState(arrivalCode);
  const [connections,setConnections]=useState(maxConnections);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<SearchResult|null>(null);
  const [imported,setImported]=useState<string[]>([]);
  useEffect(()=>{
    let alive=true;
    api.get('/api/flights/status').then(r=>{if(alive)setConnected(!!r.data.connected);})
      .catch(()=>{if(alive)setError('Flight connection status could not be checked.');})
      .finally(()=>{if(alive)setChecking(false);});
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{setOrigin(origins[0]||'');},[origins.join(',')]);
  useEffect(()=>{setDestination(arrivalCode);},[arrivalCode]);
  useEffect(()=>{setConnections(Math.max(0,Math.min(2,maxConnections)));},[maxConnections]);
  const choices=useMemo(()=>[...new Set([destination,arrivalCode,...destinationOptions].filter(v=>/^[A-Z]{3}$/.test(v)))],[destination,arrivalCode,destinationOptions.join(',')]);
  async function search(){
    if(!connected){setError('A live flight provider has not been connected.');return;}
    if(!origin||!destination||origin===destination){setError('Select different departure and arrival airports.');return;}
    if(!plan.departDate||!plan.returnDate||plan.returnDate<plan.departDate){setError('Select valid departure and return dates.');return;}
    setLoading(true);setError('');setResult(null);setImported([]);
    try{
      const response=await api.post('/api/flights/search',{
        origin,destination,departDate:plan.departDate,returnDate:plan.returnDate,maxConnections:connections
      });
      setResult(response.data as SearchResult);
    }catch(e){setError(e instanceof Error?e.message:'Could not retrieve actual airline offers.');}
    finally{setLoading(false);}
  }
  function addOffer(offer:Offer){
    if(!result?.liveMode||offer.currency!=='USD'||!offer.inbound||!offer.outbound.durationMinutes||!offer.inbound.durationMinutes)return;
    const q:FlightQuote={
      id:'duffel_'+offer.id+'_'+Date.now(),
      origin,destination,returnOrigin:destination,
      carrier:offer.outbound.operatingCarriers.join(', ')||offer.outbound.mainCarrier,
      source:'Duffel offer '+offer.id+' (checked '+new Date(result.checkedAt).toLocaleString()+')',
      observedOn:today(),fare:offer.totalAmount,
      baggage:0,extra:0,outboundMinutes:offer.outbound.durationMinutes,
      returnMinutes:offer.inbound.durationMinutes,connections:offer.connections,
      outboundArrivalLocal:(offer.outbound.arrive||'').slice(0,16),
      returnLandingLocal:(offer.inbound.arrive||'').slice(0,16),
      notes:'Provider offer expires '+(offer.expiresAt||'at an unspecified time')+'. Baggage, ancillary fees, and availability must be independently confirmed before booking.'
    };
    onAddQuote(q);setImported(old=>[...old,offer.id]);
  }
  return <section className="live-flight">
    <div className="live-flight-heading"><div>
      <h3><Plane size={19}/> Find real airline offers</h3>
      <p>Search one departure and arrival airport pair using an approved provider.</p>
    </div><span className={'live-flight-status'+(connected?' connected':'')}>
      {checking?'Checking provider':connected?'Provider connected':'Provider not connected'}
    </span></div>
    {!connected&&!checking?<div className="live-flight-unavailable"><CircleAlert size={17}/>
      <div><strong>Live airfare and schedules are not connected yet.</strong>
        <p>The app is ready for Duffel flight shopping, but needs an approved API credential. You can still compare nearby airports, open external flight searches, and enter verified quotes manually.</p>
        <a href="https://duffel.com/docs/api/offer-requests" target="_blank" rel="noreferrer">Flight provider documentation <ExternalLink size={13}/></a>
      </div>
    </div>:<>
      <div className="live-flight-fields">
        <label>Fly from<select value={origin} onChange={e=>{setOrigin(e.target.value);setResult(null);}}>
          {origins.map(x=><option key={x} value={x}>{x} · {airports.find(a=>a.iata===x)?.name||'Home airport'}</option>)}
        </select></label>
        <label>Fly into<select value={destination} onChange={e=>{setDestination(e.target.value);setResult(null);}}>
          {choices.map(x=><option key={x} value={x}>{x} · {airports.find(a=>a.iata===x)?.name||'Alternative airport'}</option>)}
        </select></label>
        <label>Maximum connections<select value={connections} onChange={e=>{setConnections(Number(e.target.value));setResult(null);}}>
          <option value={0}>Nonstop only</option><option value={1}>Up to 1</option><option value={2}>Up to 2</option>
        </select></label>
        <button className="op-btn primary" disabled={!connected||loading||!origin||!destination||origin===destination} onClick={search}>
          <RefreshCw size={15}/>{loading?'Checking airlines…':'Find live flights'}
        </button>
      </div>
      <p className="live-flight-dates">Round trip · {dateLabel(plan.departDate)} to {dateLabel(plan.returnDate)} · 1 adult · economy</p>
    </>}
    {error&&<p className="live-flight-error" role="alert"><CircleAlert size={15}/>{error}</p>}
    {result&&<div className="live-flight-results">
      <div className="live-flight-results-header"><strong>{result.offers.length} airline offer{result.offers.length===1?'':'s'} found</strong>
        <span>{result.liveMode?'Live provider offers':'Provider test mode'} · checked {new Date(result.checkedAt).toLocaleTimeString()}</span>
      </div>
      {!result.liveMode&&<p className="live-flight-error">Provider is in test mode. These are not bookable live fares and cannot be imported as actual quotes.</p>}
      {!result.offers.length&&<p className="live-flight-empty">No airline offers were returned for these dates and airport choices. Try another gateway or connection allowance.</p>}
      {result.offers.slice().sort((a,b)=>a.totalAmount-b.totalAmount).slice(0,12).map(offer=><div className="live-flight-offer" key={offer.id}>
        <div className="live-flight-route"><strong>{offer.outbound.from} → {offer.outbound.to}</strong>
          <span>{offer.outbound.operatingCarriers.join(' / ')||offer.outbound.mainCarrier}</span>
          <small>{offer.outbound.depart?offer.outbound.depart.replace('T',' ').slice(0,16):'Outbound schedule unavailable'} · {offer.outbound.connections?' '+offer.outbound.connections+' connection(s)':' nonstop outbound'}</small>
          {offer.inbound&&<small>Return: {offer.inbound.depart.replace('T',' ').slice(0,16)} · {offer.inbound.connections?' '+offer.inbound.connections+' connection(s)':' nonstop'}</small>}
        </div>
        <div className="live-flight-price"><strong>{new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(offer.totalAmount)}</strong>
          <small>{offer.currency} · {offer.expiresAt?'Expires '+new Date(offer.expiresAt).toLocaleTimeString():'Time-limited offer'}</small></div>
        <button className="op-btn" onClick={()=>addOffer(offer)}
          disabled={!result.liveMode||offer.currency!=='USD'||!offer.inbound||!offer.outbound.durationMinutes||!offer.inbound.durationMinutes||imported.includes(offer.id)}>
          {imported.includes(offer.id)?<><Check size={15}/> Added</>:<>Compare <ArrowRight size={14}/></>}
        </button>
      </div>)}
      <p className="live-flight-disclaimer">{result.warning} Displayed airlines are the actual operating carriers returned by the provider. Prices exclude optional baggage and extras unless confirmed.</p>
    </div>}
  </section>;
}
