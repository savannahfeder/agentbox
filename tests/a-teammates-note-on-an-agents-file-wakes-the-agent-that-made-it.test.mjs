// Pins on an agent's picture woke one agent and not another.
// Dev's group bookings agent, told to leave its work unmerged
// until Sofia had looked, sat idle after Sofia and Maya pinned its picture:
// "Nothing more to do now", until Dev typed "the pins have landed, fix them".
// Measured: a teammate's note only reached the owner's Needs you; the agent
// heard notes only when the owner pressed "Send these notes to the agent", or
// when the teammate happened to also write in a chat the agent was on.
//
// Now a teammate's note on a file an agent made on a thread is told to that
// thread as a turn, once, under the teammate's name. A note on a person's own
// file, and the owner's own notes, still start nothing.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { wakeForNotes } from '../main/notes-wake.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-wake-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, dir: path.join(accountRoot, 'website') };
}

const pin = (id, file, text) => ({ do: 'note', id, file, place: { kind: 'pin', x: 0.4, y: 0.6 }, text });

let cloud, dev, sofia, macs, thread, told;
const allSync = async () => { for (const m of macs) await m.service.syncNow(); };
const wake = () => wakeForNotes({ store: dev.store, team: dev.service, tell: async (product, id, said) => { told.push({ product, id, ...said }); } });

beforeEach(async () => {
  disk._internals.forgetFolds();
  told = [];
  cloud = createMemoryCloud();
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Patel' }));
  sofia = await aMac(cloud, signUpMemory(cloud, { email: 'sofia@lumen.test', name: 'Sofia Reyes' }));
  macs = [dev, sofia];
  await dev.service.signIn();
  await dev.service.createTeam('Lumen');
  await dev.service.invite('sofia@lumen.test');
  await sofia.service.signIn();
  await sofia.service.acceptInvite(dev.service.state().team.id);
  disk.setLineAuthor(dev.personId);
  thread = dev.store.composeItem('website', { title: 'Group slots page', body: 'Build it, and leave it unmerged until Sofia has looked.', visibility: 'team' });
  fs.mkdirSync(path.join(dev.dir, 'designs', thread.id), { recursive: true });
  fs.writeFileSync(path.join(dev.dir, 'designs', thread.id, 'slots.png'), 'png');
  disk.updateWorkItem(dev.dir, thread.id, { result: `Built. designs/${thread.id}/slots.png` }, { source: 'agent' });
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });

describe('a teammate pins a picture an agent made', () => {
  it('tells the agent the notes, under her name, once', async () => {
    await sofia.service.markSharedFile(dev.personId, thread.id, pin('n1', 'slots.png', 'Too tight'));
    await sofia.service.markSharedFile(dev.personId, thread.id, pin('n2', 'slots.png', 'Label state 4'));
    await allSync();
    await wake();
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ product: 'website', id: thread.id, from: { teammate: sofia.personId, name: 'Sofia Reyes' } });
    expect(told[0].text).toContain('Sofia Reyes left notes on slots.png');
    expect(told[0].text).toContain('Too tight (Sofia)');
    expect(told[0].text).toContain('Label state 4 (Sofia)');
    expect(told[0].text).toContain('slots-v2.png');
    await wake();
    expect(told).toHaveLength(1);
  });

  it('a later note is told on its own', async () => {
    await sofia.service.markSharedFile(dev.personId, thread.id, pin('n1', 'slots.png', 'Too tight'));
    await allSync();
    await wake();
    await sofia.service.markSharedFile(dev.personId, thread.id, pin('n2', 'slots.png', 'And the label'));
    await allSync();
    await wake();
    expect(told.map((t) => /And the label/.test(t.text))).toEqual([false, true]);
  });
});

describe('what wakes nobody', () => {
  it('the owner\'s own note', async () => {
    dev.store.fileMark('website', thread.id, pin('n1', 'slots.png', 'Mine'));
    await wake();
    expect(told).toEqual([]);
  });

  it('a note on a picture a person attached', async () => {
    const own = dev.store.composeItem('website', { title: 'Logo', body: 'Here: [logo.png](attachments/logo.png)', visibility: 'team' });
    await allSync();
    await sofia.service.markSharedFile(dev.personId, own.id, pin('n1', 'logo.png', 'Nice'));
    await allSync();
    await wake();
    expect(told).toEqual([]);
  });

  it('a note on a thread the owner closed', async () => {
    dev.store.markDone ? dev.store.markDone('website', thread.id) : disk.updateWorkItem(dev.dir, thread.id, { status: 'done' }, { source: 'founder' });
    await sofia.service.markSharedFile(dev.personId, thread.id, pin('n1', 'slots.png', 'Too tight'));
    await allSync();
    await wake();
    expect(told).toEqual([]);
  });

  it('a resolved note', async () => {
    await sofia.service.markSharedFile(dev.personId, thread.id, pin('n1', 'slots.png', 'Too tight'));
    await allSync();
    dev.store.fileMark('website', thread.id, { do: 'resolve', on: 'n1' });
    await wake();
    expect(told).toEqual([]);
  });
});

it('the supervisor runs it every tick', () => {
  const sup = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
  expect(sup).toMatch(/await this\.wakeForNotes\(now\);/);
});
