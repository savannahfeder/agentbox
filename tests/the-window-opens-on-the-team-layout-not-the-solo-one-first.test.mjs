// "When I first load it it uses like an older version of the app (semi diff
// UI) then a few secs later it starts loading the new version" (2026-10-25).
// It was one build drawn twice. The team sign-in is restored over the network
// after the window is up (main/team/index.mjs `start`), and until it lands the
// snapshot says signedIn: false, so the window drew the single-person app:
// no faces, no people, no team filter. Then the team arrived and it redrew.
// Measured with the service on an in-memory cloud: every state change before
// the restore finished had no team in it. Now the service says `settling`
// until the team is known, and the boot screen waits on that, never for more
// than a few seconds.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService, teamForWindow } from '../main/team/index.mjs';
import { TEAM_WAIT_MS } from '../renderer/src/boot-waits.ts';
import { NOT_ANSWERING_MS } from '../renderer/src/not-answering.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function aMac(session) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-settling-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const seen = [];
  let mac = null;
  mac = createTeamService({
    session, store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, startRetryMs: 1,
    onChange: () => { if (mac) seen.push(mac.state()); },
  });
  return { mac, seen };
}

async function personInATeam(cloud) {
  const id = signUpMemory(cloud, { email: 'ada@x.test', name: 'Ada' });
  await memoryBackend(cloud, id).createTeam('Northwind');
  return id;
}

describe('the team service says when the team is known', () => {
  it('is settling from the start while a saved sign-in may come back', async () => {
    const cloud = createMemoryCloud();
    const id = await personInATeam(cloud);
    const { mac } = await aMac({ configured: true, restore: async () => memoryBackend(cloud, id) });
    expect(mac.state().settling).toBe(true);
  });

  it('stops settling only once the team and its people are in the state', async () => {
    const cloud = createMemoryCloud();
    const id = await personInATeam(cloud);
    const { mac, seen } = await aMac({ configured: true, restore: async () => memoryBackend(cloud, id) });
    await mac.start();
    const first = seen.find((s) => !s.settling);
    expect(first).toMatchObject({ signedIn: true, team: { name: 'Northwind' } });
    expect(first.people.length).toBeGreaterThan(0);
  });

  it('stops settling at once when there is no saved sign-in', async () => {
    const { mac } = await aMac({ configured: true, restore: async () => null });
    await mac.start();
    expect(mac.state()).toMatchObject({ settling: false, started: true, signedIn: false });
  });

  it('stops settling on the first failure rather than after every retry', async () => {
    let tries = 0;
    const { mac, seen } = await aMac({ configured: true, restore: async () => { tries += 1; throw new Error('offline'); } });
    await mac.start();
    const firstFailure = seen.findIndex((s) => s.error);
    expect(seen[firstFailure].settling).toBe(false);
    expect(tries).toBe(3);
  });

  it('never settles where there is no team cloud', async () => {
    const { mac } = await aMac({ configured: false });
    expect(mac.state().settling).toBe(false);
  });

  it('reaches the window with Multiplayer off too, where the sign-in still changes the screen', () => {
    expect(teamForWindow({ configured: true, settling: true, signedIn: false, me: null }, false).settling).toBe(true);
  });
});

describe('the boot screen waits for it', () => {
  it('holds the boot screen while the team is settling, unless the wait is over', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/if \(snap\.team\?\.settling && !teamWaitOver\) return <Booting \/>;/);
    expect(app).toMatch(/setTimeout\(\(\) => setTeamWaitOver\(true\), TEAM_WAIT_MS\)/);
  });

  it('never for so long that the boot screen starts saying the app is not answering', () => {
    expect(TEAM_WAIT_MS).toBeGreaterThan(0);
    expect(TEAM_WAIT_MS).toBeLessThan(NOT_ANSWERING_MS);
  });
});
