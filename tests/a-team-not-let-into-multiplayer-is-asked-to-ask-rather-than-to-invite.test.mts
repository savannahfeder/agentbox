// Multiplayer is invite-only for now (2026-11-19). The database refuses an
// invite from a team not let in, so without this the app still offered "Start
// and invite 2" and the setup's invite step, then answered "could not be
// invited" with no reason. Measured by reading the team state the window gets
// for each answer the cloud can give, and the setup's steps and Pro list.
import { it, expect, describe, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { PRO_PITCH, setupSteps } from '../renderer/src/setup-split.ts';
import { askWords } from '../renderer/src/team/ask-for-multiplayer.tsx';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

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

// The founder, 2026-11-19: "We don't want the step where you invite your team
// ... because obviously it's invite only", and the Pro list should say so.
describe('the setup', () => {
  const pro = { chats: 3, team: true, teammates: false, project: true, signedIn: true, plan: 'pro' as const };
  it('has no step for inviting people, after Pro or for someone already on a team', () => {
    expect(setupSteps(pro)).toEqual(['chats', 'plan', 'look']);
    expect(setupSteps({ ...pro, plan: 'free', onTeam: true })).toEqual(['chats', 'look']);
    expect(split).not.toMatch(/Invite your team\.|teamInvite/);
  });
  it('marks sharing with your team as invite only where it lists what Pro brings', () => {
    expect(PRO_PITCH.perks.find((k) => k.id === 'team')).toMatchObject({ tag: 'Invite only' });
    expect(PRO_PITCH.perks.filter((k) => 'tag' in k).map((k) => k.id)).toEqual(['team']);
    expect(split).toMatch(/\{'tag' in k && <span className="ss-perk-tag">\{k\.tag\}<\/span>\}/);
  });
});

it('the ask carries the email that goes on the list', () => {
  expect(askWords('dana@northwind.test')).toMatch(/dana@northwind\.test/);
});
