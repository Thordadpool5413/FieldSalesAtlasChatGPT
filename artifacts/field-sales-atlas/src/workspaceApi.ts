
import { api as transport } from './runtime/client';

const STORAGE_KEY='field-sales-atlas-link-v1';
const validKey=/^[0-9a-f]{64}$/i;
let accessKey='';
let pending:Promise<string>|null=null;

function providedKey(){
  if(typeof window==='undefined')return '';
  return window.location.hash.match(/^#workspace=([0-9a-f]{64})$/i)?.[1]||'';
}
function rememberedKey(){
  try{return window.localStorage.getItem(STORAGE_KEY)||'';}catch{return '';}
}
function saveKey(key:string){
  if(!validKey.test(key))throw Error('Invalid workspace access link.');
  accessKey=key.toLowerCase();
  try{window.localStorage.setItem(STORAGE_KEY,accessKey);}catch{}
  window.history.replaceState(null,'',window.location.pathname+window.location.search+'#workspace='+accessKey);
}
export function getShareUrl(){
  return accessKey?window.location.origin+window.location.pathname+'#workspace='+accessKey:'';
}
async function url(path:string){
  if(path.startsWith('/api/geography/')||path.startsWith('/api/travel/aviation/')||path.startsWith('/api/_healthcheck'))return path;
  if(!accessKey)await initializeWorkspace();
  if(!accessKey)throw Error('Workspace is still opening.');
  let trainerId='trainer_a';
  try{if(window.localStorage.getItem('field-atlas-active-trainer')==='trainer_b')trainerId='trainer_b';}catch{}
  return path+(path.includes('?')?'&':'?')+'workspaceKey='+encodeURIComponent(accessKey)+'&trainerId='+trainerId;
}
function requireOnlineWrite(){
  // This PWA intentionally offers no offline write queue: a pending change
  // may conflict with the other trainer's server-side edits.
  if(typeof navigator!=='undefined'&&navigator.onLine===false)
    throw new Error('You are offline. The change was not saved. Reconnect and try again.');
}
export const api={
  get:async(path:string,data?:unknown)=>transport.get(await url(path),data),
  post:async(path:string,data?:unknown)=>{requireOnlineWrite();return transport.post(await url(path),data);},
  put:async(path:string,data?:unknown)=>{requireOnlineWrite();return transport.put(await url(path),data);},
  delete:async(path:string,data?:unknown)=>{requireOnlineWrite();return transport.delete(await url(path),data);}
};
export async function createNewWorkspace(){
  const response=await transport.post('/api/guest/create',{});
  const key=String(response.data?.workspaceKey||'');
  if(!validKey.test(key))throw Error('Workspace creation did not return a valid link.');
  saveKey(key);
  return key;
}

const RETURN_KEY='field-atlas-demo-return-v1';
export async function openDemoWorkspace(){
  const response=await transport.post('/api/demo/create',{});
  const key=String(response.data?.workspaceKey||'');
  if(!validKey.test(key))throw Error('Demo creation did not return a valid workspace.');
  // Keep the real workspace link on this device, never inside demo records.
  if(accessKey){
    try{window.sessionStorage.setItem(RETURN_KEY,accessKey);}catch{throw Error('Browser storage is unavailable. Keep a copy of your current workspace link before opening a demo.');}
  }
  saveKey(key);
}
export function canReturnFromDemo(){
  try{return validKey.test(window.sessionStorage.getItem(RETURN_KEY)||'');}catch{return false;}
}
export function returnFromDemo(){
  const key=window.sessionStorage.getItem(RETURN_KEY)||'';
  if(!validKey.test(key))throw Error('Open your original workspace link to return to your records.');
  saveKey(key);
  window.sessionStorage.removeItem(RETURN_KEY);
}

export async function joinWorkspaceLink(input:string){
  const value=input.trim();
  let key='';
  if(validKey.test(value))key=value;
  else{
    let candidate:URL;
    try{candidate=new URL(value,window.location.origin);}
    catch{throw Error('Paste a complete Field Sales Atlas link or valid workspace key.');}
    if(candidate.origin!==window.location.origin)
      throw Error('That link belongs to another website. Use the Field Sales Atlas workspace URL.');
    key=candidate.hash.match(/^#workspace=([0-9a-f]{64})$/i)?.[1]||'';
  }
  if(!validKey.test(key))throw Error('No valid shared workspace key was found in the link.');
  const before=accessKey;
  accessKey=key.toLowerCase();
  try{
    const result=await transport.get('/api/operations?workspaceKey='+encodeURIComponent(accessKey));
    if(result.data?.needsTeam)throw Error('Workspace could not be opened.');
    saveKey(key);
  }catch(e){
    accessKey=before;
    throw Error(e instanceof Error?e.message:'Could not verify the shared workspace link.');
  }
}

export async function initializeWorkspace(){
  if(pending)return pending;
  pending=(async()=>{
    const key=providedKey()||rememberedKey();
    if(!key)return createNewWorkspace();
    accessKey=key.toLowerCase();
    await api.get('/api/operations');
    saveKey(key);
    return key;
  })();
  try{return await pending;}finally{pending=null;}
}
