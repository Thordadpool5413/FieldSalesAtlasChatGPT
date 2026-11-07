import JourneyReadiness from './JourneyReadiness';
import { connectionConstraints, createReadinessReport } from '../shared/travel/readiness';
import { changedBookingFields } from './BookedFlightLogic';
import {
ArrowRight,CalendarClock,Check,ChevronDown,CircleAlert,ClipboardPaste,
FilePlus2,FileText,Info,LockKeyhole,Plane,PlaneTakeoff,Plus,Radar,
RefreshCw,ShieldCheck,Sparkles,Trash2,UploadCloud,Users,X
} from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import type { BookedFlight,BookedLeg } from './BookedFlightLogic';
import {
coachingExposure,emptyBookedLeg,itineraryValid,normalizeAirport,
normalizeCarrier,normalizeFlightNumber,parseBookedText,readBookedFlights,
storeBookedFlights
} from './BookedFlightLogic';
import './FlightGuardian.css';
import { useOp } from './Operations';
import { dateLabel,downloadFile } from './opsModels';
import { api } from './workspaceApi';

type Props = { onResearch:()=>void; onCoordinate:()=>void; };
type InputMode = 'paste'|'file'|'manual';
const readableTime=(date:string,time:string)=>dateLabel(date)+(time?' · '+time+' local':' · time unverified');
function textError(error:unknown){return error instanceof Error?error.message:'Action could not be completed.';}
function localNow(){return new Date().toISOString();}
function editableFlight(legs:BookedLeg[],trainerId:BookedFlight['trainerId'],source:BookedFlight['source']):BookedFlight{
  return {
    id:crypto.randomUUID(),
    trainerId,
    legs,
    source,
    verified:false,
    createdAt:localNow(),
    updatedAt:localNow()
  };
}

export default function FlightGuardian({onResearch,onCoordinate}:Props){
  const ctx=useOp();
  const [saved,setSaved]=useState<BookedFlight[]>(readBookedFlights);
  const [selectedId,setSelectedId]=useState('');
  const [replacementId,setReplacementId]=useState('');
  const [checkingZones,setCheckingZones]=useState(false);
  useEffect(()=>{
    let target='';
    try{
      target=sessionStorage.getItem('atlas-guardian-open-flight-v1')||'';
      sessionStorage.removeItem('atlas-guardian-open-flight-v1');
    }catch{}
    if(!target)return;
    const matching=saved.find(item=>item.id===target);
    if(!matching)return;
    selectSaved(matching);
    // Move the user's next task into view after the importer collapses.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      document.getElementById('fg-review-start')?.scrollIntoView({
        block:'start',
        behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'
      });
    }));
  },[]);
  const [draft,setDraft]=useState<BookedFlight>(()=>editableFlight([emptyBookedLeg()],ctx.activeTrainerId,'manual'));
  const [source,setSource]=useState<InputMode>('paste');
  const [paste,setPaste]=useState('');
  const [parsing,setParsing]=useState(false);
  const [parseNotes,setParseNotes]=useState<string[]>([]);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [sharing,setSharing]=useState(false);
  const [sharingAirport,setSharingAirport]=useState('');
  // Do not show a wall of disabled itinerary fields before the user imports a booking.
  const [showDetails,setShowDetails]=useState(false);
  const [fileLabel,setFileLabel]=useState('');
  const changeList=selectedId?changedBookingFields(saved.find(item=>item.id===selectedId)?.legs||[],draft.legs):[];
  const readiness=useMemo(()=>createReadinessReport(draft.legs.map(leg=>({...leg,trainerId:draft.trainerId,review:draft.review})),
    [{id:draft.trainerId,name:ctx.trainerProfiles.find(item=>item.id===draft.trainerId)?.name||'Trainer'}],
    connectionConstraints(draft.legs.map(leg=>({...leg,trainerId:draft.trainerId})))),[draft,ctx.trainerProfiles]);
  const activeTrainer=ctx.trainerProfiles.find(p=>p.id===draft.trainerId);
  const valid=itineraryValid(draft.legs);
  const impacts=useMemo(()=>valid?
    coachingExposure(draft,ctx.board,ctx.trainerProfiles,ctx.airports):[],
    [draft,ctx.board,ctx.trainerProfiles,ctx.airports]);
  const savesForTrainer=saved.filter(item=>item.trainerId===ctx.activeTrainerId);
  const first=draft.legs[0],last=draft.legs[draft.legs.length-1];
  const selfReview=valid&&draft.verified;
  // A calendar trip must include confirmed arrival dates. Unknown overnight
  // arrival days are allowed in private drafts, never silently shared.
  const calendarAirportKnown=!!sharingAirport&&draft.legs.some(leg=>leg.origin===sharingAirport||leg.destination===sharingAirport);
  const calendarDatesComplete=draft.legs.every(leg=>Boolean(leg.arriveDate));

  function clearMessages(){
    setError('');setNotice('');
  }
  function editLeg(id:string,patch:Partial<BookedLeg>){
    clearMessages();setDraft(current=>({
      ...current,verified:false,review:undefined,
      legs:current.legs.map(leg=>leg.id===id?{...leg,...patch}:leg)
    }));
  }
  function addLeg(){
    if(draft.legs.length>=8)return;
    clearMessages();
    setDraft(current=>({
      ...current,verified:false,review:undefined,
      legs:[...current.legs,{
        ...emptyBookedLeg(),
        origin:current.legs[current.legs.length-1]?.destination||'',
        departDate:current.legs[current.legs.length-1]?.arriveDate||
          current.legs[current.legs.length-1]?.departDate||''
      }]
    }));
  }
  function deleteLeg(id:string){
    clearMessages();
    setDraft(current=>({...current,verified:false,review:undefined,
      legs:current.legs.length>1?current.legs.filter(l=>l.id!==id):[emptyBookedLeg()]
    }));
  }
  function fromRaw(raw:string,kind:BookedFlight['source']){
    const parsed=parseBookedText(raw,ctx.airports.map(a=>a.iata));
    setParseNotes(parsed.warnings);
    const previous=saved.find(item=>item.id===replacementId);
    setSelectedId(previous?.id||'');
    setDraft({...editableFlight(parsed.legs.length?parsed.legs:[emptyBookedLeg()],previous?.trainerId||ctx.activeTrainerId,kind),
      ...(previous?{id:previous.id,createdAt:previous.createdAt,revision:previous.revision,changes:previous.changes,sharedTripId:previous.sharedTripId}:{})});
    setReplacementId('');
    setPaste(''); // Raw email + PNR are discarded as soon as extraction finishes.
    setNotice(parsed.legs.length?
      'Draft extracted. Check each airport, date, time and operating flight number.':
      'No reliable flight segments found. Enter the itinerary below.');
    setShowDetails(true);
  }
  function parsePaste(){
    clearMessages();
    if(paste.trim().length<12){setError('Paste the itinerary details, not only the confirmation code.');return;}
    fromRaw(paste,'pasted text');
  }
  async function readFile(file:File|undefined){
    if(!file)return;
    clearMessages();setFileLabel('');
    if(file.size>8_000_000){
      setError('This file is over 8 MB. Paste the itinerary text instead.');return;
    }
    const name=file.name.toLowerCase();
    if(!/\.(txt|eml|pdf)$/.test(name)){
      setError('Choose a .txt, .eml or .pdf airline itinerary.');return;
    }
    setParsing(true);
    try{
      let extracted='';
      if(name.endsWith('.pdf')){
        // Import the PDF engine only when selected. Vite emits a local worker asset.
        const [pdfjs,worker]=await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
        const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
        const pdf=await task.promise;
        if(pdf.numPages>12)throw new Error('PDF exceeds the 12-page local parser limit.');
        for(let index=1;index<=pdf.numPages;index++){
          const page=await pdf.getPage(index);
          const content=await page.getTextContent();
          extracted+=content.items.map(item=>'str' in item?String(item.str):'').join(' ')+'\n';
          if(extracted.length>60000)break;
        }
      }else{
        extracted=(await file.text()).slice(0,60000);
      }
      if(!extracted.trim())throw new Error('No selectable itinerary text was found. Scanned photos require manual entry; nothing was uploaded.');
      setFileLabel(file.name.slice(0,110));
      fromRaw(extracted,'file');
    }catch(err){setError(textError(err));}
    finally{setParsing(false);}
  }
  function newFlight(){
    clearMessages();setSelectedId('');setReplacementId('');setSharingAirport('');
    setParseNotes([]);setPaste('');setFileLabel('');
    setDraft(editableFlight([emptyBookedLeg()],ctx.activeTrainerId,'manual'));
    setSource('paste');setShowDetails(false);
  }
  function selectSaved(record:BookedFlight){
    setDraft({...record,legs:record.legs.map(leg=>({...leg}))});
    setReplacementId('');setSharingAirport('');setSelectedId(record.id);setParseNotes([]);setPaste('');setFileLabel('');
    setShowDetails(true);clearMessages();
    // The review is the task. Don't leave a selected flight buried below import.
    if(window.matchMedia('(max-width:900px)').matches){
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        document.getElementById('fg-review-start')?.scrollIntoView({
          block:'start',
          behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'
        });
      }));
    }
  }
  function save(){
    clearMessages();
    if(!valid){setError('Every leg needs distinct airport codes and a valid departure date. Check dates and flight sequence.');return;}
    const record:BookedFlight={
      ...draft,
      id:selectedId||draft.id,
      updatedAt:localNow(),
      verified:draft.verified,
      revision:(saved.find(item=>item.id===selectedId)?.revision||0)+1,
      changes:changeList.length?[...(draft.changes||[]),{at:localNow(),fields:changeList}].slice(-10):draft.changes,
      legs:draft.legs.map(l=>({
        id:l.id,carrier:l.carrier,flightNumber:l.flightNumber,origin:l.origin,destination:l.destination,
        departDate:l.departDate,departTime:l.departTime,arriveDate:l.arriveDate,arriveTime:l.arriveTime,
        departureZone:l.departureZone,arrivalZone:l.arrivalZone,connection:l.connection
      }))
    };
    try{
      const remaining=saved.filter(item=>item.id!==record.id);
      const next=[record,...remaining].slice(0,30);
      storeBookedFlights(next);setSaved(next);
      setDraft(record);setSelectedId(record.id);
      setNotice('Flight saved on this device. Booking codes, pasted emails and passenger information were not stored.');
    }catch{setError('Browser storage is unavailable. The draft is still visible but has not been saved.');}
  }
  function removeFlight(){
    if(!selectedId)return;
    if(!window.confirm('Remove this saved itinerary from this device? This will not affect the airline reservation or shared team trips.'))return;
    try{
      const next=saved.filter(f=>f.id!==selectedId);
      storeBookedFlights(next);setSaved(next);newFlight();
      setNotice('The local itinerary has been removed.');
    }catch{setError('Could not delete the local itinerary.');}
  }
  function research(leg:BookedLeg){
    if(!/^[A-Z]{3}$/.test(leg.origin)||!/^[A-Z]{3}$/.test(leg.destination)||
      leg.origin===leg.destination||!leg.departDate){
      setError('Review both airport codes and the departure date before researching.');return;
    }
    try{
      // One-time handoff to the app's existing free FAA/NOAA/NWS and BTS research.
      // No PNR, passenger name, full email or ticket data is transferred.
      sessionStorage.setItem('atlas-guardian-research-v1',JSON.stringify({
        origin:leg.origin,destination:leg.destination,
        travelDate:leg.departDate,
        carrier:leg.carrier,flightNumber:leg.flightNumber
      }));
      onResearch();
    }catch{setError('Browser session storage is unavailable. Open Flight DNA and enter the flight manually.');}
  }
  async function publishTrip(){
    if(sharing||!valid||!draft.verified||!selectedId||ctx.identity!=='member')return;
    if(!calendarAirportKnown){setError('Choose the field airport for these travel days.');return;}
    if(!calendarDatesComplete){
      setError('Confirm an arrival date for every leg before publishing shared travel days.');
      return;
    }
    if(!window.confirm(
      'Share these travel days with both trainers? Only the trainer, travel dates and airport codes will be added to the shared trip calendar. No confirmation code, passenger information or ticket is shared.'
    ))return;
    setSharing(true);setError('');setNotice('');
    try{
      const dates=draft.legs.flatMap(leg=>[leg.departDate,leg.arriveDate]).filter(Boolean).sort();
      const start=dates[0],end=dates[dates.length-1];
      const preview='Flight travel · '+first.origin+' → '+last.destination;
      const result=await ctx.submit(()=>api.post('/api/trips',{
        title:preview,trainer:activeTrainer?.name||'',
        startDate:start,endDate:end,
        arrivalAirport:sharingAirport,
        status:'Planned',stops:[],
        notes:'Imported flight travel days; airport codes only. Verify actual airline itinerary and timing separately. No reservation identifier shared.'
      }),'Travel days added to the shared coaching calendar.');
      const tripId=result.data?.trip?.id;
      if(typeof tripId==='string'){
        const updated={...draft,sharedTripId:tripId,updatedAt:localNow()};
        setDraft(updated);
        if(selectedId){
          try{
            const next=saved.map(item=>item.id===selectedId?updated:item);
            storeBookedFlights(next);setSaved(next);
          }catch{ /* Shared trip still saved; local link optional. */ }
        }
      }
      setNotice('Shared trip created. Check Calendar to confirm dates; flight-specific status remains unverified.');
    }catch(err){setError(textError(err));}
    finally{setSharing(false);}
  }
  async function resolveZones(){
    setCheckingZones(true);clearMessages();
    const requested=JSON.stringify(draft.legs);
    try{
      const result=await api.post('/api/travel/itinerary/readiness',{flights:draft.legs.map(leg=>({...leg,trainerId:draft.trainerId,review:draft.review}))});
      setDraft(current=>{
        if(JSON.stringify(current.legs)!==requested)return current;
        return {...current,legs:current.legs.map(leg=>{
          const resolved=result.data.flights.find((item:BookedLeg)=>item.origin===leg.origin&&item.destination===leg.destination&&item.departDate===leg.departDate&&item.departTime===leg.departTime);
          return {...leg,departureZone:resolved?.departureZone,arrivalZone:resolved?.arrivalZone};
        })};
      });
      setNotice('Airport time zones resolved from reference coordinates. Review fields and save to retain them; airline status is not checked.');
    }catch(failure){setError(textError(failure));}finally{setCheckingZones(false);}
  }
  function exportBrief(){
    if(!valid)return;
    const items=[
      'FIELD SALES ATLAS / BOOKED FLIGHT GUARDIAN',
      'Review-only travel brief · not an airline confirmation',
      'Trainer: '+(activeTrainer?.name||'Unassigned'),
      'Saved on this device: '+(selectedId?'Yes':'No'),
      '',
      ...draft.legs.flatMap((leg,index)=>[
        'LEG '+(index+1)+' · '+leg.origin+' → '+leg.destination,
        'Flight: '+(leg.carrier&&leg.flightNumber?leg.carrier+leg.flightNumber:'Not provided'),
        'Departure: '+readableTime(leg.departDate,leg.departTime),
        'Arrival: '+(leg.arriveDate?readableTime(leg.arriveDate,leg.arriveTime):'Date/time not verified'),
        ''
      ]),
      'SHARED CALENDAR EXPOSURE',
      ...impacts.map(item=>item.level.toUpperCase()+' · '+item.title+' · '+item.explanation),
      '',
      'Source: user-entered or locally parsed itinerary and saved Field Sales Atlas records.',
      'No live flight status, airline booking verification, predictions or paid flight booking.',
      'A flight confirmation number is never part of this export.'
    ];
    downloadFile('atlas-booked-flight-brief.txt',items.join('\n'),'text/plain;charset=utf-8');
  }
  const attention=impacts.filter(x=>x.level==='attention');
  const review=impacts.filter(x=>x.level==='review');
  return <main className={'fg-page'+(valid?' fg-valid':'')+(savesForTrainer.length?' fg-has-saved':'')+(selectedId?' fg-selected':'')+(replacementId?' fg-updating':'')}>
    <header className="fg-mobile-heading">
      <h1>{selectedId?'Your itinerary':'Booked flights'}</h1>
      <p>{selectedId?'Review your flight details and coaching impact.':
        'Import an itinerary, then protect your schedule.'}</p>
    </header>
    {savesForTrainer.length>0&&<nav className="fg-mobile-saved" aria-label="Saved flights on this device">
      {savesForTrainer.slice(0,6).map(record=>{
        const first=record.legs[0];
        const last=record.legs[record.legs.length-1];
        return <button type="button" key={record.id}
          className={selectedId===record.id?'is-selected':''}
          onClick={()=>selectSaved(record)}>
          <span>{dateLabel(first.departDate,{month:'short',day:'numeric'})}</span>
          <strong>{first.origin} <ArrowRight size={13}/> {last.destination}</strong>
          <small>{record.sharedTripId?'In team calendar':record.verified?'Reviewed':'Needs review'}</small>
        </button>;
      })}
    </nav>}
    <section className="fg-hero">
      <span className="fg-kicker"><ShieldCheck size={16}/> FIELD SALES ATLAS / FLIGHT GUARDIAN</span>
      <h1>Your flight is booked.<br/><em>Now protect the trip.</em></h1>
      <p>Import the itinerary you already have, review the details and see how your travel affects coaching. No airline reservation lookup or paid API required.</p>
      <div className="fg-hero-tags"><span><LockKeyhole size={15}/> Local-first</span>
        <span><Radar size={15}/> Real aviation research</span>
        <span><Users size={15}/> Two-trainer aware</span></div>
    </section>
    <div className="fg-layout">
      <section className="fg-panel fg-import" aria-label="Import booked flight">
        <div className="fg-step">
          <span className="fg-number">01</span>
          <div><span className="fg-overline">YOUR BOOKED ITINERARY</span>
            <h2>Bring the flight into Atlas.</h2>
            <p>Use the confirmation email, PDF, or manual entry. A six-character confirmation code alone cannot access the airline's reservation system.</p></div>
        </div>
        <div className="fg-modes" role="group" aria-label="Itinerary import method">
          <button type="button" className={source==='paste'?'active':''} onClick={()=>setSource('paste')}>
            <ClipboardPaste size={17}/> Paste email
          </button>
          <button type="button" className={source==='file'?'active':''} onClick={()=>setSource('file')}>
            <UploadCloud size={17}/> Select file
          </button>
          <button type="button" className={source==='manual'?'active':''} onClick={()=>{setSource('manual');setShowDetails(true);}}>
            <Plane size={17}/> Manual
          </button>
        </div>
        {source==='paste'&&<div className="fg-import-zone">
          <label htmlFor="fg-email">Paste your itinerary text (example shown below)</label>
          <textarea id="fg-email" rows={5} value={paste} onChange={e=>setPaste(e.target.value.slice(0,60000))}
            placeholder={'Flight UA 1234\nNov 12, 2026\nFrom: Orlando (MCO) 7:20 AM\nTo: Chicago (ORD) 9:15 AM\n\nPaste the actual itinerary. Example text is not imported.'}/>
          <button type="button" className="fg-primary" onClick={parsePaste} disabled={paste.trim().length<12}>
            <Sparkles size={17}/> Extract flight details <ArrowRight size={17}/>
          </button>
        </div>}
        {source==='file'&&<div className="fg-import-zone">
          <label className="fg-file-select">
            <FilePlus2 size={23}/>
            <span><strong>Choose an itinerary PDF, EML or TXT</strong><small>Read in this browser, not uploaded to a server · max 8 MB · 12 PDF pages</small></span>
            <input type="file" accept=".pdf,.eml,.txt,application/pdf,text/plain,message/rfc822"
              onChange={e=>void readFile(e.target.files?.[0])}
              disabled={parsing}/>
          </label>
          {parsing&&<p className="fg-muted"><RefreshCw size={14}/> Reading locally…</p>}
          {fileLabel&&<p className="fg-muted"><FileText size={14}/> Extracted from {fileLabel}</p>}
          <p className="fg-muted">Scanned image PDFs may not contain text. Manual entry remains available.</p>
        </div>}
        {source==='manual'&&<div className="fg-import-zone fg-muted">
          <Plane size={18}/> Enter your operating airline, flight numbers, airports, dates and times in the review form below.
        </div>}
        <div className="fg-privacy">
          <LockKeyhole size={20}/>
          <details className="fg-privacy-details">
            <summary>Reservation codes stay out of Atlas. <ChevronDown size={14}/></summary>
            <p>Raw emails, confirmation codes, passenger names, ticket numbers and payment information are not saved. You decide when to save sanitized flight fields on this device. Local browser storage is not encrypted.</p>
          </details>
        </div>
        {(showDetails||!!selectedId||draft.legs.some(leg=>
          Boolean(leg.origin||leg.destination||leg.departDate||leg.flightNumber)))&&<>
        <div id="fg-review-start" className="fg-step fg-step-two">
          <span className="fg-number">02</span>
          <div><span className="fg-overline">HUMAN REVIEW</span><h2>Confirm what's real.</h2>
            <p>The parser never claims it accessed your airline reservation. Check each detail against your official itinerary.</p></div>
        </div>
        {changeList.length>0&&<div className="fg-change-review" role="status"><strong>Changes from the saved itinerary</strong><ul>{changeList.map((item,index)=><li key={index}>{item}</li>)}</ul><p>Review changed details before saving. Shared trips and airline reservations are unchanged.</p></div>}
        <div className="fg-review-top">
          <label>Assigned trainer
            <select value={draft.trainerId} onChange={e=>{
              clearMessages();
              setDraft(curr=>({...curr,trainerId:e.target.value as BookedFlight['trainerId'],verified:false,review:undefined}));
            }}>
              {ctx.trainerProfiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" className="fg-tertiary" onClick={()=>setShowDetails(s=>!s)}
            aria-expanded={showDetails}>{showDetails?'Collapse details':'Review flight details'} <ChevronDown size={15}/></button>
        </div>
        {showDetails&&<div className="fg-legs">
          {draft.legs.map((leg,index)=><article className="fg-leg" key={leg.id}>
            <div className="fg-leg-head"><span>LEG {String(index+1).padStart(2,'0')}</span>
              <strong>{leg.origin||'FROM'} <ArrowRight size={15}/> {leg.destination||'TO'}</strong>
              <button type="button" aria-label={'Remove leg '+(index+1)}
                onClick={()=>deleteLeg(leg.id)}><X size={18}/></button>
            </div>
            <div className="fg-fields fg-flight-code">
              <label>Operating airline code
                <input value={leg.carrier} maxLength={2} placeholder="UA"
                  onChange={e=>editLeg(leg.id,{carrier:normalizeCarrier(e.target.value)})}/>
              </label>
              <label>Flight number
                <input value={leg.flightNumber} inputMode="numeric" maxLength={4} placeholder="1234"
                  onChange={e=>editLeg(leg.id,{flightNumber:normalizeFlightNumber(e.target.value)})}/>
              </label>
            </div>
            <div className="fg-fields fg-airports">
              <label>From airport
                <input value={leg.origin} maxLength={3} placeholder="MCO"
                  aria-label={'Leg '+(index+1)+' departure airport'}
                  list="fg-airports" onChange={e=>editLeg(leg.id,{origin:normalizeAirport(e.target.value)})}/>
              </label>
              <label>To airport
                <input value={leg.destination} maxLength={3} placeholder="ORD"
                  aria-label={'Leg '+(index+1)+' arrival airport'}
                  list="fg-airports" onChange={e=>editLeg(leg.id,{destination:normalizeAirport(e.target.value)})}/>
              </label>
            </div>
            <div className="fg-fields fg-dates">
              <label>Departure date
                <input type="date" value={leg.departDate}
                  onChange={e=>editLeg(leg.id,{departDate:e.target.value})}/>
              </label>
              <label>Departure local time
                <input type="time" value={leg.departTime}
                  onChange={e=>editLeg(leg.id,{departTime:e.target.value})}/>
              </label>
              <label>Arrival date
                <input type="date" value={leg.arriveDate}
                  onChange={e=>editLeg(leg.id,{arriveDate:e.target.value})}/>
              </label>
              <label>Arrival local time
                <input type="time" value={leg.arriveTime}
                  onChange={e=>editLeg(leg.id,{arriveTime:e.target.value})}/>
              </label>
            </div>
            <details className="fg-connection-settings"><summary>Time zones and connection requirements</summary>
              <div className="fg-fields"><label>Departure IANA time zone<input value={leg.departureZone||''} placeholder="America/New_York" onChange={e=>editLeg(leg.id,{departureZone:e.target.value})}/></label>
              <label>Arrival IANA time zone<input value={leg.arrivalZone||''} placeholder="America/Chicago" onChange={e=>editLeg(leg.id,{arrivalZone:e.target.value})}/></label></div>
              {index>0&&<><p className="fg-muted">For the interval before this leg: include terminal transfer, applicable baggage collection/recheck, border and security procedures. Check the boarding cutoff with the operating airline. Blank means unknown.</p><div className="fg-fields">
                <label>Gate-to-gate processing allowance (min)<input type="number" min={0} max={720} value={leg.connection?.transferMinutes??''} onChange={e=>editLeg(leg.id,{connection:{...leg.connection,transferMinutes:e.target.value===''?undefined:Number(e.target.value)}})}/></label>
                <label>Boarding cutoff before departure (min)<input type="number" min={0} max={180} value={leg.connection?.boardingCutoffMinutes??''} onChange={e=>editLeg(leg.id,{connection:{...leg.connection,boardingCutoffMinutes:e.target.value===''?undefined:Number(e.target.value)}})}/></label>
                <label>Ticket relationship<select value={leg.connection?.ticketRelation||'unknown'} onChange={e=>editLeg(leg.id,{connection:{...leg.connection,ticketRelation:e.target.value as 'unknown'|'same-ticket-reported'|'separate-tickets'}})}><option value="unknown">Not reviewed</option><option value="same-ticket-reported">Same ticket, traveler-reported</option><option value="separate-tickets">Separate tickets</option></select></label>
              </div></>}
            </details>
            <button type="button" className="fg-leg-research"
              disabled={!leg.departDate||!leg.origin||!leg.destination||leg.origin===leg.destination}
              onClick={()=>research(leg)}>
              <Radar size={16}/> Research this flight in Flight DNA <ArrowRight size={16}/>
            </button>
          </article>)}
          <datalist id="fg-airports">
            {ctx.airports.slice(0,1100).map(a=><option key={a.iata+a.name} value={a.iata}>{a.name}</option>)}
          </datalist>
          <button type="button" className="fg-add-leg" onClick={addLeg} disabled={draft.legs.length>=8}>
            <Plus size={17}/> Add a flight leg
          </button>
        </div>}
        {parseNotes.length>0&&<div className="fg-parse-notes" role="status">
          <Info size={18}/><div><strong>Import review notes</strong>
            {parseNotes.map((note,i)=><p key={i}>{note}</p>)}
          </div>
        </div>}
        <label className="fg-verify">
          <input type="checkbox" checked={draft.verified} disabled={!valid}
            onChange={e=>setDraft(current=>({...current,verified:e.target.checked,review:{...current.review,fieldsReviewedAt:e.target.checked?localNow():undefined}}))}/>
          <span>I have checked these flight details against my airline itinerary.</span>
        </label>
        <div className="fg-review-checks">
          <label><input type="checkbox" checked={!!draft.review?.ticketingConfirmedAt} disabled={!valid} onChange={e=>setDraft(current=>({...current,review:{...current.review,ticketingConfirmedAt:e.target.checked?localNow():undefined}}))}/><span>I checked that tickets were issued.<small>Traveler-reported; Atlas does not access airline ticket records.</small></span></label>
          <label><input type="checkbox" checked={!!draft.review?.airlineCheckedAt} disabled={!valid} onChange={e=>setDraft(current=>({...current,review:{...current.review,airlineCheckedAt:e.target.checked?localNow():undefined}}))}/><span>I checked these flight details with the airline now.<small>{draft.review?.airlineCheckedAt?'Reported check: '+new Date(draft.review.airlineCheckedAt).toLocaleString():'Saving alone does not mark airline details as checked.'}</small></span></label>
        </div>
        <div className="fg-actions">
          <button type="button" className="fg-primary" onClick={save} disabled={!valid}>
            <ShieldCheck size={17}/> Save locally
          </button>
          <button type="button" className="fg-tertiary" onClick={newFlight}>
            <Plus size={17}/> New import
          </button>
          {selectedId&&<button type="button" className="fg-tertiary" onClick={()=>{setReplacementId(selectedId);setSource('paste');setNotice('Paste the revised confirmation above. Extraction will compare it with this saved itinerary.');window.scrollTo({top:0,behavior:'auto'});}}>Update from a new confirmation</button>}
          {selectedId&&<button type="button" className="fg-remove" onClick={removeFlight}>
            <Trash2 size={16}/> Delete
          </button>}
        </div>
        <p className="fg-privacy-caption">Saved flights stay only in this device's local browser storage, which is not encrypted. Never use this as a substitute for the airline's itinerary.</p>
        </>}
        {error&&<p className="fg-error" role="alert"><CircleAlert size={17}/>{error}</p>}
        {notice&&<p className="fg-success" role="status"><Check size={16}/>{notice}</p>}
      </section>
      <aside className="fg-side">
        {valid&&<><JourneyReadiness report={readiness}/><button type="button" className="fg-tertiary" disabled={checkingZones||!draft.legs.every(leg=>leg.departTime&&leg.arriveTime&&leg.arriveDate)} onClick={()=>void resolveZones()}>{checkingZones?'Resolving time zones…':'Resolve airport time zones'}</button><p className="fg-muted">This sends only sanitized flight fields to the workspace API. To calculate visit and return-flight margins, attach the saved booking to a journey in Travel assistant.</p></>}
        <section className="fg-panel fg-saved" aria-label="Saved booked flights">
          <div className="fg-side-title"><div><span className="fg-overline">ON THIS DEVICE</span>
            <h2>My booked flights</h2></div><span className="fg-count">{savesForTrainer.length}</span></div>
          {savesForTrainer.length?savesForTrainer.map(record=>{
            const start=record.legs[0],end=record.legs[record.legs.length-1];
            return <button type="button" key={record.id}
                className={'fg-saved-item'+(selectedId===record.id?' active':'')}
                onClick={()=>selectSaved(record)}>
              <div><strong>{start.origin} <ArrowRight size={14}/> {end.destination}</strong>
                <span>{dateLabel(start.departDate)} · {record.legs.length} leg{record.legs.length!==1?'s':''}</span>
              </div><span>{record.sharedTripId?'On team calendar':record.verified?'Reviewed':'Needs review'}</span>
            </button>;
          }):<div className="fg-empty">
            <PlaneTakeoff size={30}/><strong>Nothing saved yet</strong>
            <p>Import a confirmation email or enter your booked flight. Draft flight fields can be saved; review is required before sharing.</p>
          </div>}
        </section>
        <section className="fg-panel fg-impact">
          <div className="fg-side-title"><div><span className="fg-overline">TWO-TRAINER AWARE</span>
            <h2>Coaching impact</h2></div><CalendarClock size={24}/></div>
          <p className="fg-muted">{valid? 'What your booked flight means for the records already on your shared calendar.':'Enter valid flight dates and airports to compare the coaching schedule.'}</p>
          {valid&&<div className="fg-insight-counts">
            <div><strong>{attention.length}</strong><span>Needs action</span></div>
            <div><strong>{review.length}</strong><span>Review</span></div>
            <div><strong>{impacts.length-attention.length-review.length}</strong><span>Context</span></div>
          </div>}
          <div className="fg-impact-list">
            {impacts.map((item,index)=><article className={'fg-impact-item fg-level-'+item.level} key={index}>
              <div><span>{item.level==='attention'?'ATTENTION':item.level==='review'?'REVIEW':'CONTEXT'}</span>
                <strong>{item.title}</strong></div>
              <p>{item.explanation}</p><small>{item.source}</small>
            </article>)}
          </div>
          <div className="fg-impact-actions">
            <button type="button" disabled={!valid} onClick={exportBrief}><FileText size={16}/> Export travel brief</button>
            <button type="button" onClick={onCoordinate}><Users size={16}/> Coordinate trainers <ArrowRight size={15}/></button>
          </div>
        </section>
        <section className="fg-panel fg-publish">
          <span className="fg-overline">OPTIONAL TEAM VISIBILITY</span>
          <h2>Share travel days, not your booking.</h2>
          <p>Only your trainer name, airport codes and travel dates are added to the shared calendar. No confirmation code, email, passenger or payment data is sent.</p>
          <label className="fg-review-top">Field airport for these travel days<select value={sharingAirport} onChange={event=>setSharingAirport(event.target.value)}><option value="">Choose the field airport</option>{[...new Set(draft.legs.flatMap(leg=>[leg.origin,leg.destination]))].filter(code=>/^[A-Z]{3}$/.test(code)).map(code=><option key={code} value={code}>{code}</option>)}</select></label>
          <button type="button" className="fg-publish-button"
            disabled={!calendarAirportKnown||!selfReview||!calendarDatesComplete||!selectedId||ctx.identity!=='member'||sharing||!!draft.sharedTripId}
            onClick={()=>void publishTrip()}>
            <CalendarClock size={17}/>
            {draft.sharedTripId?'Trip already shared':sharing?'Sharing travel dates…':'Add travel days to shared calendar'}
          </button>
          {valid&&!calendarDatesComplete&&<p className="fg-muted" role="status">
            <CircleAlert size={14}/> Confirm the arrival date of every flight leg before sharing travel dates. Overnight arrivals cannot be inferred from departure dates.
          </p>}
          {draft.sharedTripId&&<p className="fg-muted">Shared calendar trip recorded. Changes to flight details do not automatically update or cancel that shared trip.</p>}
          <p className="fg-muted">Save the reviewed itinerary locally first, then confirm sharing. The calendar may reject overlapping trips. After publishing, changes to your flight details do not automatically edit the shared trip.</p>
        </section>
      </aside>
    </div>
  </main>;
}
