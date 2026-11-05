
import {
ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpRight,CalendarDays,Check,
CheckCircle2,ChevronDown,ChevronRight,CircleAlert,Clock3,
Copy,
ExternalLink,Gauge,Layers,
MapPin,Pencil,Plane,
PlaneLanding,PlaneTakeoff,Plus,RefreshCw,Route,Search,Settings2,
ShieldCheck,
Trash2,Users,Wallet,X
} from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import AirportDisruption from './AirportDisruption';
import './AirportDisruption.css';
import AviationWeather from './AviationWeather';
import { requestedManagerIds } from './fieldExperience';
import { useOp } from './Operations';
import type { Airport } from './opsModels';
import { dateLabel,downloadFile,exportCSV,STATE_BY_CODE,STATES,today } from './opsModels';
import SmartTripPanel from './SmartTripPanel';
import type { FlightQuote,Gateway,QuoteResult,TravelPlace,TravelPlan,TravelPrefs } from './TravelLogic';
import {
airportGateways,calcQuote,
countNights,
defaultTravelPrefs,
googleFlightSearch,googleMapRoute,
minutesLabel,
money,
newTravelPlan,
safeTravelPrefs
} from './TravelLogic';
import { api } from './workspaceApi';
// Flight Radar uses free public data; commercial flight offers are not part of this workflow.
import './AirTravel.css';
import { CANADA_CITIES,CANADA_REGION_BY_CODE,CANADA_REGIONS } from './CanadaRegions';
import { buildCoachingSchedule,getPlanning } from './TripIntelligence';

const currency=(value:number)=>money(value);
const qdefault=(plan:TravelPlan,airport:string):FlightQuote=>({
  id:'',origin:plan.origins[0]||'MCO',destination:airport,
  returnOrigin:airport,carrier:'',source:'',observedOn:today(),
  fare:0,baggage:0,extra:0,outboundMinutes:0,returnMinutes:0,connections:0,
  outboundArrivalLocal:'',returnDepartureLocal:'',returnLandingLocal:'',notes:'',verifiedGroundMiles:0,verifiedGroundMinutes:0,
});
const valid=(code:string)=>/^[A-Z]{3}$/.test(code);
const quoteKey=()=> 'quote_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
const num=(v:string)=>Math.max(0,Number(v)||0);
function Kicker({children}:{children:React.ReactNode}){return <span className="travel-kicker">{children}</span>}
function Note({children,warn=false}:{children:React.ReactNode;warn?:boolean}){return <p className={'travel-note'+(warn?' caution':'')}><CircleAlert size={14}/>{children}</p>}
function NumberField({label,value,onChange,unit,step=1,min=0,max=50000}:{label:string;value:number;onChange:(v:number)=>void;unit?:string;step?:number;min?:number;max?:number}){
  return <label className="travel-number-field"><span>{label}</span><div className="travel-number-input">
    <input type="number" min={min} max={max} step={step} value={value} onChange={e=>onChange(num(e.target.value))}/>
    {unit&&<span>{unit}</span>}
  </div></label>;
}
const samplePlaces:TravelPlace[]=[
  {name:'Orlando',state:'FL',lat:28.5383,lon:-81.3792},
  {name:'Melbourne',state:'FL',lat:28.0836,lon:-80.6081},
  {name:'Chicago',state:'IL',lat:41.8781,lon:-87.6298},
  {name:'Minneapolis',state:'MN',lat:44.9778,lon:-93.265},
  {name:'Dallas',state:'TX',lat:32.7767,lon:-96.7970},
  {name:'Atlanta',state:'GA',lat:33.749,lon:-84.388},
  {name:'Boston',state:'MA',lat:42.3601,lon:-71.0589},
  {name:'Columbus',state:'OH',lat:39.9612,lon:-82.9988},
];
function TravelQuoteEditor({initial,origins,gateways,onSave,onCancel}:{initial:FlightQuote;origins:string[];gateways:Gateway[];onSave:(quote:FlightQuote)=>void;onCancel:()=>void}){
  const [q,setQ]=useState(initial);
  const [issue,setIssue]=useState('');
  const change=<K extends keyof FlightQuote>(key:K,value:FlightQuote[K])=>setQ(prev=>({...prev,[key]:value}));
  const destOptions=[...new Set([q.destination,q.returnOrigin,...gateways.map(g=>g.airport.iata)].filter(Boolean))];
  function submit(){
    if(!valid(q.origin)||!valid(q.destination)||!valid(q.returnOrigin)){setIssue('Choose valid origin and destination airport codes.');return;}
    if(q.fare<=0||q.outboundMinutes<=0||q.returnMinutes<=0){setIssue('Enter a positive airfare and flight durations in both directions.');return;}
    if(!q.source.trim()){setIssue('Identify where you found the fare (such as the airline or travel portal).');return;}
    if(q.connections<0){setIssue('Connections cannot be negative.');return;}
    setIssue('');
    onSave({...q,id:q.id||quoteKey(),origin:q.origin.toUpperCase(),destination:q.destination.toUpperCase(),returnOrigin:q.returnOrigin.toUpperCase()});
  }
  return <section className="travel-quote-form">
    <div className="travel-section-line"><div><h3>{initial.id?'Edit a flight quote':'Record a flight you actually found'}</h3>
      <p>Enter a real airline or travel-site quote. Field Sales Atlas does not invent airfare.</p></div>
      <button className="op-icon-button" onClick={onCancel} aria-label="Close quote editor"><X size={17}/></button>
    </div>
    <div className="travel-fields three">
      <label>Departure airport<select value={q.origin} onChange={e=>change('origin',e.target.value)}>
        {[...new Set([...origins,q.origin].filter(Boolean))].map(code=><option value={code} key={code}>{code}</option>)}
      </select></label>
      <label>Fly into<select value={q.destination} onChange={e=>change('destination',e.target.value)}>
        {destOptions.map(code=><option value={code} key={code}>{code}</option>)}
      </select></label>
      <label>Return from<select value={q.returnOrigin} onChange={e=>change('returnOrigin',e.target.value)}>
        {destOptions.map(code=><option value={code} key={code}>{code}</option>)}
      </select></label>
    </div>
    <div className="travel-fields two">
      <label>Airline or itinerary<input value={q.carrier} onChange={e=>change('carrier',e.target.value)} placeholder="Delta, American, Southwest…"/></label>
      <label>Source / site *<input value={q.source} onChange={e=>change('source',e.target.value)} placeholder="Airline website, Google Flights, Concur…"/></label>
    </div>
    <div className="travel-fields four">
      <NumberField label="Airfare, total" value={q.fare} onChange={v=>change('fare',v)} unit="$"/>
      <NumberField label="Baggage" value={q.baggage} onChange={v=>change('baggage',v)} unit="$"/>
      <NumberField label="Other fees" value={q.extra} onChange={v=>change('extra',v)} unit="$"/>
      <label>Fare checked<input type="date" value={q.observedOn} onChange={e=>change('observedOn',e.target.value)}/></label>
    </div>
    <div className="travel-fields three">
      <NumberField label="Outbound flight duration" value={Number((q.outboundMinutes/60).toFixed(2))} onChange={v=>change('outboundMinutes',Math.round(v*60))} unit="hours" step={0.25} max={48}/>
      <NumberField label="Return flight duration" value={Number((q.returnMinutes/60).toFixed(2))} onChange={v=>change('returnMinutes',Math.round(v*60))} unit="hours" step={0.25} max={48}/>
      <NumberField label="Total connections, both legs" value={q.connections} onChange={v=>change('connections',Math.round(v))} max={8}/>
    </div>
    <div className="travel-fields two">
      <NumberField label="Verified total road miles (optional)" value={q.verifiedGroundMiles||0} onChange={v=>change('verifiedGroundMiles',v)} unit="mi" max={20000}/>
      <NumberField label="Verified total driving time (optional)" value={q.verifiedGroundMinutes||0} onChange={v=>change('verifiedGroundMinutes',v)} unit="min" max={20000}/>
    </div>
    <p className="travel-microcopy" style={{marginTop:-8,marginBottom:14}}>Use a verified route result from a navigation app if available. Leave as zero to use clearly labeled geographic estimates.</p>
    <div className="travel-fields two">
      <label>Outbound local arrival (optional)<input type="datetime-local" value={q.outboundArrivalLocal} onChange={e=>change('outboundArrivalLocal',e.target.value)}/></label>
      <label>Return flight departure, departure-airport local time (optional)<input type="datetime-local" value={q.returnDepartureLocal||''} onChange={e=>change('returnDepartureLocal',e.target.value)}/></label>
      <label>Return landing at home airport, local (optional)<input type="datetime-local" value={q.returnLandingLocal} onChange={e=>change('returnLandingLocal',e.target.value)}/></label>
    </div>
    <div className="travel-fields"><label>Comparison notes<input value={q.notes} onChange={e=>change('notes',e.target.value)} placeholder="Refundability, schedule constraints, change conditions…"/></label></div>
    {issue&&<Note warn>{issue}</Note>}
    <div className="travel-actions"><button className="op-btn" onClick={onCancel}>Cancel</button><button className="op-btn primary" onClick={submit}><Check size={15}/> {initial.id?'Update comparison':'Add quote to comparison'}</button></div>
  </section>;
}
function QuoteComparison({results,onEdit,onRemove,prefs}:{results:QuoteResult[];onEdit:(q:FlightQuote)=>void;onRemove:(q:FlightQuote)=>void;prefs:TravelPrefs}){
  const bestCash=[...results].sort((a,b)=>a.cash-b.cash)[0];
  const fullTime=results.filter(r=>r.quote.outboundMinutes>0&&r.quote.returnMinutes>0&&!r.warnings.some(w=>w.includes('Ground travel cannot')));
  const bestTime=[...fullTime].sort((a,b)=>a.totalMinutes-b.totalMinutes)[0];
  const bestBalanced=[...results].sort((a,b)=>a.economicCost-b.economicCost)[0];
  return <>
    <div className="travel-winners">
      {[
        {kind:'Lowest cash estimate',result:bestCash,main:bestCash?currency(bestCash.cash):'—',icon:Wallet},
        {kind:'Least estimated travel time',result:bestTime,main:bestTime?minutesLabel(bestTime.totalMinutes):'—',icon:Clock3},
        {kind:'Lowest time-adjusted cost',result:bestBalanced,main:bestBalanced?currency(bestBalanced.economicCost):'—',icon:Gauge},
      ].map(row=>{
        const Icon=row.icon;
        return <div key={row.kind} className="travel-winner"><span className="travel-winner-top"><Icon size={17}/>{row.kind}</span>
          <strong>{row.main}</strong>
          <span>{row.result?row.result.quote.origin+' → '+row.result.quote.destination+' · '+(row.result.quote.carrier||'Unspecified airline'):'Add complete quotes to compare'}</span>
        </div>;
      })}
    </div>
    <div className="op-table-scroll"><table className="op-table travel-quote-table"><thead><tr>
      <th>Itinerary entered</th><th>Airfare</th><th>Total cash estimate</th><th>Total travel estimate</th><th>Connections</th><th>Approx. home arrival</th><th></th>
    </tr></thead><tbody>
      {results.map(r=><tr key={r.quote.id}>
        <td><strong>{r.quote.origin} → {r.quote.destination}{r.quote.returnOrigin!==r.quote.destination?' / '+r.quote.returnOrigin:''}</strong>
          <small>{r.quote.carrier||'Unspecified airline'} · {r.quote.source||'Source missing'} · checked {r.quote.observedOn||'date unknown'}</small></td>
        <td><strong>{currency(r.quote.fare)}</strong></td><td><strong>{currency(r.cash)}</strong><small>Includes configurable allowances</small></td>
        <td>{r.quote.outboundMinutes>0&&r.quote.returnMinutes>0?minutesLabel(r.totalMinutes):'Incomplete'}<small>{minutesLabel(r.groundMinutes)} ground {r.quote.verifiedGroundMinutes?'entered':'estimate'}</small></td>
        <td>{r.quote.connections}</td><td>{r.homeArrivalLocal||'No landing time entered'}</td>
        <td><div className="op-row-actions">
          <button className="op-icon-button" title="Edit quote" onClick={()=>onEdit(r.quote)}><Pencil size={16}/></button>
          <button className="op-icon-button" title="Remove quote" onClick={()=>onRemove(r.quote)}><Trash2 size={16}/></button>
        </div></td>
      </tr>)}
    </tbody></table></div>
    <div className="travel-estimate-summary">
      <ShieldCheck size={16}/>
      <span>Results combine your manually entered airfare with hotel, meals, parking, rental, home transfer, and approximate ground travel assumptions. Time-adjusted cost values travel hours at {currency(prefs.valueOfTimePerHour)}/hour. These are planning comparisons, not verified airline prices or actual road travel times.</span>
    </div>
    <div className="travel-breakdown">
      {bestCash&&<details><summary>See estimated cash-cost breakdown and uncertainty <ChevronDown size={15}/></summary>
        <div className="travel-breakdown-inner">
          {bestCash.expenseBreakdown.map(row=><div key={row.name}><span>{row.name}</span><strong>{currency(row.amount)}</strong></div>)}
          <div className="travel-breakdown-total"><span>Estimated cash total</span><strong>{currency(bestCash.cash)}</strong></div>
          {bestCash.warnings.map(w=><p key={w}><CircleAlert size={13}/>{w}</p>)}
        </div>
      </details>}
    </div>
  </>;
}
function TravelPrefsDialog({prefs,onDismiss,onSave,busy,airports}:{prefs:TravelPrefs;onDismiss:()=>void;onSave:(prefs:TravelPrefs)=>void;busy:boolean;airports:Airport[]}){
  const [form,setForm]=useState<TravelPrefs>({...prefs,homeDriveMinutes:{...prefs.homeDriveMinutes}});
  const [candidate,setCandidate]=useState('');
  const [query,setQuery]=useState('');
  const filtered=airports.filter(a=>valid(a.iata)&&(a.iata+' '+a.name+' '+a.state).toLowerCase().includes(query.toLowerCase())).slice(0,45);
  const setField=<K extends keyof TravelPrefs>(key:K,value:TravelPrefs[K])=>setForm(prev=>({...prev,[key]:value}));
  function addAirport(){
    if(!valid(candidate))return;
    if(form.homeAirports.includes(candidate))return;
    setForm(prev=>({...prev,homeAirports:[...prev.homeAirports,candidate],homeDriveMinutes:{...prev.homeDriveMinutes,[candidate]:60}}));
    setQuery('');setCandidate('');
  }
  return <div className="op-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onDismiss();}}>
    <div className="op-modal large" role="dialog" aria-modal="true" aria-label="Personal travel settings">
      <div className="op-modal-head"><div><h2>Personal travel settings</h2><p>These settings are shared with anyone holding your workspace link.</p></div><button className="op-icon-button" onClick={onDismiss}><X size={20}/></button></div>
      <div className="op-modal-body">
        <Kicker>01 · HOME AIRPORTS</Kicker>
        <div className="travel-prefs-airports">
          {form.homeAirports.map(code=><div className="travel-prefs-origin" key={code}>
            <div><strong>{code}</strong><small>Approx. travel time from home</small></div>
            <div className="travel-prefs-minutes"><input type="number" min="0" max="300" value={form.homeDriveMinutes[code]??60}
              onChange={e=>setForm(p=>({...p,homeDriveMinutes:{...p.homeDriveMinutes,[code]:num(e.target.value)}}))}/><span>min</span></div>
            <button className="op-icon-button" onClick={()=>setForm(p=>({...p,homeAirports:p.homeAirports.filter(x=>x!==code)}))}><X size={16}/></button>
          </div>)}
          <div className="travel-fields two">
            <label>Add home departure airport
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search airports by code or name"/>
            </label>
            <label>Choose airport
              <select value={candidate} onChange={e=>setCandidate(e.target.value)}><option value="">Select airport</option>
                {filtered.map(a=><option value={a.iata} key={a.iata+a.name}>{a.iata} · {a.name}</option>)}
              </select>
            </label>
          </div>
          <button className="op-btn tiny" onClick={addAirport} disabled={!candidate||form.homeAirports.includes(candidate)}><Plus size={14}/> Add airport</button>
        </div>
        <Kicker>02 · PLANNING BUFFERS & COSTS</Kicker>
        <div className="travel-prefs-grid">
          <NumberField label="Preflight airport buffer" value={form.checkinMinutes} onChange={v=>setField('checkinMinutes',v)} unit="min" max={240}/>
          <NumberField label="Rental pickup buffer" value={form.rentalPickupMinutes} onChange={v=>setField('rentalPickupMinutes',v)} unit="min" max={180}/>
          <NumberField label="Rental return buffer" value={form.rentalReturnMinutes} onChange={v=>setField('rentalReturnMinutes',v)} unit="min" max={180}/>
          <NumberField label="Hotel per night" value={form.hotelPerNight} onChange={v=>setField('hotelPerNight',v)} unit="$"/>
          <NumberField label="Meals per day" value={form.mealsPerDay} onChange={v=>setField('mealsPerDay',v)} unit="$"/>
          <NumberField label="Rental car per day" value={form.rentalPerDay} onChange={v=>setField('rentalPerDay',v)} unit="$"/>
          <NumberField label="Parking per day" value={form.parkingPerDay} onChange={v=>setField('parkingPerDay',v)} unit="$"/>
          <NumberField label="Fuel / charging per road mile" value={form.fuelPerMile} onChange={v=>setField('fuelPerMile',v)} unit="$/mi" max={3} step={0.01}/>
          <NumberField label="Estimated tolls per trip" value={form.tollsPerTrip} onChange={v=>setField('tollsPerTrip',v)} unit="$"/>
          <NumberField label="Other ground transport per trip" value={form.groundMiscPerTrip} onChange={v=>setField('groundMiscPerTrip',v)} unit="$"/>
          <NumberField label="Value of travel time" value={form.valueOfTimePerHour} onChange={v=>setField('valueOfTimePerHour',v)} unit="$/hr"/>
          <NumberField label="Approx. road distance multiplier" value={form.roadMultiplier} onChange={v=>setField('roadMultiplier',v)} min={1} max={2.3} step={0.05}/>
          <NumberField label="Approx. road speed" value={form.assumedRoadMph} onChange={v=>setField('assumedRoadMph',v)} unit="mph" min={15} max={75}/>
          <NumberField label="Maximum preferred connections" value={form.maxConnections} onChange={v=>setField('maxConnections',v)} max={4}/>
        </div>
        <label className="travel-checkbox"><input type="checkbox" checked={form.preferNonstop} onChange={e=>setField('preferNonstop',e.target.checked)}/> Prefer nonstop itineraries</label>
        <div className="travel-fields"><label>Preferred airlines (optional)<input value={form.preferredAirlines} onChange={e=>setField('preferredAirlines',e.target.value)} placeholder="United, Delta, American…"/></label></div>
        <Note warn>These are planning assumptions only. Airport drive time is entered by you. Road distance/time uses a rough model and can differ substantially from actual traffic, geography or season.</Note>
        <div className="travel-actions"><button className="op-btn" onClick={onDismiss}>Cancel</button>
          <button className="op-btn primary" onClick={()=>onSave(safeTravelPrefs(form))} disabled={busy||!form.homeAirports.length}><Check size={15}/>{busy?'Saving...':'Save personal travel profile'}</button></div>
      </div>
    </div>
  </div>;
}
export default function AirTravelPage({initialTab='discover'}:{initialTab?:'discover'|'smart'|'compare'|'saved'}){
  const ctx=useOp();
  const {board,airports,geo,geoBusy,geoError,identity}=ctx;
  const managers=board.managers||[];
  const [plans,setPlans]=useState<TravelPlan[]>([]);
  const [currentId,setCurrentId]=useState('');
  const [stalePlan,setStalePlan]=useState(false);
  const [plan,setPlan]=useState<TravelPlan>(()=>newTravelPlan());
  const [prefs,setPrefs]=useState<TravelPrefs>(defaultTravelPrefs);
  const [,setPrefsSaved]=useState(false);
  const [prefsOpen,setPrefsOpen]=useState(false);
  const [prefsBusy,setPrefsBusy]=useState(false);
  const [busy,setBusy]=useState(false);
  const commitKey=useRef('');
  const [pageError,setPageError]=useState('');
  const [pageNotice,setPageNotice]=useState('');
  const [placeQuery,setPlaceQuery]=useState('');
  const [managerQuery,setManagerQuery]=useState('');
  const [airportQuery,setAirportQuery]=useState('');
  const [manualAirport,setManualAirport]=useState('');
  const [showManagers,setShowManagers]=useState(false);
  const [showAirportSearch,setShowAirportSearch]=useState(false);
  const [showQuoteForm,setShowQuoteForm]=useState(false);
  const [editingQuote,setEditingQuote]=useState<FlightQuote|null>(null);
  const [tab,setTab]=useState<'discover'|'smart'|'compare'|'saved'>(initialTab);
  useEffect(()=>{setTab(initialTab);},[initialTab]);
  const [isFetching,setFetching]=useState(false);
  const [useExample,setUseExample]=useState(false);
  const tripLocation=plan.destination;
  const isCanadian=!!CANADA_REGION_BY_CODE[ctx.state];
  const chosenManagers=managers.filter(m=>plan.managerIds.includes(m.id));
  const completePeople=chosenManagers.filter(m=>Number.isFinite(m.lat)&&Number.isFinite(m.lon));
  const gateways=useMemo(()=>airportGateways(airports,tripLocation,chosenManagers,prefs,12),
    [airports,tripLocation,chosenManagers,prefs]);
  // A calculated nearest airport is only a suggestion, never an implicit choice.
  // Confirming an arrival airport is required before itinerary scheduling.
  const suggestedGateway=gateways[0]?.airport;
  const airport=plan.selectedArrival
    ?airports.find(a=>a.iata===plan.selectedArrival)
    :undefined;
  const arrivalCode=plan.selectedArrival||'';
  const compareQuotes=useMemo(()=>plan.quotes.map(q=>calcQuote(q,plan,prefs,airports,managers))
    .sort((a,b)=>a.economicCost-b.economicCost),[plan,prefs,airports,managers]);
  const compareManagers=managers.filter(m=>(m.name+' '+m.baseCity+' '+m.trainer+' '+m.baseState).toLowerCase().includes(managerQuery.toLowerCase()))
    .sort((a,b)=>Number(b.baseState===ctx.state)-Number(a.baseState===ctx.state)).slice(0,10);
  const places=(isCanadian?CANADA_CITIES.filter(c=>c.state===ctx.state):geo.places).filter(a=>(a.name+' '+a.code).toLowerCase().includes(placeQuery.toLowerCase())).slice(0,7);
  const searchAirports=airports.filter(a=>valid(a.iata)&&(a.iata+' '+a.name+' '+a.state).toLowerCase().includes(airportQuery.toLowerCase()))
    .slice(0,22);
  const origins=plan.origins.filter(valid);
  const shownOptions=gateways.slice(0,8);
  const readiness=[
    {name:'Destination',complete:Boolean(tripLocation||chosenManagers.length),next:'Choose a city or manager'},
    {name:'Departure',complete:origins.length>0,next:'Set your home airport'},
    {name:'Arrival',complete:Boolean(arrivalCode),next:'Choose an arrival airport'},
  ];
  const readinessCount=readiness.filter(item=>item.complete).length;
  const nextIncomplete=readiness.find(item=>!item.complete);
  function goReadiness(){
    if(!nextIncomplete)return;
    if(nextIncomplete.name==='Departure'){setPrefsOpen(true);return;}
    setTab('discover');
    if(nextIncomplete.name==='Arrival'){
      window.requestAnimationFrame(()=>document.getElementById('travel-airport-options')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }else{
      window.requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('.travel-place-results input, .travel-fields input')?.focus());
    }
  }

  useEffect(()=>{
    let alive=true;
    if(identity!=='member'){setPlans([]);setPrefs(defaultTravelPrefs);setPrefsSaved(false);return;}
    setFetching(true);
    setCurrentId('');
    const traveler=ctx.activeTrainer;
    const key=ctx.activeTrainerId;
    Promise.all([api.get('/api/travel/plans'),api.get('/api/travel/preferences?slot='+key)]).then(([plansRes,prefsRes])=>{
      if(!alive)return;
      const saved=(plansRes.data.plans||[]) as TravelPlan[];
      setPlans(saved);
      const p=safeTravelPrefs(prefsRes.data.preferences||defaultTravelPrefs);
      // Home airport identity belongs to the chosen trainer, never the shared guest account.
      p.homeAirports=traveler.homeAirports.slice();
      p.homeDriveMinutes={...p.homeDriveMinutes,...traveler.homeDriveMinutes};
      p.preferredAirlines=traveler.preferredAirlines;
      p.preferNonstop=traveler.preferNonstop;
      p.maxConnections=traveler.maxConnections;
      setPrefs(p);setPrefsSaved(!!prefsRes.data.preferences||traveler.homeAirports.length>0);
      setPlan(current=>({
        ...current,
        id:'',
        trainer:traveler.name,
        origins:traveler.homeAirports.slice(),
        quotes:[],
        // Preserve a state/manager selection coming from the map while
        // the trainer preference request finishes in the background.
      }));
    }).catch(e=>{if(alive)setPageError('Could not load travel workspace: '+(e instanceof Error?e.message:'Request failed'));})
      .finally(()=>{if(alive)setFetching(false);});
    return ()=>{alive=false;};
  },[identity,ctx.activeTrainerId]);

  // Live updates refresh the saved-plan index without wiping the current draft.
  // An edited plan is flagged rather than silently overwritten.
  useEffect(()=>{
    // Do not flag this trainer's own in-flight save as a remote conflict.
    if(!ctx.syncRevision||identity!=='member'||busy)return;
    let active=true;
    void api.get('/api/travel/plans').then(response=>{
      if(!active)return;
      const latest=(response.data.plans||[]) as TravelPlan[];
      setPlans(latest);
      if(currentId){
        const remote=latest.find(item=>item.id===currentId);
        if(!remote||Boolean(plan.updatedAt&&remote.updatedAt&&remote.updatedAt!==plan.updatedAt))
          setStalePlan(true);
      }
    }).catch(()=>{if(active)setPageNotice('Another trainer made a change. Refresh saved plans to review it.');});
    return ()=>{active=false;};
  },[ctx.syncRevision,busy]);
  useEffect(()=>{
    const req=ctx.travelRequest;
    if(!req)return;
    commitKey.current='';
    const requestedIds=requestedManagerIds(req);
    const person=managers.find(manager=>manager.id===(req.managerId||requestedIds[0]));
    const hasManagerLocation=!!person&&Number.isFinite(person.lat)&&Number.isFinite(person.lon);
    const canadian=CANADA_REGION_BY_CODE[req.state];
    const destination=hasManagerLocation?{
      name:person!.baseCity||person!.name+' base',
      state:req.state,lat:person!.lat!,lon:person!.lon!,code:'manager-base'
    }:req.reference&&Number.isFinite(req.reference.lat)&&Number.isFinite(req.reference.lon)?{
      name:req.reference.label,state:req.state,
      lat:req.reference.lat,lon:req.reference.lon,code:'region-reference'
    }:canadian?{
      name:canadian.anchorCity,state:req.state,lat:canadian.lat,lon:canadian.lon,code:'province-reference'
    }:null;
    setPlan(p=>({...p,
      managerIds:requestedIds,
      trainer:ctx.activeTrainer.name,
      origins:ctx.activeTrainer.homeAirports.slice(),
      departDate:req.departDate||p.departDate,
      returnDate:req.returnDate||p.returnDate,
      destination,selectedArrival:req.arrivalAirport||'',quotes:[],
    }));
    setPlaceQuery(destination?.name||'');
    setUseExample(false);
    setShowManagers(requestedIds.length>0);
    if(requestedIds.length>1)setPageNotice(requestedIds.length+' managers carried into this circuit. Review locations and dates before saving.');
    setTab('discover');
    ctx.clearTravelRequest();
  },[ctx.travelRequest?.nonce]);

  useEffect(()=>{
    // Keep the next workflow screen's header and action area in view after switching steps.
    if(typeof window!=='undefined')window.scrollTo(0,0);
  },[tab]);

  function setField<K extends keyof TravelPlan>(key:K,value:TravelPlan[K]){
    commitKey.current='';
    setPlan(prev=>({...prev,[key]:value}));
    setPageNotice('');
  }
  function chooseState(next:string){
    commitKey.current='';
    ctx.setState(next);ctx.setMapMode('state');setPlaceQuery('');
    setPlan(p=>({...p,destination:p.destination?.state===next?p.destination:null}));
  }
  function choosePlace(p:TravelPlace){
    commitKey.current='';
    setPlan(prev=>({...prev,destination:p,selectedArrival:'',quotes:prev.quotes}));
    ctx.setState(p.state);ctx.setMapMode('state');setPlaceQuery(p.name);
    setUseExample(!!samplePlaces.find(x=>x.state===p.state&&x.name===p.name));
  }
  function toggleManager(id:string){
    commitKey.current='';
    setPlan(p=>({...p,managerIds:p.managerIds.includes(id)?p.managerIds.filter(x=>x!==id):[...p.managerIds,id].slice(0,12),selectedArrival:''}));
  }
  function chooseGateway(code:string){
    if(code!==arrivalCode){
      setPlan(p=>({...p,selectedArrival:code}));
      setPageNotice('Arrival airport changed to '+code+'. Existing quotes are retained but apply only to their original airports. Recheck flight options.');
      commitKey.current='';
    }
    setTab('discover');setManualAirport('');setAirportQuery('');
  }
  function toggleOrigin(code:string){
    setPlan(p=>({...p,origins:p.origins.includes(code)?p.origins.length>1?p.origins.filter(x=>x!==code):p.origins:[...p.origins,code].slice(0,6)}));
  }
  function choosePlan(record:TravelPlan){
    commitKey.current='';
    setPlan({...record,quotes:(record.quotes||[]).map(q=>({...q}))});
    setCurrentId(record.id);setStalePlan(false);setTab('discover');setShowQuoteForm(false);
    setPageError('');setPageNotice('Travel plan loaded from your team.');
    if(record.destination)ctx.setState(record.destination.state);
  }
  function newPlan(){
    commitKey.current='';
    setCurrentId('');setStalePlan(false);setPlan({...newTravelPlan(prefs.homeAirports[0]||''),trainer:ctx.activeTrainer.name,origins:prefs.homeAirports.slice()});
    setUseExample(false);setPlaceQuery('');setPageError('');setPageNotice('New travel plan started.');setTab('discover');
    setShowQuoteForm(false);
  }
  async function refresh(){
    if(identity!=='member')return;
    setFetching(true);setPageError('');
    try{
      const r=await api.get('/api/travel/plans');
      setPlans(r.data.plans||[]);
      setPageNotice('Travel plans refreshed.');
    }catch(e){setPageError(e instanceof Error?e.message:'Could not refresh plans');}
    finally{setFetching(false);}
  }
  async function savePlan(){
    if(identity!=='member'){setPageError('Open your shared workspace before saving travel plans.');return;}
    if(stalePlan){setPageError('Another trainer changed this saved plan. Load the latest version before making more edits.');return;}
    const name=(plan.title||'').trim()||((chosenManagers[0]?.name||tripLocation?.name||'Field')+' coaching travel');
    if(!origins.length){setPageError('Choose at least one departure airport.');return;}
    if(!plan.managerIds.length&&!plan.destination){setPageError('Choose at least one manager or a destination city.');return;}
    if(plan.departDate>plan.returnDate){setPageError('Return date must be on or after departure.');return;}
    setBusy(true);setPageError('');
    try{
      const value={...plan,expectedUpdatedAt:plan.updatedAt||'',title:name,
        trainer:plan.trainer||ctx.activeTrainer.name,selectedArrival:arrivalCode||'',planning:getPlanning(plan)};
      const response=currentId?await api.put('/api/travel/plans/'+encodeURIComponent(currentId),value):await api.post('/api/travel/plans',value);
      const savedId=currentId||response.data.plan?.id;
      if(savedId){setCurrentId(savedId);setStalePlan(false);setPlan(p=>({...p,id:savedId,title:name,
        updatedAt:response.data.updatedAt||response.data.plan?.updatedAt||new Date().toISOString()}));}
      await refresh();
      setPageNotice((arrivalCode?'Travel plan':'Travel draft')+' saved for your team. No ticket purchase or booking is required.');
    }catch(e){setPageError(e instanceof Error?e.message:'Travel plan could not be saved.');}
    finally{setBusy(false);}
  }
  async function removePlan(){
    if(!currentId||identity!=='member'||!confirm('Delete this saved air-travel plan and its quotes for the whole team?'))return;
    setBusy(true);setPageError('');
    try{
      await api.delete('/api/travel/plans/'+encodeURIComponent(currentId));
      setPlans(prev=>prev.filter(p=>p.id!==currentId));newPlan();setPageNotice('Travel plan deleted.');
    }catch(e){setPageError(e instanceof Error?e.message:'Could not delete the travel plan.');}
    finally{setBusy(false);}
  }
  async function createItinerary(){
    if(identity!=='member'){setPageError('Open your shared workspace before scheduling.');return;}
    if(!chosenManagers.length){setPageError('Select at least one territory manager to create a coaching trip.');return;}
    if(!arrivalCode){setPageError('Choose an arrival airport before transferring the trip.');return;}
    const schedule=buildCoachingSchedule(plan,airport,managers,prefs);
    if(!schedule.visits.length||schedule.unplaced.length){
      setPageError('The proposed coaching visits do not all fit your working window. Expand the dates or shorten sessions before creating the itinerary.');
      setTab('smart');
      return;
    }
    const existing=board.visits||[];
    const duplicate=schedule.visits.find(item=>existing.some(v=>
      v.managerId===item.manager.id&&v.date===item.date&&v.status!=='Canceled'
    ));
    if(duplicate){
      setPageError(duplicate.manager.name+' already has a visit on '+duplicate.date+'. Resolve the duplicate in Calendar first.');
      setTab('smart');return;
    }
    const overlap=(board.trips||[]).find(t=>t.status==='Planned'&&
      t.trainer===(plan.trainer||ctx.activeTrainer.name)&&t.startDate<=plan.returnDate&&t.endDate>=plan.departDate);
    if(overlap){setPageError('This trainer already has a trip during these dates. Review the shared calendar.');setTab('smart');return;}
    setBusy(true);setPageError('');
    try{
      if(!commitKey.current)commitKey.current=crypto.randomUUID();
      const stops=schedule.visits.map(v=>({
        managerId:v.manager.id,
        startTime:v.start,endTime:v.end,
        stateCode:(v.manager.baseState&&STATE_BY_CODE[v.manager.baseState])?v.manager.baseState:
          (board.assignments||[]).find(a=>a.managerId===v.manager.id)?.stateCode||ctx.state,
        date:v.date,
        location:v.manager.baseCity ? v.manager.baseCity+', '+(v.manager.baseState||ctx.state) : '',
        ...(v.manager.lat!==undefined&&v.manager.lon!==undefined?
          {lat:v.manager.lat,lon:v.manager.lon}:{})
      }));
      const scheduleText=schedule.visits.map(v=>
        v.date+' '+v.start+'-'+v.end+' '+v.manager.name+
        (v.travelBeforeMinutes===null?' (transfer unknown)':' (transfer approx. '+minutesLabel(v.travelBeforeMinutes)+')')
      ).join('\n');
      const note='Generated from Field Sales Atlas smart coaching plan. Proposed appointment windows, not confirmed visits.\n'+
        scheduleText+'\nGround travel approximated. Validate routes, airline schedules, local time zones and meetings before travel.';
      const response=await api.post('/api/travel/commit',{
        requestId:commitKey.current,
        title:(plan.title.trim()||'Air travel coaching circuit')+' · field itinerary',
        trainer:plan.trainer.trim()||chosenManagers[0]?.trainer||ctx.activeTrainer.name,
        startDate:plan.departDate,endDate:plan.returnDate,arrivalAirport:arrivalCode,
        notes:note.slice(0,1500),stops
      });
      await ctx.reload();
      ctx.setNotice((response.data.scheduledVisits||stops.length)+
        ' proposed coaching visits and the itinerary added together to the shared calendar. Meeting times still need confirmation.');
      ctx.go('calendar');
    }catch(e){setPageError(e instanceof Error?e.message:'Could not schedule itinerary and visits together. Check the team calendar before retrying.');}
    finally{setBusy(false);}
  }
  async function savePrefs(next:TravelPrefs){
    if(identity!=='member'){setPageError('Open your shared workspace before saving travel preferences.');return;}
    setPrefsBusy(true);setPageError('');
    try{
      const response=await api.put('/api/travel/preferences?slot='+ctx.activeTrainerId,next);
      const value=safeTravelPrefs(response.data.preferences||next);
      await api.put('/api/trainer-profiles/'+ctx.activeTrainerId,{
        ...ctx.activeTrainer,homeAirports:value.homeAirports,homeDriveMinutes:value.homeDriveMinutes,
        preferredAirlines:value.preferredAirlines,preferNonstop:value.preferNonstop,maxConnections:value.maxConnections
      });
      await ctx.reload();
      setPrefs(value);setPrefsSaved(true);setPrefsOpen(false);
      setPlan(p=>({...p,origins:value.homeAirports.slice(),trainer:ctx.activeTrainer.name}));
      setPageNotice('Travel preferences saved for '+ctx.activeTrainer.name+'.');
    }catch(e){setPageError(e instanceof Error?e.message:'Could not save travel preferences.');}
    finally{setPrefsBusy(false);}
  }
  function beginQuote(q?:FlightQuote){
    if(!arrivalCode){setPageError('Choose an arrival airport before comparing flights.');return;}
    if(!plan.origins.length){setPageError('Choose a departure airport first.');return;}
    setEditingQuote(q||qdefault(plan,arrivalCode));setShowQuoteForm(true);setTab('compare');setPageError('');
  }
  function addQuote(quote:FlightQuote){
    setPlan(p=>({...p,quotes:p.quotes.some(x=>x.id===quote.id)?p.quotes.map(x=>x.id===quote.id?quote:x):[...p.quotes,quote].slice(0,24)}));
    setShowQuoteForm(false);setPageNotice('Flight quote added to this draft. Save the travel plan to preserve it for your team.');
  }
  function removeQuote(q:FlightQuote){
    setPlan(p=>({...p,quotes:p.quotes.filter(x=>x.id!==q.id)}));
    setPageNotice('Quote removed from the draft. Save to update the team copy.');
  }
  function exportPlan(){
    const rows=compareQuotes.map(r=>({
      Origin:r.quote.origin,Arrival:r.quote.destination,ReturnFrom:r.quote.returnOrigin,
      Airline:r.quote.carrier,Source:r.quote.source,FareChecked:r.quote.observedOn,
      EnteredFare:r.quote.fare,EstimatedCash:r.cash,EstimatedTravelMinutes:r.totalMinutes,
      EstimatedGroundMinutes:r.groundMinutes,Connections:r.quote.connections,
      EstimatedEconomicCost:r.economicCost,Warnings:r.warnings.join(' | ')
    }));
    if(!rows.length){setPageError('Add real flight quotes to export a comparison.');return;}
    exportCSV('field-atlas-air-travel-comparison.csv',rows);
  }
  function copyTrip(){
    const text=[
      'FIELD SALES ATLAS · TRAVEL COMPARISON',
      (plan.title||'Untitled field trip'),
      'Dates: '+plan.departDate+' to '+plan.returnDate,
      'Manager visits: '+(chosenManagers.map(m=>m.name).join(', ')||'Not selected'),
      'Destination: '+(tripLocation?tripLocation.name+', '+tripLocation.state:'Manager bases'),
      'Home airports: '+origins.join(', '),
      'Preferred arrival: '+(arrivalCode||'Not selected'),
      '',...compareQuotes.map(r=>[
        r.quote.origin+' → '+r.quote.destination+' ('+(r.quote.carrier||'airline not entered')+')',
        'Entered fare: '+currency(r.quote.fare)+' · estimated complete cash cost '+currency(r.cash),
        'Estimated travel: '+minutesLabel(r.totalMinutes)+' · connections '+r.quote.connections
      ].join('\n')),'','These figures are planning comparisons, not live fares, measured road routes, or confirmed booking availability.',
    ].join('\n');
    navigator.clipboard.writeText(text).then(()=>setPageNotice('Travel comparison copied.')).catch(()=>{downloadFile('travel-summary.txt',text,'text/plain');setPageNotice('Text summary downloaded.');});
  }
  const routeLink=airport&&completePeople.length===chosenManagers.length&&completePeople.length>0
    ?googleMapRoute(airport,chosenManagers):'';
  return <div className="travel-page">
    <header className="travel-command-head atlas-editorial-head">
      <div className="travel-command-intro">
        <h1>Travel planning</h1>
        <p>Planning for <strong>{ctx.activeTrainer.name}</strong>. Choose your destination, compare airports, and coordinate coaching visits.</p>
        <div className="travel-command-summary" aria-live="polite">
          <span><MapPin size={14}/>{tripLocation?tripLocation.name+', '+tripLocation.state:chosenManagers.length?chosenManagers.length+' manager visits':'No destination selected'}</span>
          <span><PlaneTakeoff size={14}/>{origins.join(' / ')||'Departure airport needed'}</span>
          <span><CalendarDays size={14}/>{plan.departDate&&plan.returnDate?dateLabel(plan.departDate,{month:'short',day:'numeric'})+' – '+dateLabel(plan.returnDate,{month:'short',day:'numeric'}):'Choose travel dates'}</span>
        </div>
      </div>
      <div className="travel-command-actions">
        <button className="op-btn" onClick={newPlan} title="Start a new trip"><Plus size={16}/><span className="travel-command-long">New trip</span><span className="travel-command-short">New</span></button>
        <button className={'op-btn'+(tab==='saved'?' fsa-saved-current':'')} type="button" onClick={()=>setTab('saved')} aria-pressed={tab==='saved'}><Layers size={16}/> Saved plans</button>
        <button className="op-btn" onClick={()=>setPrefsOpen(true)} title="Edit travel preferences"><Settings2 size={16}/><span className="travel-command-long">Preferences</span><span className="travel-command-short">Settings</span></button>
        <button className="op-btn primary" onClick={savePlan} disabled={busy||stalePlan||identity!=='member'} title="Save this travel plan"><Check size={16}/><span className="travel-command-long">{busy?'Saving…':arrivalCode?'Save plan':'Save draft'}</span><span className="travel-command-short">{busy?'Saving':arrivalCode?'Save':'Draft'}</span></button>
      </div>
    </header>
    {stalePlan&&<div className="atlas-sync-conflict" role="alert"><CircleAlert size={17}/>
      <span>Another trainer changed this saved itinerary. Review the latest version before saving, so neither editor loses their work.</span>
      <button type="button" onClick={()=>{const latest=plans.find(p=>p.id===currentId);if(latest)choosePlan(latest);else newPlan();setStalePlan(false);}}>Load latest</button>
    </div>}
    {pageError&&<div className="op-error"><CircleAlert size={16}/><span>{pageError}</span><button aria-label="Dismiss error" onClick={()=>setPageError('')}><X size={15}/></button></div>}
    {pageNotice&&<div className="op-notice"><CheckCircle2 size={16}/><span>{pageNotice}</span><button aria-label="Dismiss notice" onClick={()=>setPageNotice('')}><X size={15}/></button></div>}
    <section className="studio-travel-ready" aria-label="Trip readiness">
      <div className="studio-travel-ready-heading">
        <div><span>TRIP READINESS</span><strong>{readinessCount} of 3 checkpoints complete</strong></div>
        <span className="studio-travel-source">{ctx.airportSource==='live'?'Recent public airport directory':ctx.airportSource==='cached'?'Last complete airport snapshot':'Limited airport fallback'}</span>
      </div>
      <div className="studio-travel-checkpoints">
        {readiness.map((step,index)=><span key={step.name} className={step.complete?'is-complete':'is-pending'}>
          {step.complete?<Check size={14}/>:<b>{index+1}</b>}{step.name}
        </span>)}
      </div>
      {nextIncomplete?<div className="studio-travel-ready-action">
        <span>Next: <strong>{nextIncomplete.next}</strong>. Planning and saving a trip does not require airfare entry or booking.</span>
        <button type="button" onClick={goReadiness}>Continue <ArrowRight size={15}/></button>
      </div>:<div className="studio-travel-ready-action">
        <span><strong>Ready for travel intelligence.</strong> No flight purchase or airfare entry required.</span>
        <button type="button" onClick={()=>ctx.go('radar')}>Open flight radar <ArrowRight size={15}/></button>
      </div>}
    </section>
    <nav className="travel-workflow" aria-label="Trip planning steps">
      <button className={'travel-step'+(tab==='discover'?' active':'')} aria-current={tab==='discover'?'step':undefined} onClick={()=>setTab('discover')}><span className="travel-step-index">1</span><span className="travel-step-copy"><strong>Choose visits</strong><small>Managers & airports</small></span><ChevronRight size={17}/></button>
      <button className={'travel-step'+(tab==='smart'?' active':'')} aria-current={tab==='smart'?'step':undefined} onClick={()=>setTab('smart')}><span className="travel-step-index">2</span><span className="travel-step-copy"><strong>Build route</strong><small>Coaching schedule</small></span><ChevronRight size={17}/></button>
      <button className={'travel-step'+(tab==='compare'?' active':'')} aria-current={tab==='compare'?'step':undefined} onClick={()=>setTab('compare')}><span className="travel-step-index">3</span><span className="travel-step-copy"><strong>Compare travel</strong><small>Real quotes & total cost</small></span><ChevronRight size={17}/></button>

    </nav>
    {tab==='discover'&&<div className="travel-main-layout">
      <div className="travel-left">
        <section className="travel-panel">
          <div className="travel-section-line"><div><Kicker>01 · DESTINATION</Kicker><h2>Where are you going?</h2><p>Start with a city or the managers you need to coach.</p></div><MapPin size={23}/></div>
          <div className="travel-form-block">
            <div className="travel-fields two">
              <label>Choose destination state<select value={ctx.state} onChange={e=>chooseState(e.target.value)}>
                <optgroup label="United States">{STATES.map(s=><option value={s.code} key={s.code}>{s.name}</option>)}</optgroup>
                <optgroup label="Canada">{CANADA_REGIONS.map(s=><option value={s.code} key={'CA'+s.code}>{s.name}</option>)}</optgroup>
              </select></label>
              <label>Find a city or town<input value={placeQuery} onChange={e=>setPlaceQuery(e.target.value)} placeholder={geoBusy?'Loading Census places…':'Search the selected state…'}/></label>
            </div>
            {placeQuery&&places.length>0&&(!plan.destination||placeQuery!==plan.destination.name)&&<div className="travel-place-results">
              {places.map(a=><button key={a.code} onClick={()=>choosePlace({name:a.name,state:ctx.state,lat:a.lat!,lon:a.lon!,code:a.code})} disabled={a.lat==null||a.lon==null}>
                <MapPin size={14}/><span>{a.name}, {ctx.state}</span><ChevronRight size={13}/>
              </button>)}
            </div>}
            {!isCanadian&&geoError&&<Note warn>City lookup: {geoError} You can still select a mapped manager or a sample city below.</Note>}
            <div className="travel-city-shortcuts">
              <span>{samplePlaces.some(p=>p.state===ctx.state)?'Quick city choices:':'Use the city search above or choose a manager below.'}</span>
              {samplePlaces.filter(p=>p.state===ctx.state).slice(0,4).map(p=><button key={p.name} onClick={()=>choosePlace(p)}>{p.name}</button>)}
            </div>
            {tripLocation&&<div className="travel-selected-place"><MapPin size={18}/><div><strong>{tripLocation.name}{tripLocation.code==='region-reference'?'':', '+(STATE_BY_CODE[tripLocation.state]?.name||tripLocation.state)}</strong><span>{tripLocation.code==='manager-base'?'Manager base coordinates':tripLocation.code==='region-reference'?'State-region centroid, a starting point only':isCanadian?'Canadian city reference coordinates':useExample?'Approximate example city coordinates':'Census place center coordinates'} · not a confirmed meeting address</span></div>
              <button onClick={()=>{setField('destination',null);setPlaceQuery('');setUseExample(false);}} aria-label="Clear destination"><X size={16}/></button></div>}
            <div className="travel-fields two travel-date-fields">
              <label>Depart<input type="date" value={plan.departDate} onChange={e=>setField('departDate',e.target.value)}/></label>
              <label>Return<input type="date" min={plan.departDate} value={plan.returnDate} onChange={e=>setField('returnDate',e.target.value)}/></label>
            </div>
            {(tripLocation||chosenManagers.length>0)&&<button className="travel-jump-airports" onClick={()=>document.getElementById('travel-airport-options')?.scrollIntoView({behavior:'smooth',block:'start'})}>
              <PlaneLanding size={17}/> See nearby airports <ArrowRight size={16}/>
            </button>}
            <div className="travel-form-divider"/>
            <div className="travel-manager-disclosure">
              <button className="travel-manager-toggle" aria-expanded={showManagers} aria-controls="travel-manager-picker" onClick={()=>setShowManagers(value=>!value)}>
                <Users size={20}/>
                <span><strong>Territory managers</strong><small>{chosenManagers.length?chosenManagers.length+' selected for this trip':managers.length?'Choose managers for coaching visits':'Add managers to plan coaching visits'}</small></span>
                <ChevronDown size={19} className={showManagers?'expanded':''}/>
              </button>
              {showManagers&&<div id="travel-manager-picker" className="travel-manager-expanded">
            <div className="travel-search"><Search size={17}/><input value={managerQuery} onChange={e=>setManagerQuery(e.target.value)} placeholder="Search team managers, trainer, city or state…"/></div>
            {identity!=='member'&&<p className="travel-microcopy">Loading the shared manager directory. You can still search by city.</p>}
            {identity==='member'&&managers.length===0&&<div className="travel-setup-helper">
              <Users size={20}/><div><strong>No territory managers added yet</strong>
                <p>You can plan by city now, or add your managers to build multi-stop coaching trips.</p>
                <button onClick={()=>ctx.go('managers')}>Add territory managers <ArrowRight size={14}/></button>
              </div>
            </div>}
            {identity==='member'&&managers.length>0&&compareManagers.length===0&&<p className="travel-microcopy">No managers match this search. Try a name, city or state abbreviation.</p>}
            {compareManagers.length>0&&<div className="travel-manager-picker">
              {compareManagers.map(m=><button className={plan.managerIds.includes(m.id)?'selected':''} key={m.id} onClick={()=>toggleManager(m.id)}>
                <span className="travel-check">{plan.managerIds.includes(m.id)?<Check size={13}/>:<Plus size={12}/>}</span>
                <span><strong>{m.name}</strong><small>{[m.baseCity,m.baseState].filter(Boolean).join(', ')||'Location not set'} · {m.trainer||'Trainer unassigned'}</small></span>
              </button>)}
            </div>}

              </div>}
            {plan.managerIds.length>0&&<div className="travel-selected-managers">
              {chosenManagers.map(m=><button key={m.id} onClick={()=>toggleManager(m.id)}>{m.name}<X size={12}/></button>)}
              {completePeople.length!==chosenManagers.length&&<p><CircleAlert size={13}/> {chosenManagers.length-completePeople.length} manager location(s) need coordinates for routing.</p>}
            </div>}

            </div>
            <div className="travel-form-divider"/>
            <details className="travel-more-details">
              <summary>Trip name & additional details <ChevronDown size={16}/></summary>
              <div className="travel-fields"><label>Trip name <span className="travel-optional">(optional)</span>
                <input value={plan.title} onChange={e=>setField('title',e.target.value)} placeholder="Example: Midwest coaching circuit"/>
              </label></div>
            </details>
            {chosenManagers.length>0&&<div className="travel-primary-next">
              <div><strong>{chosenManagers.length} manager{chosenManagers.length===1?'':'s'} selected</strong><span>Set coaching hours and check if the visits fit.</span></div>
              <button className="op-btn primary" onClick={()=>setTab('smart')}>Build itinerary <ArrowRight size={16}/></button>
            </div>}
          </div>
        </section>
        <section id="atlas-departure-options" className="travel-panel">
          <div className="travel-section-line"><div><Kicker>02 · HOME AIRPORTS</Kicker><h2>Where will you fly from?</h2><p>Compare your available departure airports.</p></div><PlaneTakeoff size={22}/></div>
          <div className="travel-home-list">
            {[...new Set([...prefs.homeAirports,...plan.origins])].map(code=>{
              const a=airports.find(a=>a.iata===code);
              return <button key={code} className={'travel-home-option'+(plan.origins.includes(code)?' selected':'')} onClick={()=>toggleOrigin(code)}>
                <span className="travel-check">{plan.origins.includes(code)?<Check size={13}/>:null}</span>
                <div><strong>{code} {a?('· '+a.name):''}</strong><small>{prefs.homeDriveMinutes[code]!==undefined?prefs.homeDriveMinutes[code]+' minutes home drive (your estimate)':'Set home drive time in settings'}</small></div>
              </button>;
            })}
            <button className="travel-edit-link" onClick={()=>setPrefsOpen(true)}><Plus size={14}/> Add or edit home airports</button>
          </div>
          <Note>Home airport travel times are your own settings. They are not automatically measured.</Note>
        </section>
      </div>
      <div className="travel-right">
        <section id="travel-airport-options" className="travel-panel travel-airport-panel">
          <div className="travel-section-line"><div><Kicker>03 · ARRIVAL AIRPORTS</Kicker><h2>Where should you land?</h2><p>Compare airport proximity to your selected destination and visits.</p></div><PlaneLanding size={22}/></div>
          {!gateways.length?<div className="travel-no-gateways"><PlaneLanding size={29}/><strong>Select a destination to compare airports</strong>
            <p>Choose a city or add a manager above to see nearby airports and estimated ground travel.</p>
            {ctx.airportSource==='starter'&&<Note warn>The live airport feed is unavailable. The limited starter airport list does not provide dependable route coordinates.</Note>}
            {ctx.airportSource==='cached'&&<Note warn>Using the last complete airport snapshot because the public provider is unavailable. Verify airport service and airline schedules.</Note>}
          </div>:<>
            <div className="travel-airport-legend"><span><CheckCircle2 size={13}/> Scheduled-service listing</span><span>Road time is estimated, not live traffic</span></div>
            {!arrivalCode&&suggestedGateway&&<div className="studio-gateway-suggestion" role="status">
              <div><span>NEAREST LISTED GATEWAY</span><strong>{suggestedGateway.iata} · {suggestedGateway.name}</strong>
                <small>This is a proximity suggestion, not a confirmed or selected airport.</small>
              </div>
              <button type="button" onClick={()=>chooseGateway(suggestedGateway.iata)}>
                Select {suggestedGateway.iata} <ArrowRight size={15}/>
              </button>
            </div>}
            <div className="travel-gateway-list">{shownOptions.map((g,i)=>{
              const active=(arrivalCode===g.airport.iata);
              return <button key={g.airport.iata} className={'travel-gateway'+(active?' active':'')} onClick={()=>chooseGateway(g.airport.iata)}>
                <span className="travel-gateway-rank">{String(i+1).padStart(2,'0')}</span>
                <span className="travel-gateway-iata">{g.airport.iata}</span>
                <div className="travel-gateway-title"><strong>{g.airport.name}</strong>
                  <span>{g.airport.state} · {g.airport.tier==='Major'?'Large airport':g.airport.tier==='Secondary'?'Secondary airport':'Regional airport'} · {g.airport.scheduled?'Scheduled service listed':'Service unconfirmed'}</span></div>
                <div className="travel-gateway-time"><strong>{minutesLabel(Math.round(g.firstLegMiles*prefs.roadMultiplier/prefs.assumedRoadMph*60))}</strong><small>to first stop*</small></div>
                <span className="travel-gateway-select">{active?<CheckCircle2 size={17}/>:<ChevronRight size={17}/>}</span>
              </button>;
            })}</div>
            <p className="travel-microcopy">* Estimated ground time, not a measured driving route. Check actual airline service and schedules independently.</p>
          </>}
          <div className="travel-arrival-next">
            <div><small>SELECTED ARRIVAL AIRPORT</small><strong>{arrivalCode||'Choose an airport'}</strong><span>{arrivalCode?'Ready to compare flight options':'Select an airport above to continue'}</span></div>
            <button className="op-btn primary" onClick={()=>setTab('compare')} disabled={!arrivalCode}>Compare flights <ArrowRight size={16}/></button>
          </div>
          <button className="travel-airport-search-toggle" aria-expanded={showAirportSearch}
            onClick={()=>setShowAirportSearch(value=>!value)}>
            <Search size={17}/><span>Find another airport or enter a code</span>
            <ChevronDown size={18} className={showAirportSearch?'expanded':''}/>
          </button>
          {showAirportSearch&&<div className="travel-airport-search-picker">
            <label>Search other destination airports</label>
            <div className="travel-search"><Search size={15}/><input value={airportQuery} onChange={e=>setAirportQuery(e.target.value)} placeholder="Airport name or 3-letter code"/></div>
            {airportQuery&&<div className="travel-airport-search-results">
              {searchAirports.map(a=><button key={a.iata+a.name} onClick={()=>chooseGateway(a.iata)}><strong>{a.iata}</strong><span>{a.name} · {a.state} {a.scheduled?'· scheduled service listed':''}</span><ChevronRight size={14}/></button>)}
              {!searchAirports.length&&<span className="travel-microcopy">No airport matches this public directory.</span>}
            </div>}
            <div className="travel-airport-custom"><input maxLength={3} value={manualAirport} onChange={e=>setManualAirport(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))} placeholder="Known IATA code"/>
              <button className="op-btn tiny" disabled={!valid(manualAirport)} onClick={()=>chooseGateway(manualAirport)}>Use code</button></div>
            <p className="travel-microcopy">Manual codes let you search other airports, but routing details may be unavailable.</p>
          </div>}
        </section>
        <section className="travel-panel travel-next-panel">
          <div className="travel-section-line"><div><h3>Find actual flights</h3><p>Search your home airports to {arrivalCode||'the selected arrival airport'}.</p></div><ArrowUpRight size={19}/></div>
          {arrivalCode&&origins.length?origins.map(origin=><a className="travel-search-flight" key={origin} target="_blank" rel="noreferrer"
            href={googleFlightSearch(plan,origin,arrivalCode)}>
            <span><Plane size={16}/><strong>{origin} → {arrivalCode}</strong><small>Search flight schedules and prices</small></span><ExternalLink size={16}/>
          </a>):<p className="travel-microcopy">Select an arrival airport and home departure airport to open an airline-search link.</p>}
          <button className="op-btn primary" style={{width:'100%',marginTop:16}} disabled={!arrivalCode||!origins.length} onClick={()=>{setTab('compare');if(arrivalCode)beginQuote();}}>
            <Plus size={15}/> Compare an actual fare
          </button>
          <Note>External flight-search links are a starting point. Routes, fares, time zones, and availability are not imported into Field Sales Atlas.</Note>
        </section>
        <AirportDisruption origins={origins} arrival={arrivalCode} gateways={gateways}
          currentQuoteCount={plan.quotes.filter(q=>q.destination===arrivalCode).length}
          hourlyValue={prefs.valueOfTimePerHour}
          onCompareFlights={()=>setTab('compare')}
          onReviewDeparture={()=>document.getElementById('atlas-departure-options')?.scrollIntoView({behavior:'smooth',block:'center'})}
          onChooseAirport={chooseGateway}/>
        <AviationWeather airport={airport} travelDate={plan.departDate}/>
      </div>
    </div>}
    {tab==='smart'&&<SmartTripPanel
      plan={plan}
      prefs={prefs}
      airport={airport}
      airports={airports}
      gateways={gateways}
      managers={managers}
      visits={board.visits||[]}
      coaching={board.coaching||[]}
      trips={board.trips||[]}
      onPlanningChange={next=>setPlan(prev=>({...prev,planning:next}))}
      onManagerAdd={toggleManager}
      onAirportSelect={code=>setField('selectedArrival',code)}
      onCreateItinerary={createItinerary}
      onCompareFlights={()=>{setTab('compare');setShowQuoteForm(false);}}
      onSave={savePlan}
      onQuoteEdit={beginQuote}
      signedIn={identity==='member'}
      busy={busy}
    />}
    {tab==='compare'&&<div className="travel-comparison-view">
      <div className="travel-section-line"><div><Kicker>FLIGHT DECISIONS</Kicker><h2>Which flight is actually better?</h2><p>Compare the entire travel journey, not just the ticket price.</p></div>
        <div className="travel-inline-actions"><button className="op-btn" onClick={()=>setTab('discover')}><ArrowLeft size={15}/> Airports</button>
          <button className="op-btn primary" onClick={()=>beginQuote()} disabled={!arrivalCode}><Plus size={15}/> Add a real flight quote</button></div>
      </div>
      <div className="travel-compare-context">
        <div><span>Departure</span><strong>{origins.join(' / ')||'Choose a home airport'}</strong></div>
        <div><span>Arrival</span><strong>{arrivalCode||'Airport not selected'}</strong></div>
        <div><span>Dates</span><strong>{dateLabel(plan.departDate,{month:'short',day:'numeric'})} – {dateLabel(plan.returnDate,{month:'short',day:'numeric'})}</strong></div>
        <div><span>Trip length</span><strong>{countNights(plan.departDate,plan.returnDate)+1} days</strong></div>
      </div>
      <AirportDisruption origins={origins} arrival={arrivalCode} gateways={gateways}
        onChooseAirport={code=>{chooseGateway(code);setTab('compare');}}/>
      <div className="coord-entry"><span><ShieldCheck size={19}/> Free FAA, NOAA and NWS airport intelligence. No booking or payment account.</span>
        <button type="button" onClick={()=>ctx.go('radar')}>Analyze flight conditions <ArrowRight size={16}/></button></div>
      {showQuoteForm&&editingQuote&&<TravelQuoteEditor key={editingQuote.id||'new'} initial={editingQuote} gateways={gateways} origins={origins} onSave={addQuote} onCancel={()=>setShowQuoteForm(false)}/>}
      {!plan.quotes.length?<div className="travel-empty-comparison">
        <div className="travel-flight-symbol"><Plane size={27}/></div><h3>Ready to compare your flights?</h3>
        <p>Enter flight options you have found elsewhere if you want an optional cost comparison. No airfare is required to save an itinerary or use free flight intelligence.</p>
        <button className="op-btn primary" onClick={()=>beginQuote()} disabled={!arrivalCode}><Plus size={15}/> Add first flight quote</button>
        <button className="op-btn" onClick={()=>setTab('discover')}><ArrowLeft size={14}/> Select airports</button>
      </div>:<div className="travel-panel"><QuoteComparison results={compareQuotes} prefs={prefs} onEdit={q=>beginQuote(q)} onRemove={removeQuote}/></div>}
      {plan.quotes.length>0&&<div className="travel-inline-actions" style={{justifyContent:'flex-end',marginTop:15}}>
        <button className="op-btn" onClick={exportPlan}><ArrowDownToLine size={15}/> Download comparison CSV</button>
        <button className="op-btn" onClick={copyTrip}><Copy size={15}/> Copy summary</button>
      </div>}
      {arrivalCode&&origins.length>0&&<div className="travel-panel travel-source-panel">
        <h3>Search alternate departure airports</h3>
        <div className="travel-source-links">{origins.map(code=><a key={code} target="_blank" rel="noreferrer" href={googleFlightSearch(plan,code,arrivalCode)}>
          <PlaneTakeoff size={16}/><strong>{code} → {arrivalCode}</strong><ExternalLink size={14}/></a>)}</div>
        <p>Open the external site to verify airline schedules and live fares. Record options above after confirming details.</p>
      </div>}
    </div>}
    {tab==='saved'&&<div className="travel-panel travel-saved-view">
      <div className="travel-section-line"><div><Kicker>YOUR TEAM’S TRAVEL PLANS</Kicker><h2>Build once. Compare again.</h2><p>Travel plans and entered quotes can be revisited by you and your counterpart.</p></div>
        <button className="op-btn" onClick={refresh} disabled={isFetching||identity!=='member'}><RefreshCw size={15}/> Refresh</button></div>
      {identity!=='member'?<div className="travel-no-gateways"><Users size={25}/><strong>Open your shared workspace to see saved plans</strong><p>Anyone with the workspace link can save, access and edit plans.</p></div>:
        isFetching?<p className="travel-microcopy">Loading saved plans…</p>:
        plans.length===0?<div className="travel-no-gateways"><Layers size={25}/><strong>No shared travel plans yet</strong><p>Use Find arrival airports to create your first trip and save it for the team.</p><button className="op-btn primary" onClick={()=>setTab('discover')}>Start planning <ArrowRight size={14}/></button></div>:
        <div className="travel-saved-list">{[...plans].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).map(record=><button key={record.id} className={currentId===record.id?'current':''} onClick={()=>choosePlan(record)}>
          <div className="travel-saved-plane"><Plane size={20}/></div><div><strong>{record.title}</strong>
            <small>{dateLabel(record.departDate)} – {dateLabel(record.returnDate)} · {record.origins.join(', ')} → {record.selectedArrival||'Arrival pending'}</small>
            <small>{record.managerIds.length} managers · {record.quotes.length} quotes · {record.trainer||'Trainer not set'}</small>
          </div><span>Open <ArrowRight size={14}/></span></button>)}</div>}
    </div>}
    <div className="travel-plan-footer">
      <div><strong>{currentId?'Editing saved team plan':'Unsaved travel plan'}</strong><span>{plan.title||'Add a name, locations, and travel details.'}{plan.quotes.length?' · '+plan.quotes.length+' entered flight quotes':''}</span></div>
      <div className="travel-inline-actions">{currentId&&<button className="op-btn danger" disabled={busy} onClick={removePlan}><Trash2 size={15}/> Delete</button>}
        {routeLink&&<a className="op-btn" target="_blank" rel="noreferrer" href={routeLink}><Route size={16}/> Check route <ExternalLink size={13}/></a>}
        <button className="op-btn" onClick={createItinerary} disabled={busy||identity!=='member'||!chosenManagers.length||!arrivalCode}><Route size={16}/> Build field itinerary</button>
        <button className="op-btn primary" onClick={savePlan} disabled={busy||identity!=='member'}><Check size={16}/>{busy?'Saving…':'Save travel plan'}</button></div>
    </div>
    <div className="travel-final-disclaimer"><ShieldCheck size={15}/> Field Sales Atlas plans and evaluates travel only. It does not book, sell, or charge for flights. Free FAA, NOAA, and NWS intelligence is separate from airline-specific flight status. Optional fare entries and approximate ground estimates must be verified externally.</div>
    {prefsOpen&&<TravelPrefsDialog prefs={prefs} airports={airports} busy={prefsBusy} onDismiss={()=>setPrefsOpen(false)} onSave={savePrefs}/>}
  </div>;
}
