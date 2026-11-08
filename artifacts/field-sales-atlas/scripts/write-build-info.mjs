import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildIdentity } from '../../../scripts/build-identity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const info = buildIdentity(root);
const { revision } = info;
// Public build metadata only. Never include environment variables, workspace
// links, a remote URL, authentication information or business records.
const destination = resolve(root, process.env.APPDEPLOY_VITE_OUT_DIR || 'dist/public', 'build-info.json');
await writeFile(destination, JSON.stringify(info, null, 2) + '\n');
console.log(`Build revision: ${revision ? revision.slice(0, 7) : 'unavailable (Git metadata not included)'}${info.sourceModified ? ' + local changes' : ''}`);
