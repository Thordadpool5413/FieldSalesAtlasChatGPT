import { ArrowRight, Check, ChevronDown, CircleAlert, Compass, Minus, X } from 'lucide-react';
import { useState } from 'react';
import { useOp } from './Operations';
import { canReturnFromDemo, openDemoWorkspace, returnFromDemo } from './workspaceApi';

export default function WorkspaceSetup({ expanded, onExpandedChange }: { expanded: boolean; onExpandedChange: (value: boolean) => void }) {
  const ctx = useOp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const workspaceId = ctx.board.team?.id || '';
  const dismissalKey = 'atlas-setup-dismissed-v1:' + workspaceId;
  const minimizeKey = 'atlas-setup-minimized-v1:' + workspaceId;
  const [minimized, setMinimized] = useState(() => {
    try {
      const saved = localStorage.getItem(minimizeKey);
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(max-width: 600px)').matches;
    } catch { return false; }
  });
  const [dismissedId, setDismissedId] = useState(() => {
    try { return localStorage.getItem(dismissalKey) ? workspaceId : ''; } catch { return ''; }
  });
  if (ctx.identity !== 'member') return null;
  const demo = ctx.board.team?.name === 'Field Sales Atlas demo';
  if (demo) return <section className="atlas-demo-notice" aria-label="Demo workspace">
    <div><strong>Demo workspace</strong><span>Sample people and territories. Your original workspace is separate.</span></div>
    {canReturnFromDemo() && <button className="op-btn" onClick={() => { returnFromDemo(); window.location.reload(); }}>Return to my workspace <ArrowRight size={16}/></button>}
  </section>;
  const steps = [
    { title: 'Add your first manager', detail: 'Create a manager record or import your roster.', done: !!ctx.board.managers?.length, action: () => ctx.open('manager'), label: 'Add first manager' },
    { title: 'Choose a region and territory', detail: 'Assign a state, county, city or ZIP area to a manager.', done: !!ctx.board.assignments?.length, action: () => ctx.open('assignment'), label: 'Choose a region' },
    { title: 'Schedule your first visit', detail: 'Put a coaching or field visit on the shared calendar.', done: !!ctx.board.visits?.length, action: () => ctx.open('visit'), label: 'Schedule a visit' },
  ];
  const complete = steps.filter(step => step.done).length;
  const next = steps.findIndex(step => !step.done);
  let storedDismissal=false;
  try { storedDismissal=!!localStorage.getItem(dismissalKey); } catch { /* Optional reminder preference. */ }
  if (!expanded && (complete === steps.length || dismissedId === workspaceId || storedDismissal || ctx.view !== 'home')) return null;
  function dismiss() {
    try { localStorage.setItem(dismissalKey, 'true'); } catch { /* Dismiss for this session. */ }
    setDismissedId(workspaceId); onExpandedChange(false);
  }
  function minimize() {
    try { localStorage.setItem(minimizeKey, 'true'); } catch { /* Keep the compact state for this session. */ }
    setMinimized(true); onExpandedChange(false);
  }
  function restoreSetup() {
    try { localStorage.setItem(minimizeKey, 'false'); } catch { /* Keep the expanded state for this session. */ }
    setMinimized(false); onExpandedChange(true);
  }
  async function demoWorkspace() {
    setBusy(true); setError('');
    try { await openDemoWorkspace(); window.location.reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not open the demo.'); setBusy(false); }
  }
  return <section className={'atlas-setup' + (expanded ? ' is-expanded' : '') + (minimized && !expanded ? ' is-minimized' : '')} aria-label="Workspace setup">
    {!expanded && minimized ? <div className="atlas-setup-minimized">
      <button type="button" className="atlas-setup-collapsed" data-testid="setup-open"
        aria-controls="atlas-setup-steps" aria-expanded="false" onClick={restoreSetup}>
        <Compass size={16}/><span>Setup</span><strong>{complete}/3</strong>
        <span className="atlas-setup-collapsed-hint">{complete === 3 ? 'Ready' : 'Continue setup'}</span>
        <ChevronDown size={15}/>
      </button>
      <button type="button" className="atlas-setup-collapsed-dismiss" aria-label="Dismiss setup reminder" onClick={dismiss}>
        <X size={15}/>
      </button>
    </div> : <>
      <div className="atlas-setup-summary">
        <Compass size={21}/><div><strong>{complete === 3 ? 'Your workspace is ready' : 'Make Atlas yours'}</strong><span>{complete} of 3 setup steps complete</span></div>
        <button className="op-btn" aria-expanded={expanded} aria-controls="atlas-setup-steps" onClick={() => onExpandedChange(!expanded)}>{expanded ? 'Collapse' : 'Set up workspace'} <ArrowRight size={15}/></button>
        {!expanded && <button type="button" className="op-icon-button atlas-setup-minimize" aria-label="Minimize setup reminder" title="Minimize setup reminder" onClick={minimize}><Minus size={16}/></button>}
        {!expanded && <button className="op-icon-button" aria-label="Dismiss setup reminder" onClick={dismiss}><X size={17}/></button>}
      </div>
      {expanded && <div id="atlas-setup-steps" className="atlas-setup-body">
        <p>A short setup connects your people, territories and visits. You can leave and resume at any time.</p>
        <p className="atlas-setup-reference-note">Airport dots are public location references. These steps create your own saved managers, territories and visits.</p>
        <ol>{steps.map((step, index) => <li key={step.title} aria-current={index === next ? 'step' : undefined}>
          <span className={'atlas-step-number' + (step.done ? ' complete' : '')}>{step.done ? <Check size={17}/> : index + 1}</span>
          <div><strong>{step.title}</strong><p>{step.detail}</p>
            <button className="op-btn" disabled={index > 0 && !ctx.board.managers?.length}
              onClick={() => { onExpandedChange(false); step.action(); }}>{step.done ? 'Review' : step.label} <ArrowRight size={14}/></button>
            {index === 0 && <button className="op-btn" onClick={() => { ctx.go('data'); onExpandedChange(false); }}>Import manager CSV</button>}
          </div>
        </li>)}</ol>
        <div className="atlas-setup-optional">
          <span>Optional</span>
          <button type="button" className="atlas-quiet-action" onClick={() => { ctx.openTrainers(); onExpandedChange(false); }}>Set trainer profiles</button>
        </div>
        <div className="atlas-setup-demo"><div><strong>Want to explore first?</strong><p>Open a separate workspace with clearly labeled sample data.</p></div><button className="op-btn" disabled={busy} onClick={demoWorkspace}>{busy ? 'Opening demo…' : 'Explore a demo'}</button></div>
        {error && <p role="alert" className="op-error"><CircleAlert size={16}/>{error}</p>}
        <button className="atlas-quiet-action" onClick={dismiss}>Continue on my own</button>
      </div>}
    </>}
  </section>;
}
