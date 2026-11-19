// Multiplayer is invite-only for now (2026-11-19). The database refuses an
// invite from a team not let in, so without this the app still offered "Start
// and invite 2" and the setup's invite step, then answered "could not be
// invited" with no reason. Measured by reading the team state the window gets
// and the setup's steps for each answer the cloud can give.
import { it, expect, describe, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { setupSteps } from '../renderer/src/setup-split.ts';
import { askWords } from '../renderer/src/team/ask-for-multiplayer.tsx';

type Answer = () => Promise<boolean>;
const services: { signOut(): Promise<unknown> }[] = [];
afterEach(async () => { for (const s of services.splice(0)) await s.signOut(); });

async function aMac(answer: Answer | null) {
  const cloud = createMemoryCloud();
  const personId = signUpMemory(cloud, { email: 'dana@northwind.test', name: 'Dana' });
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-gate-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => (answer ? { ...memoryBackend(cloud, personId), hasMultiplayer: answer } : memoryBackend(cloud, personId))),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  services.push(service);
  await service.signIn();
  return service;
}

describe('what the window is told', () => {
  it('is false when the cloud says this person is not let in', async () => {
    const mac = await aMac(async () => false);
    expect(mac.state().multiplayer).toBe(false);
  });

  it('is true when they are', async () => {
    const mac = await aMac(async () => true);
    expect(mac.state().multiplayer).toBe(true);
  });

  it('says nothing either way when the cloud cannot answer, so an older cloud hides nothing', async () => {
    expect((await aMac(async () => { throw new Error('function i_have_multiplayer does not exist'); })).state().multiplayer).toBeNull();
    expect((await aMac(null)).state().multiplayer).toBeNull();
  });

  it('turns on at the next sync once they are let in, on a team already', async () => {
    let letIn = false;
    const mac = await aMac(async () => letIn);
    await mac.createTeam('Northwind');
    expect(mac.state().multiplayer).toBe(false);
    letIn = true;
    await mac.syncNow();
    expect(mac.state().multiplayer).toBe(true);
  });
});

describe('the setup after Pro is bought', () => {
  const pro = { chats: 3, team: true, teammates: false, project: true, signedIn: true, plan: 'pro' as const };
  it('skips the invite step for a team not let in', () => {
    expect(setupSteps({ ...pro, multiplayer: false })).not.toContain('invite');
  });
  it('keeps it when let in, or when the cloud could not say', () => {
    expect(setupSteps({ ...pro, multiplayer: true })).toContain('invite');
    expect(setupSteps({ ...pro, multiplayer: null })).toContain('invite');
    expect(setupSteps(pro)).toContain('invite');
  });
});

it('the ask carries the email that goes on the list', () => {
  expect(askWords('dana@northwind.test')).toMatch(/dana@northwind\.test/);
});
