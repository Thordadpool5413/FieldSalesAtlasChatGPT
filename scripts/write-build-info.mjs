import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const candidate = git(['rev-parse', 'HEAD']);
const revision = candidate && /^[a-f0-9]{40}$/.test(candidate) ? candidate : null;
const changes = revision ? git(['status', '--porcelain', '--untracked-files=no']) : null;
const info = {
  app: 'Field Sales Atlas',
  revision,
  sourceModified: changes === null ? null : changes.length > 0,
  builtAt: new Date().toISOString(),
};
// Public build metadata only. Never include environment variables, workspace
// links, a remote URL, authentication information or business records.
const destination = resolve(root, process.env.APPDEPLOY_VITE_OUT_DIR || 'dist', 'build-info.json');
await writeFile(destination, JSON.stringify(info, null, 2) + '\n');
console.log(`Build revision: ${revision ? revision.slice(0, 7) : 'unavailable (Git metadata not included)'}${info.sourceModified ? ' + local changes' : ''}`);
