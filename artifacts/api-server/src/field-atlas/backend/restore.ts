/* Field Sales Atlas backup restore.
   A restore always creates a SEPARATE workspace. Never write into the current one.
   Staging data stays inaccessible until every expected batch is accounted for.
   The final workspace/link/receipt are published in a single DB transaction.
*/
import { db, json, error, isAppDatabaseError } from './runtime/sdk';
import type { RouterMiddleware, RouterRoutes } from './runtime/sdk';
import { createHash, randomUUID } from 'node:crypto';

const categories = ['managers','assignments','visits','coaching','trips',
 'travelPlans','travelPrefs','activity','directory','trainerProfiles','availability'] as const;
type Category=typeof categories[number];
type Counts=Record<Category,number>;
type Member={id:string;workspaceId:string;role:'owner'|'member'};
type Session={id:string;sourceWorkspaceId:string;sourceActorId:string;
 newWorkspaceId:string;newActorId:string;sourceHash:string;
 expected:Counts;createdAt:string;expiresAt:string;status:'staging'|'finalized';
 workspaceKey?:string;completedAt?:string};
type Receipt={id:string;sessionId:string;category:Category;index:number;count:number;hash:string;at:string};
type Tables={managers:string;assignments:string;visits:string};
type ExtraTables={coaching:string;trips:string;activity:string;directory:string;
 travelPlans:string;travelPrefs:string;trainerProfiles:string;trainerAvailability:string};
const sessionsTable='atlas_restore_sessions';
const guestLinksTable='atlas_guest_links';
const getBody=(v:unknown):Record<string,unknown>=>
  v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const sessionPattern=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const rowId=(v:unknown)=>typeof v==='string'&&v.length>=1&&v.length<=160&&!/[\u0000-\u001f]/.test(v);
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
function readCounts(v:unknown,version:number):Counts|null {
 const obj=getBody(v),result={} as Counts;
 let total=0;
 for(const key of categories){
   const count=key==='availability'&&version===1&&obj[key]===undefined?0:obj[key];
   if(!Number.isSafeInteger(count)||Number(count)<0||Number(count)>8000)return null;
   result[key]=Number(count);total+=Number(count);
 }
 return total<=8000?result:null;
}
function receiptTable(id:string){return 'atlas_restore_receipts_'+id.replace(/-/g,'');}
function destination(session:Session,category:Category,regular:(w:string)=>Tables,extra:(w:string)=>ExtraTables){
 const t=regular(session.newWorkspaceId),x=extra(session.newWorkspaceId);
 if(category==='managers')return t.managers;
 if(category==='assignments')return t.assignments;
 if(category==='visits')return t.visits;
 if(category==='availability')return x.trainerAvailability;
 return x[category as keyof ExtraTables];
}
async function lookup(id:string):Promise<Session|null>{
 const [session]=await db.get<Session>(sessionsTable,[id],{consistent:true});
 return session||null;
}
async function receiptsFor(id:string){
 const items:Receipt[]=[];let cursor:string|undefined;
 for(let i=0;i<35;i++){
   const page=await db.list<Receipt>(receiptTable(id),{limit:200,...(cursor?{nextToken:cursor}:{})});
   items.push(...page.items);
   if(!page.nextToken)return items;
   if(page.nextToken===cursor)throw Error('Backup recovery cursor stopped advancing.');
   cursor=page.nextToken;
 }
 throw Error('The recovery contains too many batches to verify safely.');
}
export function makeRestoreRoutes(deps:{
 workspaceAccess:RouterMiddleware;
 member:(id:string)=>Promise<Member|null>;
 tables:(workspaceId:string)=>Tables;
 extraTables:(workspaceId:string)=>ExtraTables;
}):RouterRoutes{
 async function owned(sessionId:string,actorId:string,workspaceId:string){
   if(!sessionPattern.test(sessionId))return null;
   const session=await lookup(sessionId);
   if(!session||session.sourceActorId!==actorId||session.sourceWorkspaceId!==workspaceId)return null;
   return session;
 }
 return {
  'POST /api/backup/restore/start':[deps.workspaceAccess,async ctx=>{
    const member=await deps.member(ctx.user!.userId);
    if(!member)return error('Workspace access required.',403);
    const body=getBody(ctx.body);
    const hash=String(body.sourceHash||'').toLowerCase();
    const format=String(body.format||''),version=body.schemaVersion;
    const counts=(version===1||version===2)?readCounts(body.counts,version):null;
    if(format!=='field-sales-atlas-operations-backup'||(version!==1&&version!==2)||
       !/^[0-9a-f]{64}$/.test(hash)||!counts)
      return error('Only complete Field Sales Atlas version 1 or 2 backups with up to 8,000 records are supported.',400);
    if(counts.trainerProfiles!==2)
      return error('The backup must contain both trainer profiles.',400);
    const sessionId=String(body.sessionId||'');
    if(!sessionPattern.test(sessionId))return error('Invalid restoration request ID.',400);
    const earlier=await lookup(sessionId);
    if(earlier){
      if(earlier.sourceHash!==hash||earlier.sourceActorId!==ctx.user!.userId||
         earlier.sourceWorkspaceId!==member.workspaceId)
        return error('Recovery request ID belongs to another backup.',409);
      return json({sessionId,status:earlier.status,workspaceKey:earlier.status==='finalized'?earlier.workspaceKey:undefined});
    }
    const createdAt=new Date().toISOString();
    const session:Session={
      id:sessionId,sourceWorkspaceId:member.workspaceId,sourceActorId:ctx.user!.userId,
      newWorkspaceId:'team_'+randomUUID().replace(/-/g,''),
      newActorId:'guest_'+randomUUID().replace(/-/g,''),
      sourceHash:hash,expected:counts,createdAt,
      expiresAt:new Date(Date.now()+4*60*60*1000).toISOString(),status:'staging'
    };
    const [saved]=await db.tx.add(sessionsTable,[session]);
    if(!saved){
      const found=await lookup(sessionId);
      if(found&&found.sourceHash===hash&&found.sourceActorId===ctx.user!.userId)
        return json({sessionId,status:found.status,workspaceKey:found.workspaceKey});
      return error('Recovery setup is being confirmed. Try again.',409);
    }
    return json({sessionId,status:'staging',maximumRecords:8000,chunkLimit:25},201);
  }],
  'POST /api/backup/restore/chunk':[deps.workspaceAccess,async ctx=>{
    const member=await deps.member(ctx.user!.userId);
    if(!member)return error('Workspace access required.',403);
    const body=getBody(ctx.body);
    const sessionId=String(body.sessionId||'');
    const session=await owned(sessionId,ctx.user!.userId,member.workspaceId);
    if(!session)return error('Recovery session not found for this workspace.',404);
    if(session.status!=='staging'||session.expiresAt<new Date().toISOString())
      return error('Recovery is finalized or expired. Start again from the backup.',409);
    const category=String(body.category||'') as Category;
    const index=Number(body.index);
    const original=body.records;
    if(!categories.includes(category)||!Number.isSafeInteger(index)||index<0||index>9999||
       !Array.isArray(original)||!original.length||original.length>25)
      return error('Invalid recovery collection or batch size.',400);
    const serialized=JSON.stringify(original);
    if(serialized.length>620000)return error('Recovery batch is too large. Use smaller batches.',413);
    const mapped=original.map(v=>{
      if(!v||typeof v!=='object'||Array.isArray(v))return null;
      const record={...v as Record<string,unknown>};
      if(!rowId(record.id))return null;
      if(category==='directory'){
        const oldId=String(record.id),owner=oldId===session.sourceActorId;
        record.id=owner?session.newActorId:
          'archived_'+sha(session.newWorkspaceId+':directory:'+oldId).slice(0,36);
        record.workspaceId=session.newWorkspaceId;
        record.role=owner?'owner':'historical';
      }
      if(category==='travelPrefs'&&!['trainer_a','trainer_b'].includes(String(record.id))){
        const oldId=String(record.id);
        record.id=oldId===session.sourceActorId?session.newActorId:
          'archived_'+sha(session.newWorkspaceId+':preferences:'+oldId).slice(0,36);
      }
      return record;
    });
    if(mapped.some(v=>!v||!rowId(v.id)||JSON.stringify(v).length>180000))
      return error('Recovery batch contains invalid or oversized records.',400);
    if(category==='trainerProfiles'&&mapped.some(v=>!['trainer_a','trainer_b'].includes(String(v!.id))))
      return error('Only trainer_a and trainer_b profile records may be restored.',400);
    const id=sessionId+'-'+category+'-'+index;
    const hash=sha(JSON.stringify(mapped));
    const table=receiptTable(sessionId);
    const [existing]=await db.get<Receipt>(table,[id],{consistent:true});
    if(existing){
      if(existing.hash!==hash||existing.count!==mapped.length)return error('Recovery batch was already used with different records.',409);
      return json({ok:true,replayed:true,category,index,items:existing.count});
    }
    const receipt:Receipt={id,sessionId,category,index,count:mapped.length,hash,at:new Date().toISOString()};
    try{
      await db.transact([
        db.tx.add(table,[receipt]),
        db.tx.add(destination(session,category,deps.tables,deps.extraTables),
          mapped as Array<Record<string,unknown>>)
      ]);
      return json({ok:true,category,index,items:mapped.length});
    }catch(err){
      if(isAppDatabaseError(err)&&(err.code==='AppDatabaseDuplicateId'||err.code==='AppDatabaseUnknownOutcome')){
        const [saved]=await db.get<Receipt>(table,[id],{consistent:true});
        if(saved&&saved.hash===hash&&saved.count===mapped.length)
          return json({ok:true,replayed:true,category,index,items:saved.count});
      }
      console.warn('Recovery batch rejected:',isAppDatabaseError(err)?err.code:'Unknown');
      return error('Recovery batch could not be committed. The original workspace was not changed. Verify before retrying.',409);
    }
  }],
  'POST /api/backup/restore/finish':[deps.workspaceAccess,async ctx=>{
    const member=await deps.member(ctx.user!.userId);
    if(!member)return error('Workspace access required.',403);
    const body=getBody(ctx.body),sessionId=String(body.sessionId||'');
    const session=await owned(sessionId,ctx.user!.userId,member.workspaceId);
    if(!session)return error('Recovery session not found for this workspace.',404);
    if(session.status==='finalized'&&session.workspaceKey)
      return json({ok:true,workspaceKey:session.workspaceKey,restored:true,replayed:true});
    if(session.expiresAt<new Date().toISOString())return error('Recovery session expired. No records were changed in the existing workspace.',409);
    const receipts=await receiptsFor(sessionId);
    const totals=Object.fromEntries(categories.map(c=>[c,0])) as Counts;
    const keys=new Set<string>();
    for(const receipt of receipts){
      if(receipt.sessionId!==sessionId||!categories.includes(receipt.category)||
         !Number.isSafeInteger(receipt.count)||receipt.count<=0)return error('Recovery receipt validation failed.',409);
      if(keys.has(receipt.id))return error('Recovery has duplicate batch receipts.',409);
      keys.add(receipt.id);totals[receipt.category]+=receipt.count;
    }
    for(const category of categories){
      if(totals[category]!==session.expected[category])
        return error('Recovery is incomplete: '+category+' has '+totals[category]+
          ' of '+session.expected[category]+' expected records.',409);
    }
    const profiles=await db.get<{id:string}>(deps.extraTables(session.newWorkspaceId).trainerProfiles,['trainer_a','trainer_b'],{consistent:true});
    if(profiles.some(v=>!v))return error('Both trainer profiles must be restored before publishing.',409);
    const workspaceKey=randomUUID().replace(/-/g,'')+randomUUID().replace(/-/g,'');
    const linkId=sha(workspaceKey);
    try{
      await db.transact([
        db.tx.add('atlas_teams',[{id:session.newWorkspaceId,
          ownerId:session.newActorId,name:'Restored Field Sales Atlas'}]),
        db.tx.add('atlas_members',[{id:session.newActorId,workspaceId:session.newWorkspaceId,role:'owner'}]),
        db.tx.add(guestLinksTable,[{id:linkId,workspaceId:session.newWorkspaceId,
          actorId:session.newActorId,createdAt:new Date().toISOString()}]),
        db.tx.update(sessionsTable,[{id:sessionId,
          record:{status:'finalized',workspaceKey,completedAt:new Date().toISOString()},
          if:{status:'staging'}}],{patch:true})
      ]);
      return json({ok:true,workspaceKey,restored:true,counts:totals});
    }catch(err){
      const confirmed=await lookup(sessionId);
      if(confirmed?.status==='finalized'&&confirmed.workspaceKey)
        return json({ok:true,workspaceKey:confirmed.workspaceKey,restored:true,replayed:true});
      console.warn('Recovery finalization not confirmed',isAppDatabaseError(err)?err.code:'Unknown');
      return error('Recovery publication could not be confirmed. Recheck the request without restarting the import.',409);
    }
  }]
 };
}
