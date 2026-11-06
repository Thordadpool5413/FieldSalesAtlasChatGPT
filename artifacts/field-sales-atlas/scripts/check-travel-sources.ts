import { db } from '../../api-server/src/field-atlas/backend/runtime/sdk';
import { validateConnections } from '../../api-server/src/field-atlas/backend/providers/connections';

try {
  console.log(JSON.stringify(await validateConnections(['MCO', 'YYZ'], true), null, 2));
} finally { db.close(); }
