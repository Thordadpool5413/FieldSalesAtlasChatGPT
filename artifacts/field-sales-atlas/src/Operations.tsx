
import {
Activity,
ArrowRight,
CalendarDays,
CheckCircle2,
ChevronDown,ChevronLeft,
CircleAlert,
ClipboardCheck,
Compass,Database,LayoutDashboard,Map as MapIcon,
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
  syncStatus:'connecting'|'live'|'offline'|'updated';
  lastSyncAt:string;
  airportCheckedAt:string;
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
  {id:'home',label:'Atlas',icon:MapIcon},
  {id:'plan',label:'Travel',icon:Plane},
  {id:'people',label:'People',icon:Users},
  {id:'calendar',label:'Calendar',icon:CalendarDays},
];
const QUICK_NAV=MIAMI_NAV;
// Surface existing working tools without changing the four-tab phone navigation.
type NavItem={id:Page;label:string;icon:typeof Plane;description?:string};
const FIELD_SHORTCUTS: NavItem[]=[
  {id:'mission',label:'Mission Control',icon:Sparkles,description:'Review field readiness and find work that needs attention.'},
  {id:'radar',label:'Flight DNA',icon:Activity,description:'Check past flights, airport alerts, and weather.'},
  {id:'booked',label:'Booked flights',icon:Plane,description:'Review imported itineraries and flight details.'},
  {id:'coordinate',label:'Coordinate trainers',icon:Route,description:'Balance trainer coverage and find better visit options.'},
  {id:'coaching',label:'Coaching desk',icon:ClipboardCheck,description:'Review coaching notes and follow-up commitments.'},
];
const MIAMI_MORE: NavItem[]=[
  {id:'overview',label:'Reports',icon:Activity,description:'See regional coverage and manager activity.'},
  {id:'air',label:'Airport & route planner',icon:Plane,description:'Compare airports and routes for a trip.'},
  {id:'map',label:'County & ZIP explorer',icon:Compass,description:'Explore counties, towns, and ZIP territories.'},
  {id:'data',label:'Data & exports',icon:Database,description:'Import or download workspace records.'},
  {id:'team',label:'Sharing & recovery',icon:ShieldCheck,description:'Manage sharing and restore workspace data.'},
];
const DESKTOP_NAV_GROUPS:Array<{label:string;items:NavItem[]}>=[
  {label:'PLAN',items:[MIAMI_NAV[0],MIAMI_NAV[1],MIAMI_NAV[3]]},
  {label:'TEAM',items:[MIAMI_NAV[2],FIELD_SHORTCUTS[3],FIELD_SHORTCUTS[4]]},
  {label:'INSIGHTS',items:[FIELD_SHORTCUTS[0],FIELD_SHORTCUTS[1],FIELD_SHORTCUTS[2],MIAMI_MORE[0]]},
];
const PRIMARY_NAV_IDS=new Set<Page>(MIAMI_NAV.map(item=>item.id));
const MOBILE_TOOL_GROUPS=DESKTOP_NAV_GROUPS
  .map(group=>({label:group.label,items:group.items.filter(item=>!PRIMARY_NAV_IDS.has(item.id))}))
  .filter(group=>group.items.length>0);
const ADDITIONAL_TOOLS=MIAMI_MORE.filter(item=>item.id!=='overview');
function isNavItemActive(id:Page,view:Page,planSection:string,peopleSection:string){
  if(id==='mission')return view==='mission';
  if(id==='coaching')return view==='people'&&peopleSection==='coaching';
  if(['coordinate','radar','booked','week','trips','air'].includes(id))
    return view==='plan'&&(planSection===id||(id==='air'&&planSection==='travel'));
  if(id==='people')return view==='people'&&peopleSection!=='coaching';
  return view===id;
}
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
  const [lastSyncAt,setLastSyncAt]=useState('');
  const lastSyncRef=useRef('');
  const reloadRef=useRef<()=>Promise<void>>(async()=>undefined);
  const [atlas,setAtlas]=useState<unknown>(localUsAtlas);
  const [airports,setAirports]=useState<Airport[]>([...STARTER_AIRPORTS,...CANADA_STARTER_AIRPORTS]);
  const [airportSource,setAirportSource]=useState<Context['airportSource']>('loading');
  const [airportCheckedAt,setAirportCheckedAt]=useState('');
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
    themeMeta?.setAttribute('content',theme==='dark'?'#081226':'#f2f6ff');
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
    if(b.needsTeam)throw Error('This shared workspace cannot be found.');
    setBoard(b);
    setLastSyncAt(new Date().toISOString());
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
        if(alive){
          setAirports(records);
          setAirportSource(response.data?.stale?'cached':'live');
          setAirportCheckedAt(typeof response.data?.checkedAt==='string'?response.data.checkedAt:'');
        }
      }catch{
        if(alive){
          setAirports([...STARTER_AIRPORTS,...CANADA_STARTER_AIRPORTS]);
          setAirportSource('starter');
          setAirportCheckedAt('');
        }
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
  function openWorkspaceSetup(){
    go('home');
    setSetupOpen(true);
    setMenuOpen(false);
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
    trainerProfiles,activeTrainerId,setActiveTrainerId,activeTrainer,syncRevision,syncStatus,lastSyncAt,airportCheckedAt,
    openTrainers:()=>setTrainerProfilesOpen(true),
    travelRequest,clearTravelRequest:()=>setTravelRequest(null),atlasJump,jumpToAtlas,startTravel,clearAtlasJump:()=>setAtlasJump(null),selectedManager,setSelectedManager,
    selectedCounty,setSelectedCounty,modal,open,close,atlas,airports,airportSource,
    geo,geoBusy,geoError,busy,error,notice,setError,setNotice,reload,submit,
  }),[board,user,identity,state,zctaFocus,mapMode,view,activeTrainerId,syncRevision,syncStatus,lastSyncAt,airportCheckedAt,travelRequest,atlasJump,selectedManager,selectedCounty,modal,atlas,airports,airportSource,geo,geoBusy,geoError,busy,error,notice]);


  return <Store.Provider value={context}>
    <div className={'mv-app op-root atlas-design-v3 atlas-product-v4 atlas-command-v5 vice-product'+(focusedWorkspace?' atlas-workspace-focused':'')}
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
          <div className="fsa-sidebar-search">
            <GlobalFinder/>
          </div>
          <div className="fsa-sidebar-scroll" role="region" aria-label="Workspace tools">
          <button type="button" className="fsa-sidebar-create" aria-haspopup="dialog"
            aria-expanded={quickAddOpen} onClick={()=>setQuickAddOpen(true)}>
            <Plus size={20}/><span>New field record</span><ArrowRight size={17}/>
          </button>
          {DESKTOP_NAV_GROUPS.map(group=><section className="fsa-sidebar-group" key={group.label}>
            <div className="fsa-sidebar-label">{group.label}</div>
            <nav className="fsa-side-nav fsa-side-tools" aria-label={group.label.toLowerCase()+' sections'}>
              {group.items.map(item=>{
              const Icon=item.icon;
              const active=isNavItemActive(item.id,view,planSection,peopleSection);
              return <button type="button" key={item.id}
                className={'fsa-side-link fsa-tool-link'+(active?' active':'')}
                aria-current={active?'page':undefined}
                aria-label={item.label}
                aria-describedby={item.description?'fsa-tool-description-desktop-'+item.id:undefined}
                title={item.label} onClick={()=>go(item.id)}>
                <Icon size={19}/><span className="fsa-tool-copy">
                  <strong id={'fsa-tool-label-desktop-'+item.id}>{item.label}</strong>
                  {item.description&&<small id={'fsa-tool-description-desktop-'+item.id}>{item.description}</small>}
                </span>
              </button>;
            })}
            </nav>
          </section>)}
          <details className="fsa-more-tools" key={ADDITIONAL_TOOLS.some(item=>isNavItemActive(item.id,view,planSection,peopleSection))?'more-active':'more-inactive'}
            open={ADDITIONAL_TOOLS.some(item=>isNavItemActive(item.id,view,planSection,peopleSection))?true:undefined}>
            <summary><Settings size={19}/><span>More tools</span><ChevronDown size={15}/></summary>
            <nav aria-label="Additional workspace tools">
              {ADDITIONAL_TOOLS.map(item=>{
                const Icon=item.icon;
                const active=isNavItemActive(item.id,view,planSection,peopleSection);
                return <button key={item.id} type="button" onClick={()=>go(item.id)}
                  className={active?'active':''} aria-current={active?'page':undefined} aria-label={item.label}
                  aria-describedby={item.description?'fsa-tool-description-more-'+item.id:undefined}>
                  <Icon size={16}/><span className="fsa-tool-copy">
                    <strong id={'fsa-tool-label-more-'+item.id}>{item.label}</strong>
                    {item.description&&<small id={'fsa-tool-description-more-'+item.id}>{item.description}</small>}
                  </span>
                </button>;
              })}
            </nav>
          </details>
          </div>
          <div className="fsa-sidebar-bottom">
            <div className={'fsa-sidebar-sync atlas-sync-'+syncStatus} role="status"
              aria-label={'Workspace sync '+syncStatus}
              title={lastSyncAt?'Last successful workspace refresh: '+new Date(lastSyncAt).toLocaleString():'Waiting for the first successful workspace refresh'}>
              <span className="atlas-sync-dot" aria-hidden="true"/>
              <span>Workspace · {syncStatus==='live'?'Live':syncStatus==='updated'?'Updated':syncStatus==='connecting'?'Connecting':'Offline'}</span>
              <small>{lastSyncAt?'Refreshed '+new Date(lastSyncAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Awaiting first refresh'}</small>
            </div>
            <details className="fsa-sidebar-controls" onKeyDown={event=>{
              if(event.key==='Escape'){
                event.currentTarget.open=false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }} onClick={event=>{
              if((event.target as Element).closest('button')){
                event.currentTarget.open=false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}>
              <summary><Settings size={17}/><span>Workspace controls</span><ChevronDown size={15}/></summary>
              <div className="fsa-sidebar-control-body">
                <label className={'fsa-sidebar-trainer '+(activeTrainerId==='trainer_b'?'trainer-b':'trainer-a')}>
                  <span>Planning as</span>
                  <select value={activeTrainerId} aria-label="Switch field sales trainer"
                    onChange={e=>setActiveTrainerId(e.target.value==='trainer_b'?'trainer_b':'trainer_a')}>
                    {trainerProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
                  </select>
                </label>
                <div className="fsa-sidebar-appearance">
                  <span>Appearance</span>
                  <div className="mv-appearance-control" role="group" aria-label="Appearance">
                    <button type="button" className={theme==='light'?'active':''} onClick={()=>setTheme('light')}
                      aria-pressed={theme==='light'} title="Miami Vice Light"><Sun size={16}/><span>Light</span></button>
                    <button type="button" className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}
                      aria-pressed={theme==='dark'} title="Miami Vice Dark"><Moon size={16}/><span>Dark</span></button>
                  </div>
                </div>
                <button type="button" onClick={toggleFocus}>
                  {focusedWorkspace?<PanelLeftOpen size={16}/>:<PanelLeftClose size={16}/>}
                  <span>{focusedWorkspace?'Show navigation':'Focus workspace'}</span>
                </button>
                <button type="button" onClick={toggleDensity}>
                  <LayoutDashboard size={16}/>
                  <span>{density==='compact'?'Comfortable spacing':'Compact spacing'}</span>
                </button>
                <button type="button" onClick={openWorkspaceSetup}>
                  <Compass size={16}/><span>Workspace setup</span>
                </button>
                <button type="button" onClick={()=>setPwaOpen(true)}>
                  <Smartphone size={16}/><span>Install & offline settings</span>
                </button>
                <button type="button" onClick={copyWorkspaceLink}>
                  <Share2 size={16}/><span>Copy workspace link</span>
                </button>
                <button type="button" onClick={()=>reload().catch(e=>setError(errorText(e)))}>
                  <RefreshCw size={16}/><span>Refresh shared records</span>
                </button>
                <button type="button" onClick={()=>setTrainerProfilesOpen(true)}>
                  <Settings size={16}/><span>Trainer profiles</span>
                </button>
              </div>
            </details>
          </div>
        </aside>
        <div className="fsa-stage">
      {focusedWorkspace&&<button type="button" className="fsa-focus-restore" onClick={toggleFocus}>
        <PanelLeftOpen size={17}/><span>Show navigation</span>
      </button>}
      <header className={'mv-header'+(hasIosBack?' ios-has-back':'')}>
        {hasIosBack&&<button type="button" className="ios-back-button"
          onClick={iosGoBack} aria-label="Back to previous workspace section">
          <ChevronLeft size={22}/><span>Back</span>
        </button>}
        <button className="mv-brand" onClick={()=>go('home')} aria-label="Open the Field Sales Atlas map home">
          <OfficialFieldAtlasLogo/>
        </button>
        <GlobalFinder enableKeyboardShortcut={false}/>
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
        <p className="fsa-drawer-hint">Atlas, Travel, People and Calendar stay in the bottom bar. Related tools are grouped below.</p>
        <label className="fsa-mobile-trainer-picker">ACTIVE TRAINER
          <select aria-label="Change active trainer from navigation" value={activeTrainerId}
            onChange={event=>setActiveTrainerId(event.target.value==='trainer_b'?'trainer_b':'trainer_a')}>
            {trainerProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        {MOBILE_TOOL_GROUPS.map(group=><div key={group.label} className="fsa-mobile-tool-group" role="group" aria-label={group.label+' tools'}>
          <span className="fsa-drawer-section" role="heading" aria-level={2}>{group.label}</span>
          {group.items.map(item=>{
            const Icon=item.icon;
            const active=isNavItemActive(item.id,view,planSection,peopleSection);
            return <button key={item.id} className={active?'active':''} aria-current={active?'page':undefined}
              aria-label={item.label}
              aria-describedby={item.description?'fsa-tool-description-mobile-'+item.id:undefined}
              onClick={()=>go(item.id)}>
              <Icon size={18}/><span className="fsa-mobile-tool-copy">
                <strong id={'fsa-tool-label-mobile-'+item.id}>{item.label}</strong>
                <small id={'fsa-tool-description-mobile-'+item.id}>{item.description}</small>
              </span>
            </button>;
          })}
        </div>)}
        <div className="fsa-mobile-tool-group" role="group" aria-label="More tools">
        <span className="fsa-drawer-section" role="heading" aria-level={2}>MORE TOOLS</span>
        {ADDITIONAL_TOOLS.map(item=>{
          const Icon=item.icon;
          const active=isNavItemActive(item.id,view,planSection,peopleSection);
          return <button key={item.id} className={active?'active':''} aria-current={active?'page':undefined}
            aria-label={item.label}
            aria-describedby={item.description?'fsa-tool-description-mobile-more-'+item.id:undefined}
            onClick={()=>go(item.id)}>
            <Icon size={18}/><span className="fsa-mobile-tool-copy">
              <strong id={'fsa-tool-label-mobile-more-'+item.id}>{item.label}</strong>
              <small id={'fsa-tool-description-mobile-more-'+item.id}>{item.description}</small>
            </span>
          </button>;
        })}
        </div>
        <button onClick={openWorkspaceSetup}><Compass size={18}/> Workspace setup</button>
        <button onClick={()=>{setTrainerProfilesOpen(true);setMenuOpen(false);}}><Settings size={18}/> Trainer profiles</button>
        <button onClick={()=>{toggleTheme();setMenuOpen(false);}}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>} {theme==='dark'?'Light theme':'Dark theme'}</button>
        <button onClick={()=>{toggleDensity();setMenuOpen(false);}}><LayoutDashboard size={18}/> {density==='compact'?'Comfortable spacing':'Compact spacing'}</button>
        <button onClick={()=>{setPwaOpen(true);setMenuOpen(false);}}><Smartphone size={18}/> Install as iPhone app & offline settings</button>
        <button onClick={()=>{copyWorkspaceLink();setMenuOpen(false);}}><Share2 size={18}/> Copy workspace link</button>
        <button onClick={()=>{reload().catch(e=>setError(errorText(e)));setMenuOpen(false);}}><RefreshCw size={18}/> Refresh shared records</button>
      </nav>
      <div className="mv-shell">
        <main id="field-atlas-main" tabIndex={-1} className={'mv-content op-content'+(view==='home'?' mv-content-map':' mv-content-inner')}>
          {error&&identity!=='error'&&<div className="op-error" role="alert"><CircleAlert size={17}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
          {notice&&<div className="op-notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
          {identity==='loading'&&<div className="op-alert"><RefreshCw size={18}/><span>Opening your workspace. No account required.</span></div>}
          {identity==='error'&&<div className="op-alert warn" role="alert"><CircleAlert size={18}/><span>{error||'This workspace link could not be opened.'} Existing records have not been changed.</span>
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
              onAddManager={code=>{if(code)setState(code);open('manager');}}
              onStartSetup={openWorkspaceSetup}/>
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
        accessSeat={board.accessSeat}
        onClose={()=>setTrainerProfilesOpen(false)}
        onSaved={async()=>{await reload();setNotice('Trainer profile updated.');}}/>}
    </div>
  </Store.Provider>;
}
export default function Operations(){return <Product/>;}
