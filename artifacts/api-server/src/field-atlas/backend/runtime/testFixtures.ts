import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// Test fixtures are only usable by an explicitly selected test runtime with an
// isolated temporary data directory. Normal Run and published builds never seed them.
export function testFixturesEnabled() {
  const directory=process.env.ATLAS_DATA_DIR || '';
  const child=relative(resolve(tmpdir()),resolve(directory));
  return process.env.NODE_ENV==='test' && process.env.ATLAS_TEST_FIXTURES==='1' && isAbsolute(directory)
    && !!child && child!=='..' && !child.startsWith('..'+sep) && !isAbsolute(child);
}
