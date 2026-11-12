import { spawn } from 'node:child_process';
import { routingFixture } from './routing-fixture.mjs';

const routing=await routingFixture();
const env={...process.env,ATLAS_DATABASE_ENGINE:'sqlite',ATLAS_ROUTING_PROVIDER:'osrm',ATLAS_ROUTING_URL:routing.origin,NODE_ENV:'test'};
const seed=spawn(process.execPath,['--import','tsx','tests/support/seed-reference.ts','--seed'],{env,stdio:'inherit'});
const code=await new Promise(resolve=>seed.on('exit',resolve));
if(code!==0){await routing.close();process.exit(code||1);}
const app=spawn(process.execPath,['../../scripts/start-local.mjs','--preview','--test-fixtures'],{env,stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.kill(signal));
app.on('exit',async code=>{await routing.close();process.exit(code||0);});
