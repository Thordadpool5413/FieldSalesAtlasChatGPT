import { refreshAirportReference } from '../../api-server/src/field-atlas/backend/providers/airports';
import { db } from '../../api-server/src/field-atlas/backend/runtime/sdk';
try { const result = await refreshAirportReference(); console.log('Validated OurAirports reference:', result.count, 'airports;', result.retrievedAt, '; SHA-256', result.checksum); }
finally { await db.close(); }
