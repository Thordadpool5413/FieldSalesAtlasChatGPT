import { createServer } from 'node:http';

// Isolated provider-contract fixture. Imported by tests only, never by the app.
export async function routingFixture(){
  const server=createServer((req,res)=>{
    const address=new URL(req.url,'http://localhost');
    if(!address.pathname.startsWith('/table/v1/driving/')){res.writeHead(404).end();return;}
    const count=address.pathname.slice('/table/v1/driving/'.length).split(';').length;
    const durations=Array.from({length:count},(_,a)=>Array.from({length:count},(_,b)=>a===b?0:600+Math.abs(a-b)*60));
    const distances=durations.map(row=>row.map(value=>value*10));
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({code:'Ok',durations,distances}));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  return {origin,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
