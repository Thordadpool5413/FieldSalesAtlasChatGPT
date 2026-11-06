import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtlasDatabase } from '../../api-server/src/field-atlas/backend/runtime/database';

test('SQLite records survive closing and reopening the database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-persistence-'));
  try {
    const file = join(directory, 'atlas.sqlite');
    const original = new AtlasDatabase(file);
    assert.deepEqual(await original.tx.add('managers', [{ id: 'a', name: 'Alex' }]), [true]);
    original.close();
    const restored = new AtlasDatabase(file);
    assert.deepEqual(await restored.get('managers', ['a', 'missing']), [{ id: 'a', name: 'Alex' }, null]);
    restored.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('cross-table operations are lazy and a duplicate rolls back the entire transaction', async () => {
  const database = new AtlasDatabase(':memory:');
  try {
    await database.tx.add('visits', [{ id: 'existing' }]);
    const trip = database.tx.add('trips', [{ id: 'trip' }]);
    assert.deepEqual(await database.get('trips', ['trip']), [null]);
    await assert.rejects(database.transact([trip, database.tx.add('visits', [{ id: 'existing' }])]));
    assert.deepEqual(await database.get('trips', ['trip']), [null]);
    await database.transact([database.tx.add('trips', [{ id: 'trip' }]), database.tx.add('visits', [{ id: 'new' }])]);
    assert.deepEqual(await database.get('trips', ['trip']), [{ id: 'trip' }]);
  } finally { database.close(); }
});

test('optimistic update conflicts preserve earlier transaction records', async () => {
  const database = new AtlasDatabase(':memory:');
  try {
    await database.tx.add('trips', [{ id: 't', revision: 2 }]);
    await assert.rejects(database.transact([
      database.tx.add('visits', [{ id: 'v' }]),
      database.tx.update('trips', [{ id: 't', record: { revision: 3 }, if: { revision: 1 } }], { patch: true }),
    ]));
    assert.deepEqual(await database.get('visits', ['v']), [null]);
    assert.deepEqual(await database.get('trips', ['t']), [{ id: 't', revision: 2 }]);
    assert.deepEqual(await database.tx.update('trips', [{ id: 'missing', record: { revision: 1 } }], { patch: true }), [false]);
  } finally { database.close(); }
});

test('pagination reads every record exactly once and rejects another collection’s cursor', async () => {
  const database = new AtlasDatabase(':memory:');
  try {
    await database.tx.add('rows', Array.from({ length: 27 }, (_, i) => ({ id: String(i).padStart(3, '0') })));
    const ids: string[] = [];
    let nextToken: string | undefined;
    do {
      const page = await database.list<{ id: string }>('rows', { limit: 5, nextToken });
      ids.push(...page.items.map(row => row.id));
      nextToken = page.nextToken;
    } while (nextToken);
    assert.equal(ids.length, 27);
    assert.equal(new Set(ids).size, 27);
    const first = await database.list('rows', { limit: 5 });
    await assert.rejects(database.list('another', { nextToken: first.nextToken }));
  } finally { database.close(); }
});
