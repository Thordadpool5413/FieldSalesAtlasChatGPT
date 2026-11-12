import { db } from '../../../api-server/src/field-atlas/backend/runtime/sdk';
import { STARTER_AIRPORTS } from '../../src/data';
import { CANADA_STARTER_AIRPORTS } from '../../src/CanadaRegions';

export async function seedTestReference(){
  const referenceVersion='isolated-test-reference';
  const airports=[...STARTER_AIRPORTS.map(airport=>({...airport,country:'US'})),...CANADA_STARTER_AIRPORTS.map(airport=>({...airport,country:'CA'}))];
  await db.tx.update('atlas_airport_reference_global',[
    ...airports.map(airport=>({id:airport.iata,record:{...airport,referenceVersion}})),
    {id:'_head',record:{retrievedAt:new Date().toISOString(),checksum:referenceVersion,count:airports.length,sourceUrl:'Isolated test reference; not a provider response'}},
    {id:'_refresh',record:{lastAttemptAt:new Date().toISOString(),lastError:null,retryAfter:new Date(Date.now()+6*3600000).toISOString()}}
  ]);
}
if(process.argv.includes('--seed')){await seedTestReference();await db.close();}
