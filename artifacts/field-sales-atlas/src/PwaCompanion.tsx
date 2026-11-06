import {
ArrowRight,Check,CircleAlert,Download,RefreshCw,Share2,
WifiOff,X
} from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import { getShareUrl } from './workspaceApi';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Props {
  open: boolean;
  activePage: string;
  onReconnect: () => Promise<void>;
  onRequestOpen: () => void;
  onClose: () => void;
  onOpenRecovery: () => void;
}

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  const ios = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    ios.standalone === true
  );
};

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function PwaCompanion({ open, onReconnect, onClose, onOpenRecovery }: Props) {
  const [installed, setInstalled] = useState(isStandalone);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [recovery, setRecovery] = useState<'idle'|'loading'|'complete'|'failed'>('idle');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [copied, setCopied] = useState(false);
  const [installNotice, setInstallNotice] = useState('');
  const appRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadWhenReady = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const closeHandler=useRef(onClose);
  closeHandler.current=onClose;
  const reconnectHandler=useRef(onReconnect);
  reconnectHandler.current=onReconnect;
  const wasOffline=useRef(!navigator.onLine);
  const touchStart = useRef<number | null>(null);
  const ios = isIOS();

  useEffect(() => {
    const status = () => {
      const connected=navigator.onLine;
      setOnline(connected);
      if(!connected){wasOffline.current=true;setRecovery('idle');return;}
      if(wasOffline.current){
        wasOffline.current=false;
        setRecovery('loading');
        void reconnectHandler.current().then(()=>setRecovery('complete'))
          .catch(()=>setRecovery('failed'));
      }
    };
    const refreshInstalled = () => setInstalled(isStandalone());
    const promptInstall = (event: Event) => {
      const candidate = event as InstallPrompt;
      candidate.preventDefault();
      setInstallPrompt(candidate);
    };
    const installedEvent = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    window.addEventListener('beforeinstallprompt', promptInstall);
    window.addEventListener('appinstalled', installedEvent);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', refreshInstalled);

    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = viewport?.height || window.innerHeight;
      const offset = viewport?.offsetTop || 0;
      const keyboardOpen = window.innerHeight - height - offset > 155;
      document.documentElement.style.setProperty('--atlas-visual-height', height + 'px');
      document.documentElement.style.setProperty('--atlas-visual-offset', offset + 'px');
      document.documentElement.dataset.atlasKeyboard = keyboardOpen ? 'open' : 'closed';
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    document.documentElement.dataset.atlasStandalone = isStandalone() ? 'yes' : 'no';

    const sw = navigator.serviceWorker;
    let active = true;
    const changed = () => {
      if (reloadWhenReady.current) window.location.reload();
    };
    const attachUpdates = (registration: ServiceWorkerRegistration) => {
      appRegistration.current = registration;
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
      const found = () => {
        const worker = registration.installing;
        if (!worker) return;
        const update = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller && active) {
            setWaiting(registration.waiting || worker);
          }
        };
        worker.addEventListener('statechange', update);
      };
      registration.addEventListener('updatefound', found);
      found();
      void registration.update().catch(() => undefined);
    };
    if ('serviceWorker' in navigator) {
      sw.addEventListener('controllerchange', changed);
      void sw.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(registration => { if (active) attachUpdates(registration); })
        .catch(() => undefined);
    }
    const visible = () => {
      if (document.visibilityState === 'visible') {
        refreshInstalled();
        void appRegistration.current?.update().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      window.removeEventListener('online', status);
      window.removeEventListener('offline', status);
      window.removeEventListener('beforeinstallprompt', promptInstall);
      window.removeEventListener('appinstalled', installedEvent);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', refreshInstalled);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('visibilitychange', visible);
      if ('serviceWorker' in navigator) sw.removeEventListener('controllerchange', changed);
      delete document.documentElement.dataset.atlasKeyboard;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.atlasStandalone = installed ? 'yes' : 'no';
  }, [installed]);
  useEffect(()=>{
    if(recovery!=='complete')return;
    const timeout=window.setTimeout(()=>setRecovery('idle'),4400);
    return ()=>window.clearTimeout(timeout);
  },[recovery]);

  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('.ios-pwa-close')?.focus();
    const focusables = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],[tabindex="0"]'
    ) || []).filter(item => item.getClientRects().length > 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeHandler.current(); }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
      prior?.focus({ preventScroll: true });
    };
  }, [open]);

  async function copyWorkspace() {
    const link = getShareUrl();
    if (!link) {
      setInstallNotice('Open your shared workspace before copying its recovery link.');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setInstallNotice('Link copied. Anyone holding it can edit this workspace, so keep it private.');
    } catch {
      setInstallNotice('Use Sharing & recovery to copy your workspace link.');
    }
  }

  async function sharePrivateWorkspace(){
    const url=getShareUrl();
    if(!url){setInstallNotice('Open a shared workspace first, then share its private link.');return;}
    if(!navigator.share){await copyWorkspace();return;}
    try{
      await navigator.share({
        title:'Field Sales Atlas',
        text:'Private two-trainer workspace link. Only share with trusted teammates.',
        url
      });
      setInstallNotice('Shared using your device. Anyone with that link can edit workspace records.');
    }catch(error){
      if(error instanceof Error&&error.name==='AbortError')return;
      setInstallNotice('The iOS share sheet was unavailable. You can copy your workspace link instead.');
    }
  }
  async function installApp() {
    if (!installPrompt) return;
    try {
      const prompt = installPrompt;
      setInstallPrompt(null);
      await prompt.prompt();
      const answer = await prompt.userChoice;
      setInstallNotice(answer.outcome === 'accepted'
        ? 'Installation requested. Your device will confirm when the app is added.'
        : 'Installation dismissed. You can try again using your browser menu.');
    } catch {
      setInstallNotice('Automatic installation is not available. Use your browser’s Add to Home Screen option.');
    }
  }

  function applyUpdate() {
    const worker = waiting || appRegistration.current?.waiting;
    if (!worker) {
      void appRegistration.current?.update().catch(() => undefined);
      return;
    }
    reloadWhenReady.current = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  }

  return (
    <>
      {!online && (
        <div className='ios-connectivity-banner' role='status'>
          <WifiOff size={17}/>
          <span>Offline. Maps, FAA data and shared records cannot refresh. Changes need a connection.</span>
          <button type='button' onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
      {online&&recovery!=='idle'&&(
        <div className={'ios-recovery-banner ios-recovery-'+recovery} role='status'>
          <RefreshCw size={16} className={recovery==='loading'?'ios-spinning':''}/>
          <span>{recovery==='loading'?'Refreshing shared records after reconnect…':
            recovery==='complete'?'Connection restored. Shared workspace is up to date.':
            'Network returned, but records could not refresh.'}</span>
          {recovery==='failed'&&<button type='button' onClick={()=>{
            setRecovery('loading');
            void reconnectHandler.current().then(()=>setRecovery('complete')).catch(()=>setRecovery('failed'));
          }}>Retry</button>}
        </div>
      )}
      {waiting && (
        <div className='ios-update-banner' role='status'>
          <RefreshCw size={18}/>
          <span><strong>App update ready.</strong> Finish any unsaved changes before updating.</span>
          <button type='button' onClick={applyUpdate}>Update</button>
          <button type='button' onClick={() => setWaiting(null)} aria-label='Dismiss app update'>
            <X size={16}/>
          </button>
        </div>
      )}
      {open && (
        <div className='ios-pwa-backdrop' onMouseDown={event => {
          if (event.target === event.currentTarget) onClose();
        }}>
          <div className='ios-pwa-sheet' role='dialog' aria-modal='true' aria-label='Install Field Sales Atlas'
            ref={dialog}>
            <button type='button' className='ios-sheet-grab'
              aria-label='Close installation instructions'
              onTouchStart={event => { touchStart.current = event.touches[0]?.clientY ?? null; }}
              onTouchEnd={event => {
                if (touchStart.current !== null &&
                    (event.changedTouches[0]?.clientY ?? 0) - touchStart.current > 55) onClose();
                touchStart.current = null;
              }}
              onClick={onClose}><span aria-hidden='true'/></button>
            <header className='ios-pwa-header'>
              <div className='ios-pwa-app-icon' aria-hidden='true'>
                <img src='/resources/field-sales-atlas-logo.jpg' alt=''/>
              </div>
              <div><span>YOUR FIELD WORKSPACE</span><h2>Field Sales Atlas</h2>
                <p>{installed ? 'Running as an installed app' : 'Install on your Home Screen'}</p>
              </div>
              <button type='button' className='ios-pwa-close' aria-label='Close' onClick={onClose}>
                <X size={18}/>
              </button>
            </header>

            {installed ? (
              <section className='ios-pwa-section'>
                <div className='ios-pwa-good'><Check size={20}/>
                  <span>You're using the installed app. The geographic reference map may work offline, but live cartography, shared edits and aviation intelligence still need an internet connection.</span>
                </div>
              </section>
            ) : (
              <section className='ios-pwa-section'>
                {installPrompt && (
                  <button type='button' className='ios-pwa-primary' onClick={installApp}>
                    <Download size={18}/> Install Field Sales Atlas <ArrowRight size={17}/>
                  </button>
                )}
                {ios ? (
                  <>
                    <h3>Install on iPhone or iPad</h3>
                    <ol className='ios-install-steps'>
                      <li><span>1</span><p>Open this page in <strong>Safari</strong>.</p></li>
                      <li><span>2</span><p>Tap the <strong>Page Menu</strong> button, then <strong>Share</strong>. Some Safari layouts show Share directly.</p><Share2 size={19}/></li>
                      <li><span>3</span><p>Choose <strong>Add to Home Screen</strong>. If it is missing, select <strong>Edit Actions</strong> to enable it.</p></li>
                      <li><span>4</span><p>Keep <strong>Open as Web App</strong> turned on and tap <strong>Add</strong>.</p></li>
                    </ol>
                  </>
                ) : (
                  <>
                    <h3>Install on your device</h3>
                    <p className='ios-pwa-guidance'>Use your browser’s Install app or Add to Home Screen option.
                      The installed version opens in a standalone window without normal browser tabs.</p>
                  </>
                )}
              </section>
            )}

            <section className='ios-pwa-section ios-pwa-recovery'>
              <h3>Keep your two-trainer workspace connected</h3>
              <p>On some iPhones, a new Home Screen app has separate browser storage.
                If it opens an empty workspace, use your saved shared link to reconnect.
                Never put that private access link in a public shortcut.</p>
              <div className='ios-pwa-actions'>
                <button type='button' onClick={sharePrivateWorkspace}>
                  <Share2 size={17}/> Share privately
                </button>
                <button type='button' onClick={copyWorkspace}>
                  {copied ? <Check size={17}/> : <Share2 size={17}/>}
                  {copied ? 'Workspace link copied' : 'Copy private workspace link'}
                </button>
                <button type='button' onClick={onOpenRecovery}>
                  Sharing & recovery <ArrowRight size={16}/>
                </button>
              </div>
              {installNotice && <p className='ios-pwa-message' role='status'>{installNotice}</p>}
            </section>

            <div className='ios-pwa-footer'>
              <CircleAlert size={16}/>
              <span>Previously opened Atlas geography may load from the app shell offline. Live tiles, FAA data and shared manager records require a connection; private workspace records are never cached by the service worker.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
