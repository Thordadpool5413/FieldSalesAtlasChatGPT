import { ArrowRight, Check, CircleAlert, Compass, X } from 'lucide-react';
import { useState } from 'react';
import { useOp } from './Operations';
import { canReturnFromDemo, openDemoWorkspace, returnFromDemo } from './workspaceApi';

export default function WorkspaceSetup({ expanded, onExpandedChange }: { expanded: boolean; onExpandedChange: (value: boolean) => void }) {
  const ctx = useOp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const workspaceId = ctx.board.team?.id || '';
  const dismissalKey = 'atlas-setup-dismissed-v1:' + workspaceId;
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
    { title: 'Set up your trainers', detail: 'Name both trainers and choose their home airports.', done: ctx.trainerProfiles.every(profile => profile.homeAirports.length > 0), action: () => ctx.openTrainers(), label: 'Set trainer profiles' },
    { title: 'Bring in your people', detail: 'Add your first manager or import your existing roster.', done: !!ctx.board.managers?.length, action: () => ctx.open('manager'), label: 'Add first manager' },
    { title: 'Connect a territory', detail: 'Assign a state, county, city or ZIP area to a manager.', done: !!ctx.board.assignments?.length, action: () => ctx.open('assignment'), label: 'Assign a territory' },
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
  async function demoWorkspace() {
    setBusy(true); setError('');
    try { await openDemoWorkspace(); window.location.reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not open the demo.'); setBusy(false); }
  }
  return <section className={'atlas-setup' + (expanded ? ' is-expanded' : '')} aria-label="Workspace setup">
    <div className="atlas-setup-summary">
      <Compass size={21}/><div><strong>{complete === 3 ? 'Your workspace is ready' : 'Make Atlas yours'}</strong><span>{complete} of 3 setup steps complete</span></div>
      <button className="op-btn" aria-expanded={expanded} aria-controls="atlas-setup-steps" onClick={() => onExpandedChange(!expanded)}>{expanded ? 'Collapse' : 'Set up workspace'} <ArrowRight size={15}/></button>
      {!expanded && <button className="op-icon-button" aria-label="Dismiss setup reminder" onClick={dismiss}><X size={17}/></button>}
    </div>
    {expanded && <div id="atlas-setup-steps" className="atlas-setup-body">
      <p>A short setup connects your people, territories and travel. You can leave and resume at any time.</p>
      <ol>{steps.map((step, index) => <li key={step.title} aria-current={index === next ? 'step' : undefined}>
        <span className={'atlas-step-number' + (step.done ? ' complete' : '')}>{step.done ? <Check size={17}/> : index + 1}</span>
        <div><strong>{step.title}</strong><p>{step.detail}</p>
          <button className="op-btn" disabled={index === 2 && !ctx.board.managers?.length} onClick={step.action}>{step.done ? 'Review' : step.label} <ArrowRight size={14}/></button>
          {index === 1 && <button className="op-btn" onClick={() => { ctx.go('data'); onExpandedChange(false); }}>Import manager CSV</button>}
        </div>
      </li>)}</ol>
      <div className="atlas-setup-demo"><div><strong>Want to explore first?</strong><p>Open a separate workspace with clearly labeled sample data.</p></div><button className="op-btn" disabled={busy} onClick={demoWorkspace}>{busy ? 'Opening demo…' : 'Explore a demo'}</button></div>
      {error && <p role="alert" className="op-error"><CircleAlert size={16}/>{error}</p>}
      <button className="atlas-quiet-action" onClick={dismiss}>Continue on my own</button>
    </div>}
  </section>;
}
