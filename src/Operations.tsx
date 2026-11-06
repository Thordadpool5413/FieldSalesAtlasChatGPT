
import {
Activity,
ArrowRight,
CalendarDays,
CheckCircle2,
ChevronDown,ChevronLeft,
CircleAlert,
ClipboardCheck,
Compass,Database,Globe2,LayoutDashboard,
Moon,
MoreHorizontal,
PanelLeftClose,PanelLeftOpen,
Plane,Plus,
RefreshCw,
Route,
Settings,
Share2,
ShieldCheck,
Smartphone,
Sparkles,
Sun,
Users,X
} from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
import { createContext,lazy,Suspense,useContext,useEffect,useMemo,useRef,useState } from 'react';
import AirportAlertRail from './AirportAlertRail';
import './AtlasFoundation.css';
import { CANADA_STARTER_AIRPORTS } from './CanadaRegions';
import FieldCompass from './FieldCompass';
import { uniqueManagerIds } from './fieldExperience';
import GlobalFinder from './GlobalFinder';
import IosPullRefresh from './IosPullRefresh';
import OfficialFieldAtlasLogo from './OfficialFieldAtlasLogo';
import { CalendarPage } from './OperationsCalendar';
import OperationsModal from './OperationsForms';
import { TripsPage } from './OperationsTrip';
import {
CoachingPage,DataPage,
ManagersPage,
MapPage,
OverviewPage,
} from './OperationsViews';
import { Airport,Area,Board,defaultTrainerProfiles,Manager,STARTER_AIRPORTS,today,TrainerProfile } from './opsModels';
import PlanHub,{ PeopleHub } from './PlanHub';
import PwaCompanion from './PwaCompanion';
import type { WsConnection } from './runtime/client';
import { ws } from './runtime/client';
import './SharedWorkspace.css';
import SharedWorkspacePage from './SharedWorkspacePage';
import TrainerProfilesEditor from './TrainerProfilesEditor';
import WorkspaceSetup from './WorkspaceSetup';
import localUsAtlas from './us-states-10m.json';
import { api,createNewWorkspace,getShareUrl,initializeWorkspace } from './workspaceApi';
const AirTravelPage = lazy(() => import('./AirTravel'));
const MiamiMapHome = lazy(() => import('./MiamiMapHome'));
const TodayHub = lazy(() => import('./TodayHub'));
const TwoTrainerWeek = lazy(() => import('./TwoTrainerWeek'));


export type Page = 'today' | 'mission' | 'plan' | 'people' | 'week' | 'radar' | 'booked' | 'coordinate' | 'home' | 'air' | 'overview' | 'map' | 'managers' | 'trips' | 'coaching' | 'calendar' | 'data' | 'team';
export type Dialog = 'manager' | 'assignment' | 'visit' | 'coaching' | 'trip' | 'invite' | null;
export type ModalState = { kind: Dialog; record?: unknown; detail?: string } | null;
export type User = { userId: string; name?: string; email?: string };
export type Geography = { state: string; counties: Area[]; places: Area[]; incomplete?: boolean; source?: string; message?: string; supported?: boolean };
type Context = {
  board: Board; user: User | null; identity: 'loading' | 'guest' | 'setup' | 'member' | 'error';
  state: string; setState: Dispatch<SetStateAction<string>>;
  zctaFocus:string;setZctaFocus:Dispatch<SetStateAction<string>>;
  mapMode: 'national' | 'state'; setMapMode: Dispatch<SetStateAction<'national' | 'state'>>;
  view: Page; go: (page: Page) => void;
  trainerProfiles:TrainerProfile[];
  activeTrainerId:'trainer_a'|'trainer_b';setActiveTrainerId:(value:'trainer_a'|'trainer_b')=>void;
  activeTrainer:TrainerProfile;
  syncRevision:number;
  openTrainers:()=>void;
  travelRequest: {state:string;country:'US'|'CA';managerId?:string;managerIds?:string[];departDate?:string;returnDate?:string;reference?:{lat:number;lon:number;label:string};arrivalAirport?:string;nonce:number}|null;
  clearTravelRequest:()=>void;
  atlasJump:{code:string;country:'US'|'CA';airport?:string;nonce:number}|null;
  jumpToAtlas:(region:{code:string;country:'US'|'CA'},airport?:string)=>void;
  startTravel:(region:{code:string;name:string;country:'US'|'CA'},manager?:Manager,reference?:{lat:number;lon:number;label:string},arrivalAirport?:string)=>void;
  clearAtlasJump:()=>void;
  selectedManager: string; setSelectedManager: Dispatch<SetStateAction<string>>;
  selectedCounty: string; setSelectedCounty: Dispatch<SetStateAction<string>>;
  modal: ModalState; open: (kind: Exclude<Dialog,null>,record?:unknown,detail?:string)=>void; close:()=>void;
  atlas: unknown; airports: Airport[]; airportSource: 'live' | 'cached' | 'starter' | 'loading';
  geo: Geography; geoBusy: boolean; geoError: string;
  busy: boolean; error: string; notice: string; setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  reload:()=>Promise<void>; submit:<T>(work:()=>Promise<T>,message:string)=>Promise<T>;
};
const Store=createContext<Context|null>(null);
export function useOp():Context {
  const context=useContext(Store);
  if(!context)throw Error('Field Sales Atlas store unavailable');
  return context;
}
// The Atlas is the application's home. Travel remains a separate working tool.
const MIAMI_NAV: Array<{id:Page;label:string;icon:typeof Plane}>=[
  {id:'home',label:'Atlas',icon:Globe2},
  {id:'plan',label:'Travel',icon:Plane},
  {id:'people',label:'People',icon:Users},
  {id:'calendar',label:'Calendar',icon:CalendarDays},
];
const QUICK_NAV=MIAMI_NAV;
// Surface existing working tools without changing the four-tab phone navigation.
const FIELD_SHORTCUTS: Array<{id:Page;label:string;icon:typeof Plane}>=[
  {id:'mission',label:'Mission Control',icon:Sparkles},
  {id:'radar',label:'Flight DNA',icon:Activity},
  {id:'booked',label:'Booked flights',icon:Plane},
  {id:'coordinate',label:'Coordinate trainers',icon:Route},
  {id:'coaching',label:'Coaching desk',icon:ClipboardCheck},
];
const MIAMI_MORE: Array<{id:Page;label:string;icon:typeof Plane}>=[
  {id:'overview',label:'Reports',icon:Activity},
  {id:'air',label:'Travel planner',icon:Plane},
  {id:'map',label:'Territory details',icon:Compass},
  {id:'data',label:'Data & exports',icon:Database},
  {id:'team',label:'Sharing & recovery',icon:ShieldCheck},
];
const PRIMARY_PAGES:Page[]=['plan','home','people','calendar'];
function initialRoute():Page{
  if(typeof window==='undefined')return 'home';
  const candidate=new URLSearchParams(window.location.search).get('page');
  if(!candidate){
    // A tool-only shared link still opens the intended Travel workspace.
    return new URLSearchParams(window.location.search).has('tool')?'plan':'home';
  }
  if(candidate==='today')return 'home';
  // Existing travel deep links must retain their routes and selected tools.
  if(['radar','booked','air','week','trips','coordinate'].includes(candidate))return 'plan';
  if(candidate==='managers'||candidate==='coaching')return 'people';
  return (['plan','home','people','calendar','mission','overview','map','data','team'] as string[]).includes(candidate)
    ?candidate as Page:'home';
}
function initialPlanTool(): 'start'|'week'|'coordinate'|'travel'|'radar'|'booked'|'trips'{
  if(typeof window==='undefined')return 'start';
  const search=new URLSearchParams(window.location.search);
  const tool=search.get('tool');
  if(tool==='start'||tool==='week'||tool==='travel'||tool==='trips'||tool==='coordinate'||tool==='radar'||tool==='booked')return tool;
  const oldPage=search.get('page');
  return oldPage==='radar'?'radar':
    oldPage==='booked'?'booked':
    oldPage==='air'?'travel':
    oldPage==='week'?'week':
    oldPage==='trips'?'trips':
    oldPage==='coordinate'?'coordinate':'start';
}
function initialPeopleTool(): 'managers'|'coaching'{
  if(typeof window==='undefined')return 'managers';
  const query=new URLSearchParams(window.location.search);
  return query.get('tool')==='coaching'||query.get('page')==='coaching'?'coaching':'managers';
}
function errorText(e:unknown):string {
  if(e instanceof Error)return e.message;
  if(e && typeof e==='object' && 'message' in e) return String((e as {message:unknown}).message);
  return 'This operation could not be completed.';
}
function Product(){
  const [identity,setIdentity]=useState<Context['identity']>('loading');
  const [user,setUser]=useState<User|null>(null);
  const [board,setBoard]=useState<Board>({});
  const [state,setState]=useState('FL');
  const [zctaFocus,setZctaFocus]=useState('');
  const [mapMode,setMapMode]=useState<'national'|'state'>('national');
  // Atlas is the default landing screen; Travel is a separate planning destination.
  const [view,setView]=useState<Page>(initialRoute);
  const [planSection,setPlanSection]=useState<'start'|'week'|'coordinate'|'travel'|'radar'|'booked'|'trips'>(initialPlanTool);
  const [peopleSection,setPeopleSection]=useState<'managers'|'coaching'>(initialPeopleTool);
  const [trainerProfilesOpen,setTrainerProfilesOpen]=useState(false);
  const [activeTrainerId,setActiveTrainerIdState]=useState<'trainer_a'|'trainer_b'>(()=>{
    try{return localStorage.getItem('field-atlas-active-trainer')==='trainer_b'?'trainer_b':'trainer_a';}catch{return 'trainer_a';}
  });
  const [travelRequest,setTravelRequest]=useState<{state:string;country:'US'|'CA';managerId?:string;managerIds?:string[];departDate?:string;returnDate?:string;reference?:{lat:number;lon:number;label:string};arrivalAirport?:string;nonce:number}|null>(null);
  const [atlasJump,setAtlasJump]=useState<{code:string;country:'US'|'CA';airport?:string;nonce:number}|null>(null);
  const [selectedManager,setSelectedManager]=useState('');
  const [selectedCounty,setSelectedCounty]=useState('');
  const [modal,setModal]=useState<ModalState>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [syncStatus,setSyncStatus]=useState<'connecting'|'live'|'offline'|'updated'>('connecting');
  const [syncRevision,setSyncRevision]=useState(0);
  const lastSyncRef=useRef('');
  const reloadRef=useRef<()=>Promise<void>>(async()=>undefined);
  const [atlas,setAtlas]=useState<unknown>(localUsAtlas);
  const [airports,setAirports]=useState<Airport[]>([...STARTER_AIRPORTS,...CANADA_STARTER_AIRPORTS]);
  const [airportSource,setAirportSource]=useState<Context['airportSource']>('loading');
  const [geo,setGeo]=useState<Geography>({state:'',counties:[],places:[]});
  const [geoBusy,setGeoBusy]=useState(false);
  const [geoError,setGeoError]=useState('');
  const scrollPositions=useRef<Map<Page,number>>(new Map());
  const lastPrimaryTab=useRef<Page>('home');
  const restoreScrollFor=useRef<Page|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [quickAddOpen,setQuickAddOpen]=useState(false);
  const [pwaOpen,setPwaOpen]=useState(false);
  const [setupOpen,setSetupOpen]=useState(false);
  const [moreOpen,setMoreOpen]=useState(false);
  const moreSheetTouchY=useRef<number|null>(null);
  const quickSheetTouchY=useRef<number|null>(null);
  const [focusedWorkspace,setFocusedWorkspace]=useState(()=>{
    try{return window.localStorage.getItem('field-atlas-focus')==='true';}catch{return false;}
  });
  // Readable defaults for new sessions; keep the user's saved compact choice.
  const [density,setDensity]=useState<'compact'|'comfortable'>(()=>{
    try{return window.localStorage.getItem('field-atlas-density-v5')==='compact'?'compact':'comfortable';}
    catch{return 'comfortable';}
  });
  function toggleFocus(){
    setFocusedWorkspace(current=>{
      const next=!current;
      try{window.localStorage.setItem('field-atlas-focus',String(next));}catch{}
      return next;
    });
  }
  function toggleDensity(){
    setDensity(current=>{
      const next=current==='compact'?'comfortable':'compact';
      try{window.localStorage.setItem('field-atlas-density-v5',next);}catch{}
      return next;
    });
  }
  const [theme,setTheme]=useState<'dark'|'light'>(()=>{
    try{return window.localStorage.getItem('field-atlas-theme')==='light'?'light':'dark';}
    catch{return 'dark';}
  });
  useEffect(()=>{
    const themeMeta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeMeta?.setAttribute('content',theme==='dark'?'#071525':'#F3F8FB');
    document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute('content',theme==='dark'?'black-translucent':'default');
    document.documentElement.setAttribute('data-field-atlas-theme',theme);
    document.documentElement.style.colorScheme=theme;
    try{window.localStorage.setItem('field-atlas-theme',theme);}catch{}
  },[theme]);
  function toggleTheme(){setTheme(current=>current==='dark'?'light':'dark');}

  async function reload(){
    const response=await api.get('/api/operations');
    const b=response.data as Board;
    setBoard(b);
    if(b.needsTeam)throw Error('This shared workspace cannot be found.');
    setIdentity('member');
  }
  reloadRef.current=reload;
  // Push updates handle normal collaboration; reconnection and app foregrounding
  // always reconcile missed changes. This is intentionally not an offline write queue.
  useEffect(()=>{
    if(identity!=='member'||!board.team?.id)return;
    const workspaceId=board.team.id;
    let active=true;
    let retryTimer:ReturnType<typeof setTimeout>|null=null;
    let renewal:ReturnType<typeof setInterval>|null=null;
    let conn:WsConnection|null=null;
    let registered='';
    let hasSubscribed=false;
    let foregroundReload:Promise<void>|null=null;
    const reconcile=()=>{
      if(!active||document.visibilityState!=='visible')return;
      if(foregroundReload)return;
      foregroundReload=reloadRef.current().then(()=>{
        if(active){setSyncRevision(n=>n+1);setSyncStatus('updated');}
      }).catch(()=>{
        if(active)setSyncStatus('offline');
      }).finally(()=>{foregroundReload=null;});
    };
    const connect=()=>{
      if(!active)return;
      setSyncStatus('connecting');
      try{
        conn=ws.connect();
        const current=conn;
        current.onMessage(message=>{
          let data=typeof message==='string'?message:(message?.data??message);
          if(typeof data==='string'){try{data=JSON.parse(data);}catch{return;}}
          if(data?.type!=='entity.update'||data?.entity_type!=='workspace'||data?.entity_id!==workspaceId)return;
          if(data.at===lastSyncRef.current)return;
          lastSyncRef.current=data.at;
          reconcile();
        });
        current.onClose(()=>{
          if(!active)return;
          setSyncStatus('offline');
          if(retryTimer)clearTimeout(retryTimer);
          retryTimer=setTimeout(connect,5000);
        });
        current.onError(()=>{if(active)setSyncStatus('offline');});
        const subscribe=async()=>{
          if(!active||!current.connectionId)return;
          try{
            await api.post('/api/subscriptions',{entity_type:'workspace',entity_id:workspaceId,connection_id:current.connectionId});
            if(!active)return;
            registered=current.connectionId;
            setSyncStatus('live');
            if(hasSubscribed)reconcile();
            hasSubscribed=true;
          }catch{if(active)setSyncStatus('offline');}
        };
        void current.ready.then(subscribe).catch(()=>{if(active)setSyncStatus('offline');});
        if(renewal)clearInterval(renewal);
        renewal=setInterval(()=>{if(active&&document.visibilityState==='visible')void subscribe();},30*60*1000);
      }catch{
        setSyncStatus('offline');
        retryTimer=setTimeout(connect,5000);
      }
    };
    const foreground=()=>{if(active&&document.visibilityState==='visible')reconcile();};
    const online=()=>{if(active)reconcile();};
    document.addEventListener('visibilitychange',foreground);
    window.addEventListener('online',online);
    connect();
    return ()=>{
      active=false;
      document.removeEventListener('visibilitychange',foreground);
      window.removeEventListener('online',online);
      if(retryTimer)clearTimeout(retryTimer);
      if(renewal)clearInterval(renewal);
      if(registered)void api.post('/api/subscriptions/remove',{entity_type:'workspace',entity_id:workspaceId,connection_id:registered}).catch(()=>undefined);
      conn?.disconnect();
    };
  },[identity,board.team?.id]);
  useEffect(()=>{
    let alive=true;
    async function initialize(){
      try{
        await initializeWorkspace();
        const response=await api.get('/api/operations');
        if(!alive)return;
        const data=response.data as Board;
        if(data.needsTeam)throw Error('Shared workspace could not be initialized.');
        setBoard(data);
        if(data.accessSeat){
          setActiveTrainerIdState(data.accessSeat);
          try{localStorage.setItem('field-atlas-active-trainer',data.accessSeat);}catch{}
        }
        setUser({userId:'shared',name:'Workspace editor'});
        setIdentity('member');
      }catch(e){if(alive){setIdentity('error');setError('Unable to open shared workspace: '+errorText(e));}}
    }
    initialize();
    return ()=>{alive=false;};
  },[]);

  // Geographic topology does not depend on the private workspace handshake.
  // Keep its request alive when identity changes from loading to member.
  useEffect(()=>{
    let alive=true;
    async function loadAtlas(){
      try {
        const response=await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
        if(!response.ok) throw Error('Detailed map unavailable');
        const data=await response.json();
        if(alive)setAtlas(data);
      } catch {
        try {
          const response=await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
          if(!response.ok)throw Error('Map unavailable');
          const data=await response.json();
          if(alive)setAtlas(data);
        }catch {if(alive)setAtlas(localUsAtlas);}
      }
    }
    void loadAtlas();
    return ()=>{alive=false;};
  },[]);

  // The curated airport directory is workspace-scoped; fetch after initialize.
  useEffect(()=>{
    if(identity!=='member')return;
    let alive=true;
    async function loadAirports(){
      if(identity!=='member')return;
      try{
        // Fetch only curated US/CA airports from our backend cache.
        // Do not download and parse the large worldwide CSV on an iPhone.
        const response=await api.get('/api/airports/curated');
        const records=response.data?.airports as Airport[] | undefined;
        if(!Array.isArray(records)||records.length<150)throw Error('Airport directory incomplete');
        if(alive){setAirports(records);setAirportSource(response.data?.stale?'cached':'live');}
      }catch{
        if(alive){setAirports([...STARTER_AIRPORTS,...CANADA_STARTER_AIRPORTS]);setAirportSource('starter');}
      }
    }
    void loadAirports();
    return ()=>{alive=false;};
  },[identity]);

  useEffect(()=>{
    // Wait until the workspace is initialized so startup failures are retried
    // rather than leaving counties empty until a user changes state.
    if(identity!=='member'){
      setGeoBusy(false);
      return;
    }
    let alive=true;
    setGeoBusy(true);
    setGeoError('');
    setSelectedCounty('');
    async function loadGeo(){
      try{
        const response=await api.get('/api/geography/'+state);
        if(!alive)return;
        const data=response.data as Geography;
        setGeo(data);
        if(data.incomplete)setGeoError(data.message||'Part of the Census geography could not be loaded.');
      }catch(e){
        if(alive){
          setGeo({state,counties:[],places:[],incomplete:true});
          setGeoError('County and place directory unavailable. Public geographic service may be temporarily offline.');
        }
      }finally{if(alive)setGeoBusy(false);}
    }
    void loadGeo();
    return ()=>{alive=false;};
  },[state,identity]);

  async function submit<T>(work:()=>Promise<T>,message:string):Promise<T>{
    setBusy(true);setError('');setNotice('');
    try{
      const result=await work();
      await reload();
      setNotice(message);
      return result;
    }catch(e){setError(errorText(e));throw e;}
    finally{setBusy(false);}
  }
  async function copyWorkspaceLink(){
    const link=getShareUrl();
    if(!link){setError('Shared workspace link is still loading.');return;}
    try{
      await navigator.clipboard.writeText(link);
      setNotice('Workspace link copied. Anyone with it can view and edit these records.');
    }catch{
      go('team');
      setNotice('Copy your link on the Share workspace page.');
    }
  }
  async function startFreshWorkspace(){
    if(!window.confirm('Create a new empty workspace? The old link will still open the previous workspace.'))return;
    try{await createNewWorkspace();window.location.reload();}
    catch(e){setError('Could not create a workspace: '+errorText(e));}
  }
  function startTravel(region:{code:string;name:string;country:'US'|'CA'},manager?:Manager,reference?:{lat:number;lon:number;label:string},arrivalAirport?:string){
    setState(region.code);
    setTravelRequest({state:region.code,country:region.country,managerId:manager?.id,reference,arrivalAirport,nonce:Date.now()});
    go('air');
  }
  function startCircuit(region:{code:string;name:string;country:'US'|'CA'},people:Manager[],departDate:string,returnDate:string){
    const managerIds=uniqueManagerIds(people.map(person=>person.id));
    if(!managerIds.length){setError('Select at least one manager for this circuit.');return;}
    setState(region.code);
    setTravelRequest({state:region.code,country:region.country,managerId:managerIds[0],
      managerIds,departDate,returnDate,nonce:Date.now()});
    go('air');
  }
  function jumpToAtlas(region:{code:string;country:'US'|'CA'},airport?:string){
    setAtlasJump({...region,airport,nonce:Date.now()});
    go('home');
  }
  function changePlanSection(next:'start'|'week'|'coordinate'|'travel'|'radar'|'booked'|'trips'){
    if(planSection===next)return;
    setPlanSection(next);
    if(typeof window!=='undefined'){
      const address=new URL(window.location.href);
      address.searchParams.set('page','plan');
      address.searchParams.set('tool',next);
      window.history.pushState({atlasPage:'plan',atlasTool:next},'',address.pathname+address.search+address.hash);
      // On a phone, changing a tool must begin at its start, never half-way
      // down the previously active research view.
      window.scrollTo({top:0,behavior:'instant'});
    }
  }
  function changePeopleSection(next:'managers'|'coaching'){
    if(peopleSection===next)return;
    setPeopleSection(next);
    if(typeof window!=='undefined'){
      const address=new URL(window.location.href);
      address.searchParams.set('page','people');
      address.searchParams.set('tool',next);
      window.history.pushState({atlasPage:'people',atlasTool:next},'',address.pathname+address.search+address.hash);
    }
  }
  function iosGoBack(){
    if(view==='plan'&&planSection!=='start'){changePlanSection('start');return;}
    if(view==='people'&&peopleSection==='coaching'){changePeopleSection('managers');return;}
    go(lastPrimaryTab.current);
  }
  function go(page:Page){
    // A small real route table powers installed PWA shortcuts and the iOS
    // browser's back gesture without exposing the workspace access key.
    let target:Page=page;
    let tool='';
    if(page==='today'||page==='week'||page==='air'||page==='trips'||page==='radar'||page==='booked'||page==='coordinate'){
      tool=page==='today'?'start':page==='radar'?'radar':
        page==='booked'?'booked':page==='coordinate'?'coordinate':page==='week'?'week':page==='air'?'travel':'trips';
      setPlanSection(tool as 'start'|'week'|'coordinate'|'travel'|'radar'|'booked'|'trips');
      target='plan';
    }else if(page==='managers'||page==='coaching'){
      tool=page;
      setPeopleSection(page);
      target='people';
    }else if(page==='plan'){
      const reselect=view==='plan'&&window.matchMedia('(max-width:900px)').matches;
      tool=reselect?'start':planSection;
      if(reselect)setPlanSection('start');
    }else if(page==='people'){
      const reselect=view==='people'&&window.matchMedia('(max-width:900px)').matches;
      tool=reselect?'managers':peopleSection;
      if(reselect)setPeopleSection('managers');
    }
    if(!PRIMARY_PAGES.includes(target)&&PRIMARY_PAGES.includes(view))lastPrimaryTab.current=view;
    else if(PRIMARY_PAGES.includes(target))lastPrimaryTab.current=target;
    if(typeof window!=='undefined'){
      if(PRIMARY_PAGES.includes(view))scrollPositions.current.set(view,window.scrollY);
      restoreScrollFor.current=PRIMARY_PAGES.includes(target)&&
        PRIMARY_PAGES.includes(view)&&target!==view?target:null;
    }
    setView(target);
    setMenuOpen(false);
    setQuickAddOpen(false);
    setMoreOpen(false);
    setModal(null);
    setError('');
    setNotice('');
    if(typeof window!=='undefined'){
      const next=new URL(window.location.href);
      next.searchParams.set('page',target);
      if(tool)next.searchParams.set('tool',tool);
      else next.searchParams.delete('tool');
      const nextLocation=next.pathname+next.search+next.hash;
      if(nextLocation!==window.location.pathname+window.location.search+window.location.hash){
        window.history.pushState({atlasPage:target},'',nextLocation);
      }
      window.scrollTo(0,0);
    }
  }
  useEffect(()=>{
    if(restoreScrollFor.current!==view)return;
    restoreScrollFor.current=null;
    const saved=scrollPositions.current.get(view)||0;
    const id=window.requestAnimationFrame(()=>window.scrollTo(0,saved));
    return ()=>window.cancelAnimationFrame(id);
  },[view]);
  useEffect(()=>{
    const fromHistory=()=>{
      const destination=initialRoute();
      restoreScrollFor.current=PRIMARY_PAGES.includes(destination)?destination:null;
      setView(destination);
      setPlanSection(initialPlanTool());
      setPeopleSection(initialPeopleTool());
      setMenuOpen(false);
      setQuickAddOpen(false);
      setMoreOpen(false);
      setModal(null);
      window.scrollTo(0,0);
    };
    window.addEventListener('popstate',fromHistory);
    return ()=>window.removeEventListener('popstate',fromHistory);
  },[]);
  useEffect(()=>{
    if(!quickAddOpen)return;
    const old=document.activeElement as HTMLElement|null;
    const before=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const actions=document.querySelector<HTMLElement>('.ios-quick-actions');
    actions?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();setQuickAddOpen(false);}
      if(e.key!=='Tab')return;
      const choices=Array.from(actions?.querySelectorAll<HTMLElement>('button:not([disabled])')||[]);
      if(!choices.length)return;
      if(e.shiftKey&&document.activeElement===choices[0]){e.preventDefault();choices[choices.length-1].focus();}
      else if(!e.shiftKey&&document.activeElement===choices[choices.length-1]){e.preventDefault();choices[0].focus();}
    };
    window.addEventListener('keydown',key);
    return ()=>{
      window.removeEventListener('keydown',key);
      document.body.style.overflow=before;
      old?.focus({preventScroll:true});
    };
  },[quickAddOpen]);
  useEffect(()=>{
    if(!menuOpen)return;
    const previousFocus=document.activeElement as HTMLElement|null;
    const before=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const drawer=document.querySelector<HTMLElement>('.mv-mobile-drawer');
    const getControls=()=>Array.from(drawer?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select,input,[tabindex="0"]')||[]);
    getControls()[0]?.focus();
    function onKey(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();setMenuOpen(false);return;}
      if(event.key!=='Tab')return;
      const controls=getControls();
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    window.addEventListener('keydown',onKey);
    return ()=>{
      document.body.style.overflow=before;
      window.removeEventListener('keydown',onKey);
      previousFocus?.focus({preventScroll:true});
    };
  },[menuOpen]);
  function open(kind:Exclude<Dialog,null>,record?:unknown,detail?:string){
    if(identity!=='member'){setError('Workspace is still loading.');return;}
    setError('');setNotice('');setModal({kind,record,detail});
  }
  function close(){if(!busy){setModal(null);setError('');}}
  const trainerProfiles=board.trainerProfiles?.length===2?board.trainerProfiles:defaultTrainerProfiles;
  const activeTrainer=trainerProfiles.find(p=>p.id===activeTrainerId)||trainerProfiles[0];
  function setActiveTrainerId(value:'trainer_a'|'trainer_b'){
    setActiveTrainerIdState(value);
    try{localStorage.setItem('field-atlas-active-trainer',value);}catch{}
  }
  const hasIosBack=(view==='plan'&&planSection!=='start')||
    (view==='people'&&peopleSection==='coaching')||!PRIMARY_PAGES.includes(view);
  const context=useMemo<Context>(()=>({
    board,user,identity,state,setState,zctaFocus,setZctaFocus,mapMode,setMapMode,view,go,
    trainerProfiles,activeTrainerId,setActiveTrainerId,activeTrainer,syncRevision,openTrainers:()=>setTrainerProfilesOpen(true),
    travelRequest,clearTravelRequest:()=>setTravelRequest(null),atlasJump,jumpToAtlas,startTravel,clearAtlasJump:()=>setAtlasJump(null),selectedManager,setSelectedManager,
    selectedCounty,setSelectedCounty,modal,open,close,atlas,airports,airportSource,
    geo,geoBusy,geoError,busy,error,notice,setError,setNotice,reload,submit,
  }),[board,user,identity,state,zctaFocus,mapMode,view,activeTrainerId,syncRevision,travelRequest,atlasJump,selectedManager,selectedCounty,modal,atlas,airports,airportSource,geo,geoBusy,geoError,busy,error,notice]);


  return <Store.Provider value={context}>
    <div className={'mv-app op-root atlas-design-v3 atlas-product-v4 atlas-command-v5'+(focusedWorkspace?' atlas-workspace-focused':'')}
      data-theme={theme} data-view={view} data-density={density}>
      <a className="fsa-skip-link" href="#field-atlas-main" onClick={event=>{
        event.preventDefault();
        const main=document.getElementById('field-atlas-main');
        main?.focus({preventScroll:true});
        main?.scrollIntoView({block:'start',behavior:'auto'});
      }}>Skip to main content</a>

      <div className="fsa-structure">
        <aside className="fsa-sidebar" aria-label="Field Sales Atlas workspace navigation">
          <button className="fsa-sidebar-brand" type="button" onClick={()=>go('home')} aria-label="Open Field Sales Atlas home">
            <OfficialFieldAtlasLogo/>
          </button>
          <div className="fsa-sidebar-label">YOUR WORKSPACE</div>
          <nav className="fsa-side-nav" aria-label="Main sections">
            {MIAMI_NAV.map(item=>{
              const Icon=item.icon;
              return <button type="button" key={item.id}
                className={'fsa-side-link'+(view===item.id?' active':'')}
                aria-current={view===item.id?'page':undefined} title={item.label}
                onClick={()=>go(item.id)}>
                <Icon size={20}/><span>{item.label}</span>
              </button>;
            })}
          </nav>
          <button type="button" className="fsa-sidebar-create" aria-haspopup="dialog"
            aria-expanded={quickAddOpen} onClick={()=>setQuickAddOpen(true)}>
            <Plus size={20}/><span>New field record</span><ArrowRight size={17}/>
          </button>
          <div className="fsa-sidebar-label fsa-sidebar-label-tools">FIELD INTELLIGENCE</div>
          <nav className="fsa-side-nav fsa-side-tools" aria-label="Field intelligence tools">
            <button type="button" className="fsa-side-link fsa-tool-link" onClick={()=>{setSetupOpen(true);setMoreOpen(false);setMenuOpen(false);}}><Compass size={17}/><span>Workspace setup</span></button>
              {FIELD_SHORTCUTS.map(item=>{
              const Icon=item.icon;
              const active=item.id==='mission' ? view==='mission' : item.id==='coaching'
                ? view==='people'&&peopleSection==='coaching'
                : view==='plan'&&planSection===item.id;
              return <button type="button" key={item.id}
                className={'fsa-side-link fsa-tool-link'+(active?' active':'')}
                aria-current={active?'page':undefined}
                title={item.label} onClick={()=>go(item.id)}>
                <Icon size={19}/><span>{item.label}</span>
              </button>;
            })}
          </nav>
          <div className="fsa-sidebar-label fsa-sidebar-label-more">MORE</div>
          <details className="fsa-more-tools" key={MIAMI_MORE.some(item=>item.id===view)?'more-active':'more-inactive'}
            open={MIAMI_MORE.some(item=>item.id===view)?true:undefined}>
            <summary><Settings size={19}/><span>Reports & tools</span><ChevronDown size={15}/></summary>
            <nav aria-label="Additional workspace tools">
              {MIAMI_MORE.map(item=>{
                const Icon=item.icon;
                return <button key={item.id} type="button" onClick={()=>go(item.id)}
                  className={view===item.id?'active':''}><Icon size={16}/><span>{item.label}</span></button>;
              })}
              <button type="button" onClick={()=>setTrainerProfilesOpen(true)}>
                <Settings size={16}/><span>Trainer profiles</span>
              </button>
            </nav>
          </details>
          <div className="fsa-sidebar-bottom">
            <FieldCompass variant="rail"/>
          </div>
        </aside>
        <div className="fsa-stage">
      <header className={'mv-header'+(hasIosBack?' ios-has-back':'')}>
        {hasIosBack&&<button type="button" className="ios-back-button"
          onClick={iosGoBack} aria-label="Back to previous workspace section">
          <ChevronLeft size={22}/><span>Back</span>
        </button>}
        <button className="mv-brand" onClick={()=>go('home')} aria-label="Open the Field Sales Atlas map home">
          <OfficialFieldAtlasLogo/>
        </button>
        <div className="fsa-crumb"><span>FIELD ATLAS</span><i aria-hidden="true"/><strong>{MIAMI_NAV.find(x=>x.id===view)?.label||FIELD_SHORTCUTS.find(x=>x.id===view)?.label||MIAMI_MORE.find(x=>x.id===view)?.label||'Territory Atlas'}</strong></div>
        <div className="ios-nav-title" aria-live="polite">
          <span>FIELD SALES ATLAS</span>
          <strong>{MIAMI_NAV.find(x=>x.id===view)?.label||FIELD_SHORTCUTS.find(x=>x.id===view)?.label||MIAMI_MORE.find(x=>x.id===view)?.label||'Atlas'}</strong>
        </div>
        <GlobalFinder/>
        <button className="atlas-focus-workspace" type="button" onClick={toggleFocus}
          title={focusedWorkspace?'Restore workspace sidebar':'Enter distraction-free workspace'}
          aria-label={focusedWorkspace?'Show workspace sidebar':'Expand workspace content'}
          aria-pressed={focusedWorkspace}>
          {focusedWorkspace?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}
          <span>{focusedWorkspace?'Navigation':'Focus'}</span>
        </button>
        <span className={'atlas-sync-indicator atlas-sync-'+syncStatus} role="status"
          title={syncStatus==='offline'?'Realtime unavailable. Use Refresh shared records.':'Workspace changes sync automatically between open trainer sessions.'}>
          <span className="atlas-sync-dot" aria-hidden="true"/>
          <span>{syncStatus==='live'||syncStatus==='updated'?'Live sync':syncStatus==='connecting'?'Connecting':'Sync offline'}</span>
        </span>
        <nav className="mv-main-nav" aria-label="Main pages">
          {MIAMI_NAV.map(item=>{
            const Icon=item.icon;
            return <button key={item.id} className={'mv-nav-item'+(view===item.id?' active':'')}
              aria-current={view===item.id?'page':undefined} aria-label={item.label} title={item.label} onClick={()=>go(item.id)}>
              <Icon size={22} strokeWidth={view===item.id?2.2:1.9}/><span>{item.label}</span>
            </button>;
          })}
        </nav>
        <div className="mv-header-trainers">
          <label className={'atlas-trainer-switch '+(activeTrainerId==='trainer_b'?'trainer-b':'trainer-a')}>
            <span className="atlas-trainer-dot"/>
            <span className="atlas-trainer-description"><small>PLANNING AS</small>
              <select value={activeTrainerId} aria-label="Switch field sales trainer"
                onChange={e=>setActiveTrainerId(e.target.value==='trainer_b'?'trainer_b':'trainer_a')}>
                {trainerProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </span>
            <ChevronDown size={14} aria-hidden="true"/>
          </label>
          <div className="mv-appearance-control" role="group" aria-label="Appearance">
            <button type="button" className={theme==='light'?'active':''} onClick={()=>setTheme('light')}
              aria-pressed={theme==='light'} title="Miami Vice Light"><Sun size={17}/><span>Light</span></button>
            <button type="button" className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}
              aria-pressed={theme==='dark'} title="Miami Vice Dark"><Moon size={17}/><span>Dark</span></button>
          </div>
          <div className="mv-more-holder">
            <button className="mv-header-settings" aria-label="Open workspace settings and tools"
              aria-expanded={moreOpen} onClick={()=>setMoreOpen(!moreOpen)}>
              <Settings size={19}/><span>Tools</span><ChevronDown size={15}/>
            </button>
            {moreOpen&&<div className="mv-more-menu">
              <button type="button" onClick={()=>{setSetupOpen(true);setMoreOpen(false);}}><Compass size={17}/> Workspace setup</button>
              <button type="button" className="mv-more-create" onClick={()=>{setQuickAddOpen(true);setMoreOpen(false);}}>
                <Plus size={17}/> Create field record
              </button>
              <button className="mv-more-title" onClick={()=>{setTrainerProfilesOpen(true);setMoreOpen(false);}}>
                <Settings size={17}/> Edit trainer profiles
              </button>
              {FIELD_SHORTCUTS.map(item=>{
                const Icon=item.icon;
                return <button key={item.id} onClick={()=>go(item.id)}><Icon size={16}/>{item.label}</button>;
              })}
              {MIAMI_MORE.map(item=>{
                const Icon=item.icon;
                return <button key={item.id} onClick={()=>go(item.id)}><Icon size={16}/>{item.label}</button>;
              })}
              <button type="button" onClick={()=>{toggleFocus();setMoreOpen(false);}}>
                {focusedWorkspace?<PanelLeftOpen size={16}/>:<PanelLeftClose size={16}/>}
                {focusedWorkspace?'Show workspace navigation':'Expand workspace content'}
              </button>
              <button type="button" onClick={()=>{toggleDensity();setMoreOpen(false);}}>
                <LayoutDashboard size={16}/>{density==='compact'?'Comfortable spacing':'Compact spacing'}
              </button>
              <button type="button" onClick={()=>{setPwaOpen(true);setMoreOpen(false);}}><Smartphone size={16}/> Install & offline settings</button>
              <button onClick={()=>{copyWorkspaceLink();setMoreOpen(false);}}><Users size={16}/> Copy workspace link</button>
              <button onClick={()=>{reload().catch(e=>setError(errorText(e)));setMoreOpen(false);}}><RefreshCw size={16}/> Refresh shared records</button>
            </div>}
          </div>
        </div>
        <div className="mv-mobile-trainer">
          <span className={'mv-mobile-trainer-dot '+(activeTrainerId==='trainer_b'?'trainer-b':'trainer-a')}/>
          <select aria-label="Choose active field sales trainer" value={activeTrainerId}
            onChange={e=>setActiveTrainerId(e.target.value==='trainer_b'?'trainer_b':'trainer_a')}>
            {trainerProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </div>
        <button className="mv-theme-toggle mv-theme-mobile" type="button" onClick={toggleTheme}
          aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'}
          aria-pressed={theme==='light'}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          {theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}
        </button>
        <button className="ios-mobile-add" type="button" aria-label="Create a field record"
          aria-expanded={quickAddOpen} onClick={()=>setQuickAddOpen(true)}>
          <Plus size={22}/>
        </button>
        <button className="mv-mobile-menu-trigger" aria-label="Open tools and navigation"
          aria-expanded={menuOpen} aria-haspopup="dialog" onClick={()=>setMenuOpen(true)}>
          <MoreHorizontal size={23}/>
        </button>
      </header>
      {identity==='member'&&<AirportAlertRail
        codes={(board.trips||[])
          .filter(t=>t.status==='Planned'&&t.endDate>=today()&&
            t.startDate<=new Date(Date.now()+3*86400000).toISOString().slice(0,10))
          .flatMap(t=>[t.arrivalAirport,...trainerProfiles
            .filter(profile=>profile.name===t.trainer)
            .flatMap(profile=>profile.homeAirports)])}
        onReview={()=>go('air')}/>}
      {menuOpen&&<div className="mv-mobile-backdrop" onClick={()=>setMenuOpen(false)}/>}
      <nav className={'mv-mobile-drawer'+(menuOpen?' open':'')} hidden={!menuOpen}
        role="dialog" aria-modal={menuOpen} aria-label="Field Sales Atlas tools and navigation">
        <button type="button" className="ios-sheet-grab" aria-label="Close tools"
          onTouchStart={e=>{moreSheetTouchY.current=e.touches[0]?.clientY??null;}}
          onTouchEnd={e=>{
            if(moreSheetTouchY.current!==null&&(e.changedTouches[0]?.clientY??0)-moreSheetTouchY.current>55)setMenuOpen(false);
            moreSheetTouchY.current=null;
          }} onClick={()=>setMenuOpen(false)}>
          <span aria-hidden="true"/>
        </button>
        <div className="mv-mobile-drawer-head"><span>TOOLS & SETTINGS</span>
          <button onClick={()=>setMenuOpen(false)} aria-label="Close menu"><X size={20}/></button>
        </div>
        <label className="fsa-mobile-trainer-picker">ACTIVE TRAINER
          <select aria-label="Change active trainer from navigation" value={activeTrainerId}
            onChange={event=>setActiveTrainerId(event.target.value==='trainer_b'?'trainer_b':'trainer_a')}>
            {trainerProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <span className="fsa-drawer-section">FIELD INTELLIGENCE</span>
        {FIELD_SHORTCUTS.map(item=>{
          const Icon=item.icon;
          const active=item.id==='mission' ? view==='mission' : item.id==='coaching'
            ? view==='people'&&peopleSection==='coaching'
            : view==='plan'&&planSection===item.id;
          return <button key={item.id} className={active?'active':''} onClick={()=>go(item.id)}>
            <Icon size={18}/>{item.label}
          </button>;
        })}
        <span className="fsa-drawer-section">ADDITIONAL TOOLS</span>
        {MIAMI_MORE.map(item=>{
          const Icon=item.icon;
          return <button key={item.id} className={view===item.id?'active':''} onClick={()=>go(item.id)}>
            <Icon size={18}/>{item.label}
          </button>;
        })}
        <button onClick={()=>{setSetupOpen(true);setMenuOpen(false);}}><Compass size={18}/> Workspace setup</button>
        <button onClick={()=>{setTrainerProfilesOpen(true);setMenuOpen(false);}}><Settings size={18}/> Trainer profiles</button>
        <button onClick={()=>{toggleTheme();setMenuOpen(false);}}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>} {theme==='dark'?'Light theme':'Dark theme'}</button>
        <button onClick={()=>{toggleDensity();setMenuOpen(false);}}><LayoutDashboard size={18}/> {density==='compact'?'Comfortable spacing':'Compact spacing'}</button>
        <button onClick={()=>{setPwaOpen(true);setMenuOpen(false);}}><Smartphone size={18}/> Install as iPhone app & offline settings</button>
        <button onClick={()=>{copyWorkspaceLink();setMenuOpen(false);}}><Share2 size={18}/> Copy workspace link</button>
        <button onClick={()=>{reload().catch(e=>setError(errorText(e)));setMenuOpen(false);}}><RefreshCw size={18}/> Refresh shared records</button>
      </nav>
      <div className="mv-shell">
        {view!=='home'&&<FieldCompass variant="mobile"/>}
        <main id="field-atlas-main" tabIndex={-1} className={'mv-content op-content'+(view==='home'?' mv-content-map':' mv-content-inner')}>
          {error&&<div className="op-error" role="alert"><CircleAlert size={17}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
          {notice&&<div className="op-notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
          {identity==='loading'&&<div className="op-alert"><RefreshCw size={18}/><span>Opening your workspace. No account required.</span></div>}
          {identity==='error'&&<div className="op-alert warn"><CircleAlert size={18}/><span>This workspace link could not be opened. Existing records have not been changed.</span>
            <button className="op-btn tiny" onClick={()=>initializeWorkspace().then(()=>reload()).catch(e=>setError(errorText(e)))}>Retry link</button>
            <button className="op-btn tiny" onClick={startFreshWorkspace}>Create separate workspace</button>
          </div>}
          <WorkspaceSetup expanded={setupOpen} onExpandedChange={setSetupOpen}/>
          {identity==='member'&&board.truncated&&<div className="op-alert warn"><CircleAlert size={18}/><span>The workspace has more records than the current data page. Review all records before relying on totals or bulk changes.</span></div>}
          {view==='plan'&&<PlanHub section={planSection} onSectionChange={changePlanSection} onDestination={startTravel} onCircuit={startCircuit}/>}
          {view==='people'&&<PeopleHub section={peopleSection} onSectionChange={changePeopleSection}/>}
          {view==='mission'&&<Suspense fallback={<div className='atlas-screen-loading' role='status'>Opening Mission Control…</div>}>
            <TodayHub onPlan={startTravel}/>
          </Suspense>}
          {view==='home'&&<Suspense fallback={<div className="atlas-screen-loading" role="status">Opening the interactive map…</div>}>
            <MiamiMapHome theme={theme} atlas={atlas} airports={airports} managers={board.managers||[]}
              assignments={board.assignments||[]} onDestination={startTravel}
              onAddManager={code=>{if(code)setState(code);open('manager');}}/>
          </Suspense>}
          {view==='air'&&<Suspense fallback={<div className="atlas-screen-loading" role="status">Opening travel planner…</div>}>
            <AirTravelPage initialTab='discover'/>
          </Suspense>}
          {view==='week'&&<Suspense fallback={<p role='status'>Opening the field week…</p>}><TwoTrainerWeek onDestination={startTravel} onCircuit={startCircuit}/></Suspense>}
          {view==='overview'&&<OverviewPage/>}
          {view==='map'&&<MapPage/>}
          {view==='managers'&&<ManagersPage/>}
          {view==='trips'&&<TripsPage/>}
          {view==='coaching'&&<CoachingPage/>}
          {view==='calendar'&&<CalendarPage/>}
          {view==='data'&&<DataPage/>}
          {view==='team'&&<SharedWorkspacePage/>}
        </main>
        {view!=='home'&&<footer className="op-footer mv-footer"><span>Field Sales Atlas · Sales Operational Guide</span>
          <span>Shared-link workspace · Only share the access link with trusted colleagues</span>
        </footer>}
      </div>
      <nav className="mv-bottom-nav ios-tab-bar" aria-label="Primary iPhone tabs">
        {QUICK_NAV.map(item=>{
          const Icon=item.icon;
          return <button key={item.id} type="button" className={view===item.id?'active':''}
            aria-label={item.label} aria-current={view===item.id?'page':undefined}
            onClick={()=>go(item.id)}>
            <span className="ios-tab-icon"><Icon size={22} strokeWidth={view===item.id?2.2:1.85}/></span>
            <span className="ios-tab-label">{item.label}</span>
          </button>;
        })}
      </nav>
        </div>
      </div>
      {quickAddOpen&&<>
        <button type="button" className="ios-action-scrim" aria-label="Dismiss quick actions"
          onClick={()=>setQuickAddOpen(false)}/>
        <section className="ios-quick-actions" role="dialog" aria-modal="true" aria-label="Create a field record">
          <button type="button" className="ios-sheet-grab" aria-label="Close quick actions"
            onTouchStart={e=>{quickSheetTouchY.current=e.touches[0]?.clientY??null;}}
            onTouchEnd={e=>{
              if(quickSheetTouchY.current!==null&&(e.changedTouches[0]?.clientY??0)-quickSheetTouchY.current>55)setQuickAddOpen(false);
              quickSheetTouchY.current=null;
            }} onClick={()=>setQuickAddOpen(false)}><span aria-hidden="true"/></button>
          <header><div><span>FIELD ACTIONS</span><h2>What are we creating?</h2></div>
            <button type="button" onClick={()=>setQuickAddOpen(false)} aria-label="Close"><X size={19}/></button>
          </header>
          <div className="ios-quick-grid">
            <button type="button" disabled={identity!=='member'} onClick={()=>{setQuickAddOpen(false);open('manager');}}>
              <Users size={21}/><span><strong>New manager</strong><small>Add a person to your territory</small></span><ArrowRight size={17}/>
            </button>
            <button type="button" disabled={identity!=='member'||!(board.managers||[]).length}
              onClick={()=>{setQuickAddOpen(false);open('visit');}}>
              <CalendarDays size={21}/><span><strong>Coaching visit</strong><small>Schedule a ride-along</small></span><ArrowRight size={17}/>
            </button>
            <button type="button" disabled={identity!=='member'||!(board.managers||[]).length}
              onClick={()=>{setQuickAddOpen(false);open('coaching');}}>
              <ClipboardCheck size={21}/><span><strong>Coaching note</strong><small>Capture feedback and follow-up</small></span><ArrowRight size={17}/>
            </button>
            <button type="button" onClick={()=>{setQuickAddOpen(false);go('air');}}>
              <Plane size={21}/><span><strong>Plan a trip</strong><small>Airports, stops and itinerary</small></span><ArrowRight size={17}/>
            </button>
          </div>
        </section>
      </>}
      <OperationsModal/>
      <IosPullRefresh
        enabled={identity==='member'&&['plan','people','calendar'].includes(view)&&
          !modal&&!menuOpen&&!quickAddOpen&&!pwaOpen&&!trainerProfilesOpen}
        onRefresh={reload}/>
      <PwaCompanion open={pwaOpen} activePage={view} onRequestOpen={()=>setPwaOpen(true)}
        onClose={()=>setPwaOpen(false)} onReconnect={reload}
        onOpenRecovery={()=>{setPwaOpen(false);go('team');}}/>

      {trainerProfilesOpen&&<TrainerProfilesEditor profiles={trainerProfiles} airports={airports}
        onClose={()=>setTrainerProfilesOpen(false)}
        onSaved={async()=>{await reload();setNotice('Trainer profile updated.');}}/>}
    </div>
  </Store.Provider>;
}
export default function Operations(){return <Product/>;}
