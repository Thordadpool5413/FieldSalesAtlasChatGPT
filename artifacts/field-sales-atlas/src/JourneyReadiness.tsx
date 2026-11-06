import type { ReadinessReport } from '../shared/travel/readiness';
import './JourneyReadiness.css';

export default function JourneyReadiness({ report, title = 'Know your remaining margin.' }: { report: ReadinessReport; title?: string }) {
  return <section className="journey-readiness" aria-label="Journey readiness and remaining margin">
    <div className="readiness-heading"><div><span>JOURNEY READINESS</span><h2>{title}</h2></div><strong className={'readiness-verdict state-' + report.verdict}>{report.verdict.replaceAll('-', ' ')}</strong></div>
    <p className="readiness-intro">Calculated from supplied flight fields, reviewed allowances and saved commitments. No airline reservation lookup or live-status confirmation.</p>
    <div className="readiness-trainers">{report.trainers.map(trainer => <article key={trainer.trainerId}>
      <h3>{trainer.name}</h3><strong className="readiness-margin">{trainer.minimumMarginMinutes === null ? 'Unknown' : trainer.minimumMarginMinutes + ' min'}</strong>
      <p>{trainer.limitingStep ? 'Smallest measured margin · ' + trainer.limitingStep : 'Add connection requirements or attach flights to a saved journey to calculate appointment margins.'}</p>
      <small>{trainer.unknownCount} unresolved checks or checkpoints</small>
      <div className="readiness-tests" aria-label={trainer.name + ' delay tests'}>{trainer.tests.map(test => <div key={test.delayMinutes} className={'test-' + test.state}>
        <strong>+{test.delayMinutes} min</strong><span>{test.state === 'exceeds-margin' ? 'Exceeds margin' : test.state === 'needs-information' ? 'Needs information' : 'Within known margins'}</span>
        {test.affected.length > 0 && <small>{test.affected.join(', ')}</small>}
      </div>)}</div>
    </article>)}</div>
    {!!report.constraints.length && <details className="readiness-details"><summary>Checkpoints and latest action times</summary>
      {report.constraints.map(step => <article key={step.id}><div><strong>{step.label}</strong><span>{step.marginMinutes === null ? 'Margin unknown' : step.marginMinutes + ' min'}</span></div><p>{step.basis}</p>
        {step.latestActionAt && <small>{step.latestActionLabel || 'Latest start for this step'}: {new Date(step.latestActionAt).toLocaleString(undefined, step.timeZone ? {timeZone:step.timeZone} : undefined)} ({step.timeZone || 'your device time'})</small>}
        {step.missing.map(item => <p className="readiness-missing" key={item}>{item}</p>)}
      </article>)}
    </details>}
    <details className="readiness-details"><summary>Booking checks, resources and evidence limits</summary>
      {report.checks.map(check => <article key={check.id}><div><strong>{check.label}</strong><span>{check.state === 'reported' ? 'Traveler-reported' : check.state}</span></div><p>{check.detail}</p>
        {check.checkedAt && <small>Reported check: {new Date(check.checkedAt).toLocaleString()}</small>}
      </article>)}
    </details>
    <details className="readiness-details"><summary>How to read these delay tests</summary>{report.assumptions.map(item => <p key={item}>{item}</p>)}<p>Calculated {new Date(report.createdAt).toLocaleString()}. Recalculate after changes.</p></details>
  </section>;
}
