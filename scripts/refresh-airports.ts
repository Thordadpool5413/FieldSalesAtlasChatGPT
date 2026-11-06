import { refreshAirportReference } from '../backend/providers/airports';
import { db } from '../backend/runtime/sdk';
try { const result = await refreshAirportReference(); console.log('Validated OurAirports reference:', result.count, 'airports;', result.retrievedAt, '; SHA-256', result.checksum); }
finally { db.close(); }
