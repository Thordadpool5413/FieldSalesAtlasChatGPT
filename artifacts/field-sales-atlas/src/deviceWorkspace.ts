export function deviceWorkspaceScope(){
  if(typeof window==='undefined')return '';
  const selected=window.location.hash.match(/^#workspace=([0-9a-f]{64})$/i)?.[1];
  if(selected)return selected.toLowerCase();
  try{const remembered=localStorage.getItem('field-sales-atlas-link-v1') || '';return /^[0-9a-f]{64}$/i.test(remembered)?remembered.toLowerCase():'unlinked';}
  catch{return 'unlinked';}
}
export function workspaceDeviceKey(base:string){const scope=deviceWorkspaceScope();return scope?base+':workspace:'+scope:base;}
