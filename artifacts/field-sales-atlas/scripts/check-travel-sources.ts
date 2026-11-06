import { db } from '../backend/runtime/sdk';
import { validateConnections } from '../backend/providers/connections';

try {
  console.log(JSON.stringify(await validateConnections(['MCO', 'YYZ'], true), null, 2));
} finally { db.close(); }
