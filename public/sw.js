/* Field Sales Atlas PWA v11. Generic application shell may be cached offline.
 * Never cache API responses, workspace keys, auth records or personal data.
 * Updates remain user-approved to protect unsaved forms.
 */
const CACHE_NAME='field-sales-atlas-static-v11';
const PREFIX='field-sales-atlas-static-';
const OFFLINE='/offline.html';
const APP_SHELL='/';
const PUBLIC_ASSETS=[
 '/resources/field-sales-atlas-logo.jpg',
 '/resources/app-icon.png',
 '/resources/apple-touch-icon.png',
 '/resources/favicon.png',
 '/manifest.webmanifest'
];
self.addEventListener('install',(event)=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.add(OFFLINE);
  // Cache only a generic index shell, never a URL containing a share token.
  await Promise.allSettled([APP_SHELL,...PUBLIC_ASSETS].map(path=>cache.add(path)));
  // Do not skip waiting until the user explicitly confirms an update.
 })());
});
self.addEventListener('message',(event)=>{
 if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',(event)=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE_NAME)
    .map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',(event)=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 // Private business state and all write/read APIs are strictly network-only.
 if(url.pathname.startsWith('/api/')||
    url.pathname.startsWith('/__appdeploy/')||
    url.pathname.startsWith('/_appdeploy/'))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   try {
    const response=await fetch(request);
    if(response.ok&&url.pathname==='/'&&!url.search){
     const cache=await caches.open(CACHE_NAME);
     void cache.put(APP_SHELL,response.clone()).catch(()=>undefined);
    }
    return response;
   }catch{
    const cache=await caches.open(CACHE_NAME);
    // Safe static shell enables a locally bundled geographic map without
    // making any claim that live airports or shared records are current.
    return (await cache.match(APP_SHELL))||
           (await cache.match(OFFLINE))||Response.error();
   }
  })());
  return;
 }
 const staticFile=(url.pathname.startsWith('/assets/')||
                   url.pathname.startsWith('/resources/'))&&
                  /\.(?:js|css|svg|png|ico|jpe?g|webp|woff2?)$/i.test(url.pathname);
 if(!staticFile)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const saved=await cache.match(request);
  if(url.pathname.startsWith('/assets/')&&saved)return saved;
  try{
   const response=await fetch(request);
   if(response.ok&&response.type==='basic'){
    void cache.put(request,response.clone()).catch(()=>undefined);
   }
   return response;
  }catch{return saved||Response.error();}
 })());
});
