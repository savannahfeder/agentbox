// A HELPER'S WORDS THAT NAME A FILE SHOW ONCE ON THE THREAD THEY HELPED ON.
//
// A team tester asked to help on a teammate's thread typed one answer naming
// payment-failed-copy.md and pressed Send once. His window then showed two
// "You, To the agent" entries with the same words at the same minute, the
// second with a link to the file under it. The owner's ledger had the words
// once. What his window drew was his comment from the cloud and the owner's
// copy of it passed to her agent, which her copy published with a line linking
// the file it names, so the two no longer read as the same words and both were
// drawn. Measured on the in-memory cloud with two computers, the owner's copy
// passing the words to its thread as the app does (Store.tellItem).
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

async function aMac(cloud, personId, owner = false) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-words-once-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'web'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'web', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'web', name: 'Web app', seenBy: 'team' }));
  const mac = { personId, store: null, service: null };
  mac.store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const tellThread = owner ? (slug, id, o) => { mac.store.tellItem(slug, id, o); } : () => {};
  mac.service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store: mac.store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread });
  return { ...mac, dir: path.join(accountRoot, 'web') };
}

let cloud, priya, theo, jun;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@cf.test', name: 'Priya Shah' }), true);
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@cf.test', name: 'Theo Okafor' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@cf.test', name: 'Jun Ito' }));
  await priya.service.signIn();
  await priya.service.createTeam('Clinicflow');
  await priya.service.invite('theo@cf.test');
  await priya.service.invite('jun@cf.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(priya.service.state().team.id);
  await jun.service.signIn();
  await jun.service.acceptInvite(priya.service.state().team.id);
});
afterEach(async () => { disk.setLineAuthor(null); for (const m of [priya, theo, jun]) await m.service.signOut(); });

const all = async (n = 3) => { for (let k = 0; k < n; k += 1) for (const m of [priya, theo, jun]) await m.service.syncNow(); };

async function helping() {
  disk.setLineAuthor(priya.personId);
  fs.writeFileSync(path.join(priya.dir, 'payment-failed-copy.md'), '# Payment failed\n\nTry payment again.\n');
  const t = priya.store.composeItem('web', { title: 'Payment-failed screen copy', body: 'Write the copy.', visibility: 'team' });
  priya.store.recordSessionResult('web', t.id, { result: 'Saved payment-failed-copy.md. When can it say the appointment is still booked?' });
  await priya.service.syncNow();
  await priya.service.askTeammate({ product: 'web', id: t.id, to: theo.personId, kind: 'help', note: 'Tell my agent when it is safe.' });
  await all();
  return t;
}

const times = (work, words) => work.lines.filter((l) => [l.patch?.answer, l.patch?.comment?.text].some((s) => typeof s === 'string' && s.startsWith(words))).length;

describe('words a helper writes to the owner\'s agent', () => {
  it('show once when they name a file on the thread', async () => {
    const t = await helping();
    const words = 'Update payment-failed-copy.md. Say it is still booked only when the booking was confirmed.';
    disk.setLineAuthor(theo.personId);
    await theo.service.commentOnThread(priya.personId, t.id, words);
    await all();
    await all();
    const passed = priya.store.readHistory('web', t.id).filter((l) => l.patch?.answer === words);
    expect(passed).toHaveLength(1);
    expect(times(theo.service.threadWork(priya.personId, t.id), words)).toBe(1);
  });

  it('show once when they name no file', async () => {
    const t = await helping();
    const words = 'Only when the booking response confirmed it.';
    disk.setLineAuthor(theo.personId);
    await theo.service.commentOnThread(priya.personId, t.id, words);
    await all();
    await all();
    expect(times(theo.service.threadWork(priya.personId, t.id), words)).toBe(1);
  });

  it('leave a comment from someone else with the same words standing', async () => {
    const t = await helping();
    const words = 'Update payment-failed-copy.md. Keep both button labels.';
    disk.setLineAuthor(theo.personId);
    await theo.service.commentOnThread(priya.personId, t.id, words);
    await all();
    disk.setLineAuthor(jun.personId);
    await jun.service.commentOnThread(priya.personId, t.id, words);
    await all();
    await all();
    const work = theo.service.threadWork(priya.personId, t.id);
    expect(times(work, words)).toBe(2);
    expect(work.lines.filter((l) => l.patch?.comment?.text === words).map((l) => l.by)).toEqual([jun.personId]);
  });
});
