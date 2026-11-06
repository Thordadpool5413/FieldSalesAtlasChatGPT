import { CheckCircle2,CircleAlert,FileJson,ShieldCheck,UploadCloud,X } from 'lucide-react';
import { useRef,useState } from 'react';
import { api } from './workspaceApi';
type BackupRecords=Record<string,Array<Record<string,unknown>>>;
type WorkspaceBackup={
 format:string;schemaVersion:number;exportedAt:string;
 counts:Record<string,number>;records:BackupRecords;
};
type Summary = {
  fileName:string; exportedAt:string; total:number;
  counts:Array<{name:string;value:number}>;
  errors:string[];warnings:string[];
};
const categories=[
  'managers','assignments','visits','coaching','trips',
  'travelPlans','travelPrefs','activity','directory','trainerProfiles','availability',
] as const;
type Category=typeof categories[number];
const display:Record<Category,string>={
  managers:'Territory managers',assignments:'Territory assignments',visits:'Coaching visits',
  coaching:'Coaching records',trips:'Saved trips',travelPlans:'Travel plans',
  travelPrefs:'Travel preferences',activity:'Activity history',
  directory:'Imported directory',trainerProfiles:'Trainer profiles',availability:'Shared trainer availability'
};
function reviewFile(value:unknown,fileName:string):Summary{
  const backup=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const records=backup.records&&typeof backup.records==='object'&&!Array.isArray(backup.records)
    ?backup.records as Record<string,unknown>:{};
  const declared=backup.counts&&typeof backup.counts==='object'&&!Array.isArray(backup.counts)
    ?backup.counts as Record<string,unknown>:{};
  const errors:string[]=[],warnings:string[]=[];
  if(backup.format!=='field-sales-atlas-operations-backup')
    errors.push('This is not a Field Sales Atlas workspace backup.');
  if(backup.schemaVersion!==1&&backup.schemaVersion!==2)
    errors.push('Unknown backup schema. This inspection supports versions 1 and 2.');
  if(!backup.records||!Object.keys(records).length)
    errors.push('The backup contains no readable record collections.');
  const counts=categories.map(name=>{
    const items=records[name];
    if(!Array.isArray(items)){
      if(name==='availability'&&backup.schemaVersion===1){
        warnings.push('Legacy version 1 backup predates shared trainer time blocks. Those cannot be reconstructed from this file.');
        return {name,value:0};
      }
      errors.push('Missing or malformed '+display[name]+' collection.');
      return {name,value:0};
    }
    const seen=new Set<string>();
    let duplicate=0,invalid=0;
    for(const item of items){
      if(!item||typeof item!=='object'||Array.isArray(item)){invalid++;continue;}
      const id=(item as Record<string,unknown>).id;
      if(typeof id!=='string'||!id.trim())invalid++;
      else if(seen.has(id))duplicate++;
      else seen.add(id);
    }
    if(invalid)errors.push(display[name]+': '+invalid+' record(s) without a valid identifier.');
    if(duplicate)errors.push(display[name]+': '+duplicate+' duplicate identifier(s).');
    if(typeof declared[name]==='number'&&declared[name]!==items.length)
      warnings.push(display[name]+': declared count differs from actual records.');
    return {name,value:items.length};
  });
  const managerIds=new Set(
    Array.isArray(records.managers)?records.managers.map(m=>{
      if(m&&typeof m==='object'&&!Array.isArray(m))return (m as Record<string,unknown>).id;
      return null;
    }).filter((id):id is string=>typeof id==='string'):[]
  );
  for(const category of ['assignments','visits','coaching'] as const){
    const items=Array.isArray(records[category])?records[category] as unknown[]:[];
    const missing=items.filter(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return false;
      const managerId=(item as Record<string,unknown>).managerId;
      return typeof managerId!=='string'||!managerIds.has(managerId);
    }).length;
    if(missing)errors.push(display[category]+': '+missing+' reference(s) to managers not present in this backup. Resolve references before restoring.');
  }
  if(Array.isArray(records.directory)&&records.directory.length>1)
    warnings.push('Editor directory entries are retained as archived history, not granted access. Create new trainer links after recovery.');
  if(Array.isArray(records.travelPrefs)&&records.travelPrefs.length>3)
    warnings.push('Legacy editor-specific travel preferences are archived rather than reassigned to an active trainer.');
  const slots=Array.isArray(records.trainerProfiles)?records.trainerProfiles:[];
  if(!slots.some(profile=>profile&&typeof profile==='object'&&!Array.isArray(profile)
    &&(profile as Record<string,unknown>).id==='trainer_a'))errors.push('Trainer 1 profile is missing.');
  if(!slots.some(profile=>profile&&typeof profile==='object'&&!Array.isArray(profile)
    &&(profile as Record<string,unknown>).id==='trainer_b'))errors.push('Trainer 2 profile is missing.');
  const exportedAt=typeof backup.exportedAt==='string'&&!Number.isNaN(Date.parse(backup.exportedAt))
    ?backup.exportedAt:'Unknown';
  if(exportedAt==='Unknown')warnings.push('The backup has no recognized export timestamp.');
  return {fileName,exportedAt,counts,total:counts.reduce((sum,item)=>sum+item.value,0),errors,warnings};
}
export default function BackupReview(){
  const [summary,setSummary]=useState<Summary|null>(null);
  const [loading,setLoading]=useState(false);
  const [backup,setBackup]=useState<WorkspaceBackup|null>(null);
  const [restoring,setRestoring]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0,stage:''});
  const [restoreError,setRestoreError]=useState('');
  const [restoredLink,setRestoredLink]=useState('');
  const busy=useRef(false);
  async function inspect(file:File|undefined){
    setSummary(null);setBackup(null);setRestoredLink('');setRestoreError('');if(!file)return;
    setLoading(true);
    try{
      if(!file.name.toLowerCase().endsWith('.json'))throw Error('Choose the JSON file exported by Field Sales Atlas.');
      if(file.size>25_000_000)throw Error('This file exceeds the 25 MB local recovery limit. Export or recover smaller datasets with an administrator.');
      const content=JSON.parse(await file.text()) as unknown;
      const summary=reviewFile(content,file.name);
      const data=content as WorkspaceBackup;
      if(summary.counts.some(c=>c.name==='trainerProfiles'&&c.value!==2))
        summary.errors.push('Both trainer profiles are required to restore a shared workspace.');
      if(summary.total>8000)summary.errors.push('This recovery supports at most 8,000 records.');
      setSummary(summary);
      if(!summary.errors.length)setBackup(data);
    }catch(e){
      setSummary({fileName:file.name,exportedAt:'Unknown',total:0,counts:[],
        errors:[e instanceof Error?e.message:'The backup could not be read.'],warnings:[]});
    }finally{setLoading(false);}
  }
  async function restoreSeparate(){
    if(busy.current||!backup)return;
    const answer=window.prompt(
      'This creates a NEW, separate workspace from your backup. Nothing in the current workspace will be overwritten. Type RESTORE to confirm.'
    );
    if(answer!=='RESTORE')return;
    busy.current=true;setRestoring(true);setRestoreError('');setRestoredLink('');
    const sessionId=crypto.randomUUID();
    try{
      const digest=await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify(backup)));
      const sourceHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      const counts=Object.fromEntries(categories.map(c=>[c,backup.records[c]?.length||0]));
      const total=Object.values(counts).reduce((a,b)=>a+b,0);
      setProgress({done:0,total,stage:'Preparing a separate workspace'});
      const init=await api.post('/api/backup/restore/start',{
        sessionId,sourceHash,counts,format:backup.format,schemaVersion:backup.schemaVersion
      });
      if(init.data?.status==='finalized'&&init.data?.workspaceKey){
        setRestoredLink(window.location.origin+window.location.pathname+'#workspace='+init.data.workspaceKey);
        return;
      }
      let completed=0;
      for(const category of categories){
        const rows=backup.records[category]||[];
        let index=0,at=0;
        while(at<rows.length){
          const chunk:Array<Record<string,unknown>>=[];
          let bytes=0;
          while(at<rows.length&&chunk.length<25){
            const item=rows[at],length=new TextEncoder().encode(JSON.stringify(item)).length;
            if(length>180000)throw Error('One record in '+display[category]+' exceeds the safe restoration limit.');
            if(chunk.length&&bytes+length>460000)break;
            chunk.push(item);bytes+=length;at++;
          }
          setProgress({done:completed,total,stage:'Restoring '+display[category]});
          await api.post('/api/backup/restore/chunk',{sessionId,category,index,records:chunk});
          completed+=chunk.length;index++;
          setProgress({done:completed,total,stage:'Restoring '+display[category]});
        }
      }
      setProgress({done:total,total,stage:'Verifying and publishing the restored workspace'});
      const response=await api.post('/api/backup/restore/finish',{sessionId});
      const key=String(response.data?.workspaceKey||'');
      if(!/^[0-9a-f]{64}$/i.test(key))throw Error('Restored workspace access link was not confirmed.');
      setRestoredLink(window.location.origin+window.location.pathname+'#workspace='+key);
    }catch(e){
      setRestoreError((e instanceof Error?e.message:'The recovery could not be completed.')+
        ' Your existing workspace is unchanged. An unfinished staging workspace remains inaccessible.');
    }finally{busy.current=false;setRestoring(false);}
  }
  return <div className='atlas-backup-review' aria-label='Inspect a saved workspace backup locally'>
    <div className='atlas-backup-review-head'>
      <span className='atlas-backup-review-icon'><ShieldCheck size={20}/></span>
      <div><h3>Check a backup before you need it.</h3>
        <p>Inspect a downloaded Field Sales Atlas backup on your device. No file is uploaded, imported or used to overwrite existing records.</p>
      </div>
    </div>
    <label className='atlas-backup-drop'>
      <UploadCloud size={23}/><span>{loading?'Inspecting locally…':'Select a downloaded backup JSON'}</span>
      <input type='file' accept='.json,application/json' disabled={loading}
        onChange={event=>{void inspect(event.target.files?.[0]);event.target.value='';}}/>
    </label>
    {summary&&<div className='atlas-backup-summary' role='status' aria-live='polite'>
      <div className='atlas-backup-title'>
        {summary.errors.length?<CircleAlert size={20}/>:<CheckCircle2 size={20}/>}
        <div><strong>{summary.errors.length?'Backup needs review':'Backup structure is readable'}</strong>
          <small>{summary.fileName} · {summary.total} records · Exported {summary.exportedAt==='Unknown'?'at unknown time':new Date(summary.exportedAt).toLocaleDateString()}</small>
        </div>
        <button type='button' aria-label='Clear backup inspection' onClick={()=>setSummary(null)}><X size={17}/></button>
      </div>
      {summary.counts.length>0&&<div className='atlas-backup-counts'>
        {summary.counts.map(item=><div key={item.name}><span>{display[item.name as Category]}</span><strong>{item.value}</strong></div>)}
      </div>}
      {summary.errors.length>0&&<div className='atlas-backup-errors'>{summary.errors.map((msg,i)=><p key={i}>{msg}</p>)}</div>}
      {summary.warnings.length>0&&<div className='atlas-backup-warnings'>{summary.warnings.map((msg,i)=><p key={i}>{msg}</p>)}</div>}
      {!summary.errors.length&&<p className='atlas-backup-readonly'>Backup structure inspected. Restoring creates a separate workspace and keeps the current records unchanged.</p>}
    </div>}
    {backup&&summary&&!summary.errors.length&&<div className='atlas-restore-actions'>
      <button type='button' className='op-btn primary' onClick={()=>void restoreSeparate()}
        disabled={restoring}>{restoring?'Restoring backup…':'Restore into a separate workspace'}</button>
      <p>Only your explicit confirmation begins uploading the backup to the Field Sales Atlas backend. Your current workspace will not be overwritten. Incomplete recovery batches cannot be opened or shared.</p>
    </div>}
    {restoring&&<div className='atlas-restore-progress' role='status' aria-live='polite'>
      <strong>{progress.stage}</strong><span>{progress.done} of {progress.total} records</span>
      <progress max={Math.max(1,progress.total)} value={progress.done}/>
    </div>}
    {restoreError&&<div className='atlas-backup-errors' role='alert'><p>{restoreError}</p></div>}
    {restoredLink&&<div className='atlas-restore-success' role='status'>
      <CheckCircle2 size={23}/><div><strong>Separate workspace restored.</strong>
        <p>The original workspace is intact. Save the new link in a secure location and open it in another tab.</p>
        <input aria-label='New restored workspace link' readOnly value={restoredLink}
          onFocus={e=>e.target.select()}/>
        <a className='op-btn primary' href={restoredLink} target='_blank' rel='noopener noreferrer'>Open restored workspace</a>
      </div>
    </div>}
    <p className='atlas-backup-caveat'><FileJson size={17}/> Backup inspections happen locally. Restoration transfers records only after your confirmation, creates a new protected shared workspace, and never overwrites the existing one. The restored link grants editing access.</p>
  </div>;
}
