// A THREAD MADE WITH MULTIPLAYER OFF STAYS PRIVATE WHEN IT COMES BACK ON (w-d19fcb9309).
//
// The second synthetic team run (w-1fc102959f, 2026-11-09, three testers on one
// team): six times, a thread made while Multiplayer was off showed in Team ›
// Everyone and in the owner's In progress for the others once Multiplayer was
// back on. With it off the window offers no Team or Private choice, so the
// thread took the project's default, Team. It is now made Private.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { visibilityWhenMade } from '../shared/team-rules.mts';

describe('who a new thread is for', () => {
  it('is Private when made with Multiplayer off and nothing chosen', () => {
    expect(visibilityWhenMade(undefined, false)).toBe('private');
  });
  it('is left to the project with Multiplayer on', () => {
    expect(visibilityWhenMade(undefined, true)).toBeUndefined();
  });
  it('is whatever was chosen, either way', () => {
    expect(visibilityWhenMade('team', false)).toBe('team');
    expect(visibilityWhenMade('people', true)).toBe('people');
  });
  it('is applied where the window makes a thread', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(ipc).toContain('visibility: visibilityWhenMade(visibility, alphaFeatures(config).multiplayer)');
  });
});

describe('on a team, through the real sync', () => {
  let cloud, maya, theo, multiplayer;
  const mac = async (personId) => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'made-off-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, sharing: () => multiplayer });
    return { personId, store, service, storeRoot };
  };
  beforeEach(async () => {
    disk._internals.forgetFolds();
    multiplayer = true;
    cloud = createMemoryCloud();
    maya = await mac(signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
    theo = await mac(signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@nw.test');
    await theo.service.signIn();
    await theo.service.acceptInvite(maya.service.state().team.id);
    disk.setLineAuthor(maya.personId);
  });
  afterEach(async () => { for (const m of [maya, theo]) { await m.service.signOut(); fs.rmSync(m.storeRoot, { recursive: true, force: true }); } });
  const both = async () => { await maya.service.syncNow(); await theo.service.syncNow(); };

  it('keeps a thread made while off from the team after Multiplayer comes back', async () => {
    multiplayer = false;
    const item = maya.store.composeItem('website', { title: 'Audit startup logging', visibility: visibilityWhenMade(undefined, multiplayer) });
    await both();
    multiplayer = true;
    await both();
    expect(theo.service.threadWork(maya.personId, item.id).shared).toBe(false);
  });

  it('still shares a thread made while on', async () => {
    const item = maya.store.composeItem('website', { title: 'Add a health endpoint', visibility: visibilityWhenMade(undefined, multiplayer) });
    await both();
    expect(theo.service.threadWork(maya.personId, item.id).shared).toBe(true);
  });
});
