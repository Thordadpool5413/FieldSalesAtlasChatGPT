import { createHash, randomUUID } from 'node:crypto';
import { db, json, error } from './runtime/sdk';

// Every invocation creates a separate tenant in one transaction. Never seed an existing workspace.
export async function createDemoWorkspace() {
  const workspaceKey = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const workspaceId = 'team_' + randomUUID().replace(/-/g, '');
  const actorId = 'guest_' + randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const date = (offset: number) => {
    const day = new Date(); day.setUTCDate(day.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  };
  const managers = [
    { name: 'Demo · Jordan Ellis', baseCity: 'Orlando', baseState: 'FL', lat: 28.5383, lon: -81.3792, homeAirport: 'MCO', trainer: 'Taylor' },
    { name: 'Demo · Casey Rivera', baseCity: 'Tampa', baseState: 'FL', lat: 27.9506, lon: -82.4572, homeAirport: 'TPA', trainer: 'Taylor' },
    { name: 'Demo · Avery Chen', baseCity: 'Atlanta', baseState: 'GA', lat: 33.749, lon: -84.388, homeAirport: 'ATL', trainer: 'Morgan' },
  ].map(person => ({ ...person, id: randomUUID(), email: '', phone: '', cadence: 'Monthly', focus: 'Sample coaching goals', coachingStatus: 'On track', updatedAt: now }));
  try {
    await db.transact([
      db.tx.add('atlas_teams', [{ id: workspaceId, ownerId: actorId, name: 'Field Sales Atlas demo' }]),
      db.tx.add('atlas_members', [{ id: actorId, workspaceId, role: 'owner' }]),
      db.tx.add('atlas_guest_links', [{ id: createHash('sha256').update(workspaceKey).digest('hex'), workspaceId, actorId, createdAt: now }]),
      db.tx.add('atlas_managers_' + workspaceId, managers),
      db.tx.add('atlas_assignments_' + workspaceId, managers.map(person => ({ id: randomUUID(), managerId: person.id, stateCode: person.baseState, areaType: 'state', areaCode: person.baseState, areaName: person.baseState === 'FL' ? 'Florida' : 'Georgia', role: 'Shared' }))),
      db.tx.add('atlas_trainer_profiles_' + workspaceId, [
        { id: 'trainer_a', name: 'Taylor', homeCity: 'Miami, FL', homeAirports: ['MIA'], homeDriveMinutes: { MIA: 45 }, preferredAirlines: '', preferNonstop: true, maxConnections: 1, notes: 'Sample profile', updatedAt: now },
        { id: 'trainer_b', name: 'Morgan', homeCity: 'Charlotte, NC', homeAirports: ['CLT'], homeDriveMinutes: { CLT: 35 }, preferredAirlines: '', preferNonstop: true, maxConnections: 1, notes: 'Sample profile', updatedAt: now },
      ]),
      db.tx.add('atlas_coaching_' + workspaceId, [{ id: randomUUID(), managerId: managers[0].id, date: date(-7), trainer: 'Taylor', skill: 'Discovery conversations', observation: 'Demo: practice open questions.', commitment: 'Demo: review two conversations.', dueDate: date(-1), status: 'Open', createdAt: now, updatedAt: now }]),
    ]);
    return json({ workspaceKey, demo: true }, 201);
  } catch {
    return error('The separate demo workspace could not be created. Your current workspace was not changed.', 500);
  }
}
