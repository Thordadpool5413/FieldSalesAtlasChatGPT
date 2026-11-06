
import { Activity,AlertTriangle,ArrowDownToLine,CheckCircle2,ClipboardCopy,ExternalLink,KeyRound,Link2,Plus,RefreshCw,ShieldCheck,Trash2,Users } from 'lucide-react';
import { useEffect,useState } from 'react';
import BackupReview from './BackupReview';
import { useOp } from './Operations';
import { dateLabel } from './opsModels';
import { api,createNewWorkspace,getShareUrl,joinWorkspaceLink } from './workspaceApi';

type Readiness={icons:'checking'|'ready'|'warning';worker:'checking'|'ready'|'warning';manifest:'checking'|'ready'|'warning';details:string[]};
type TrainerLink={id:string;seat:'trainer_a'|'trainer_b';status:'active'|'revoked';createdAt:string};
export default function SharedWorkspacePage(){
  const ctx=useOp();
  const [copied,setCopied]=useState(false);
  const [busy,setBusy]=useState(false);
  const [backupBusy,setBackupBusy]=useState(false);
  const [joinBusy,setJoinBusy]=useState(false);
  const [joinValue,setJoinValue]=useState('');
  const [trainerLinks,setTrainerLinks]=useState<TrainerLink[]>([]);
  const [linkBusy,setLinkBusy]=useState(false);
  const [linkError,setLinkError]=useState('');
  const [newLink,setNewLink]=useState('');
  const [inviteSeat,setInviteSeat]=useState<'trainer_a'|'trainer_b'>('trainer_b');
  const [readiness,setReadiness]=useState<Readiness>({icons:'checking',worker:'checking',manifest:'checking',details:[]});
  const link=getShareUrl();
  async function copy(){
    if(!link){ctx.setError('The workspace link is not available yet.');return;}
    try{await navigator.clipboard.writeText(link);setCopied(true);ctx.setNotice('Private workspace link copied.');}
    catch{ctx.setNotice('Select and copy your workspace link from the field.');}
  }
  async function separate(){
    if(!confirm('Create a new empty workspace? Existing shared data and the previous link will continue to exist.'))return;
    setBusy(true);
    try{await createNewWorkspace();window.location.reload();}
    catch(e){ctx.setError(e instanceof Error?e.message:'Unable to create separate workspace.');setBusy(false);}
  }
  async function join(){
    if(!joinValue.trim())return;
    if(!confirm('Switch this device to the shared workspace in the pasted link? Your current workspace remains available through its existing URL.'))return;
    setJoinBusy(true);
    try{await joinWorkspaceLink(joinValue);window.location.reload();}
    catch(e){ctx.setError(e instanceof Error?e.message:'Could not open that workspace.');setJoinBusy(false);}
  }
  async function downloadBackup(){
    if(!confirm('Download all shared workspace data, including manager contacts and travel records? Store the file securely.'))return;
    setBackupBusy(true);
    try{
      const response=await api.get('/api/backup/export');
      const snapshot=response.data;
      if(snapshot.format!=='field-sales-atlas-operations-backup'||!snapshot.records)
        throw Error('Backup format could not be verified.');
      const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
      const objectURL=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=objectURL;
      a.download='field-atlas-backup-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(objectURL),30000);
      ctx.setNotice('Workspace backup exported. Keep the file in a secure approved location. Restoring a backup requires a controlled process.');
    }catch(e){ctx.setError(e instanceof Error?e.message:'Could not generate a complete backup.');}
    finally{setBackupBusy(false);}
  }
  async function refreshLinks(){
    if(ctx.board.team?.role!=='owner')return;
    try{
      const result=await api.get('/api/workspace/trainer-links');
      setTrainerLinks((result.data?.links||[]) as TrainerLink[]);
    }catch(e){setLinkError(e instanceof Error?e.message:'Trainer access list is unavailable.');}
  }
  useEffect(()=>{if(ctx.board.team?.role==='owner')void refreshLinks();},[ctx.board.team?.role]);
  async function issueTrainerLink(){
    setLinkBusy(true);setLinkError('');setNewLink('');
    try{
      const result=await api.post('/api/workspace/trainer-links',{seat:inviteSeat});
      const key=String(result.data?.workspaceKey||'');
      if(!/^[0-9a-f]{64}$/i.test(key))throw Error('Invitation secret was not confirmed.');
      setNewLink(location.origin+location.pathname+'#workspace='+key);
      await refreshLinks();
    }catch(e){setLinkError(e instanceof Error?e.message:'Could not create trainer link.');}
    finally{setLinkBusy(false);}
  }
  async function revokeTrainerLink(link:TrainerLink){
    if(!confirm('Immediately revoke this trainer link? Existing trainer sessions will lose access at their next request.'))return;
    setLinkBusy(true);setLinkError('');
    try{
      await api.delete('/api/workspace/trainer-links/'+link.id);
      setNewLink('');
      await refreshLinks();
      ctx.setNotice('Individual trainer link revoked. The original owner URL remains active.');
    }catch(e){setLinkError(e instanceof Error?e.message:'Could not revoke trainer link.');}
    finally{setLinkBusy(false);}
  }
  async function checkRelease(){
    setReadiness({icons:'checking',worker:'checking',manifest:'checking',details:[]});
    const details:string[]=[];
    let icons:Readiness['icons']='warning';
    let worker:Readiness['worker']='warning';
    let manifest:Readiness['manifest']='warning';
    const iconsToCheck=[['/resources/favicon.png',32],['/resources/apple-touch-icon.png',180],['/resources/app-icon.png',512]] as const;
    const iconResults=await Promise.all(iconsToCheck.map(([path,minSize])=>
      new Promise<boolean>(resolve=>{
        const img=new Image();
        let finished=false;
        const finish=(ok:boolean)=>{
          if(finished)return;
          finished=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(ok);
        };
        const timer=setTimeout(()=>finish(false),8000);
        img.onload=()=>finish(img.naturalWidth>=minSize&&img.naturalHeight>=minSize&&img.naturalWidth===img.naturalHeight);
        img.onerror=()=>finish(false);
        img.src=path+'?release_check=1';
      })
    ));
    icons=iconResults.every(Boolean)?'ready':'warning';
    if(icons!=='ready')details.push('One or more brand icons are unavailable or below expected dimensions on this device.');
    try{
      const res=await fetch(window.location.origin+'/manifest.webmanifest',{cache:'no-store'});
      const payload=await res.json() as {name?:string;icons?:Array<{src:string}>};
      manifest=res.ok&&payload.name==='Field Sales Atlas'&&Array.isArray(payload.icons)&&payload.icons.length>=2?'ready':'warning';
    }catch{details.push('Web app manifest could not be read in this browser.');}
    if(manifest!=='ready')details.push('Installation manifest is not verified.');
    if('serviceWorker' in navigator){
      try{
        const registration=await navigator.serviceWorker.getRegistration();
        worker=registration?.active?'ready':'warning';
      }catch{details.push('The service worker could not be checked in this browser.');}
    }else details.push('This browser does not support service workers.');
    if(worker!=='ready')details.push('Offline application shell is not yet active. Reload after installation if needed.');
    setReadiness({icons,manifest,worker,details});
  }
  useEffect(()=>{void checkRelease();},[]);
  const checks=[{label:'Brand icons',status:readiness.icons},{label:'Install manifest',status:readiness.manifest},{label:'Offline app shell',status:readiness.worker}];
  return <>
    <div className="op-head atlas-editorial-head">
      <div><p className="op-eyebrow"><span className="atlas-beacon" aria-hidden="true"/>SHARED WORKSPACE</p><h1>Sharing & recovery</h1>
        <p className="op-subtitle">Keep both trainers in the same field travel and coaching workspace, with no sign-in.</p></div>
      <div className="op-head-actions"><button className="op-btn primary" disabled={!link} onClick={copy}>
        <ClipboardCopy size={16}/>{copied?'Copied':'Copy shared link'}
      </button></div>
    </div>
    <div className="atlas-share-layout">
      <section className="op-card atlas-share-card">
        <div className="op-card-header"><div><h2>Share your workspace</h2>
          <p>Use the same private link on both trainers’ devices.</p></div><Link2 size={20}/></div>
        <div className="atlas-share-body">
          <label className="atlas-share-label" htmlFor="workspace-url">Your workspace URL</label>
          <div className="atlas-share-input-row">
            <input id="workspace-url" readOnly value={link||'Opening workspace…'} onFocus={e=>e.currentTarget.select()}/>
            <button className="op-btn" onClick={copy} disabled={!link}><ClipboardCopy size={15}/> Copy</button>
          </div>
          <p className="atlas-share-description">Keep this link in an approved company messaging app or password manager. Reopen it to reconnect a new device, including an installed home-screen app.</p>
          <div className="atlas-share-warning"><AlertTriangle size={18}/><span>
            <strong>This link grants editing access.</strong> Anyone who has it can view, change or delete the shared records. Do not enter PHI, sensitive employee details or confidential company information.
          </span></div>
          <div className="atlas-share-join">
            <h3>Reconnect another device</h3><p>Lost your installed app’s workspace? Paste the original shared link here instead of starting over.</p>
            <div className="atlas-share-input-row">
              <input aria-label="Existing Field Sales Atlas workspace link" value={joinValue} onChange={e=>setJoinValue(e.target.value)}
                placeholder="Paste an existing Field Sales Atlas link" autoCapitalize="off" spellCheck={false}/>
              <button className="op-btn" disabled={joinBusy||!joinValue.trim()} onClick={join}>{joinBusy?'Checking…':'Open'}</button>
            </div>
          </div>
          <button className="op-btn soft" onClick={separate} disabled={busy}><Plus size={15}/>{busy?'Creating…':'Create a separate empty workspace'}</button>
          <p className="atlas-share-description">A new workspace does not revoke the old link. Reconnect using the original URL when needed.</p>
        </div>
      </section>
      {ctx.board.team?.role==='owner'&&<section className='op-card atlas-share-card atlas-trainer-access'>
        <div className='op-card-header'><div><h2>Individual trainer links</h2>
          <p>Issue and revoke separate no-login editor links. Keep the original owner URL private.</p>
        </div><KeyRound size={20}/></div>
        <div className='atlas-share-body'>
          <label className='atlas-share-label' htmlFor='trainer-seat'>Create a link for</label>
          <div className='atlas-trainer-invite-controls'>
            <select id='trainer-seat' value={inviteSeat}
              onChange={e=>setInviteSeat(e.target.value==='trainer_b'?'trainer_b':'trainer_a')}>
              <option value='trainer_a'>Trainer 1</option><option value='trainer_b'>Trainer 2</option>
            </select>
            <button type='button' className='op-btn primary' onClick={()=>void issueTrainerLink()}
              disabled={linkBusy}><Plus size={15}/>{linkBusy?'Updating…':'Generate private link'}</button>
          </div>
          {newLink&&<div className='atlas-trainer-new-link' role='status'>
            <strong>Copy now. This secret is displayed only once.</strong>
            <div className='atlas-share-input-row'>
              <input readOnly value={newLink} aria-label='New trainer editing link' onFocus={e=>e.currentTarget.select()}/>
              <button className='op-btn' type='button' onClick={()=>void navigator.clipboard.writeText(newLink).then(()=>ctx.setNotice('Trainer link copied.'),()=>ctx.setNotice('Select the link to copy manually.'))}>
                <ClipboardCopy size={15}/> Copy
              </button>
            </div>
          </div>}
          {linkError&&<div className='op-alert warn' role='alert'>{linkError}</div>}
          <div className='atlas-trainer-links'>
            {trainerLinks.filter(x=>x.status==='active').map(x=><div key={x.id} className='atlas-trainer-link-row'>
              <div><strong>{x.seat==='trainer_a'?'Trainer 1':'Trainer 2'}</strong>
                <small>Created {new Date(x.createdAt).toLocaleDateString()} · Active</small></div>
              <button className='op-btn tiny' type='button' disabled={linkBusy}
                onClick={()=>void revokeTrainerLink(x)}><Trash2 size={15}/> Revoke</button>
            </div>)}
            {!trainerLinks.some(x=>x.status==='active')&&
              <p className='atlas-share-description'>No individual trainer links yet. Existing shared access remains unchanged.</p>}
          </div>
          <p className='atlas-share-description'>These links identify the access key, not the person holding it. Treat them as passwords. Anyone with the owner URL still has full editing access. Never enter PHI or confidential personnel records.</p>
        </div>
      </section>}
      {ctx.board.accessSeat&&<section className='op-card atlas-share-card'>
        <div className='op-card-header'><div><h2>Your trainer link</h2>
          <p>Assigned to {ctx.board.accessSeat==='trainer_a'?'Trainer 1':'Trainer 2'}. The owner can revoke this link.</p>
        </div><KeyRound size={20}/></div>
        <div className='atlas-share-body'><p className='atlas-share-description'>
          This shared-link identifier does not establish verified human identity. Both trainers' calendars remain visible.
        </p></div>
      </section>}
      <section className="op-card atlas-share-card">
        <div className="op-card-header"><div><h2>Activity and accountability</h2><p>Shared changes are logged; no-login links do not identify which trainer made them.</p></div><Activity size={20}/></div>
        <div className="atlas-share-body atlas-share-activity">
          {(ctx.board.activity||[]).length?(ctx.board.activity||[]).slice().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,15).map(item=>
            <div className="op-activity-item" key={item.id}>
              <div className="op-list-icon"><Activity size={15}/></div>
              <div><strong>{item.action} · {item.entity}</strong><span>{item.summary}</span><span>{dateLabel(item.at)}</span></div>
            </div>
          ):<div className="op-empty"><Users size={25}/><strong>Nothing logged yet</strong><span>Shared edits and itinerary activity will appear here.</span></div>}
        </div>
      </section>
      <section className="op-card atlas-share-card atlas-recovery-card">
        <div className="op-card-header"><div><h2>Release readiness & recovery</h2>
          <p>Check installation assets and download a protected copy of the workspace.</p></div><ShieldCheck size={20}/></div>
        <div className="atlas-share-body">
          <div className="atlas-release-grid">
            {checks.map(item=><div key={item.label} className={'atlas-release-check status-'+item.status}>
              {item.status==='ready'?<CheckCircle2 size={18}/>:item.status==='checking'?<RefreshCw size={18}/>:<AlertTriangle size={18}/>}
              <span><strong>{item.label}</strong><small>{item.status==='ready'?'Available on this device':item.status==='checking'?'Checking…':'Needs verification'}</small></span>
            </div>)}
          </div>
          {readiness.details.length>0&&<div className="atlas-release-notes">{readiness.details.map(item=><p key={item}>{item}</p>)}</div>}
          <div className="atlas-release-actions">
            <button className="op-btn" onClick={()=>void checkRelease()}><RefreshCw size={15}/> Recheck installation</button>
            <button className="op-btn primary" onClick={downloadBackup} disabled={backupBusy||ctx.identity!=='member'}>
              <ArrowDownToLine size={16}/>{backupBusy?'Exporting…':'Download full backup'}
            </button>
          </div>
          <BackupReview/>
          <p className="atlas-share-description">Backups contain manager contacts and travel records, not the original workspace link or flight-provider secrets. The restore tool creates a separate linked workspace, never overwrites this one, and requires explicit confirmation.</p>
          <p className="atlas-share-description">Offline mode keeps only a basic application notice and static assets. Manager and itinerary records are not cached offline. <a href="https://nasstatus.faa.gov/" target="_blank" rel="noreferrer">FAA status <ExternalLink size={11}/></a> must be checked online.</p>
        </div>
      </section>
    </div>
  </>;
}
