// A TASK HAS ONE NAME ON BOTH COMPUTERS (2026-11-12).
//
// A tester gave his teammate a task and found it under three names: "Take
// this web app bug" in his chat line, "Cancel button auth headers" in the
// thread, and "Appointment cancel auth header" on the Team page; when she
// handed it to an agent the new thread was "Theo Okafor asked:". Measured in
// the code: the app's namer writes a row's name once on each computer, a
// name was not among the things that travel with a conversation's lines
// (shared/team-rules whatATeammateMaySet), so each side named the shared
// task itself; and a hand-off to an agent took its title from its first
// line, which was who asked.
//
// Now the name travels with the task, only the computer of the person who
// made the task names it, and the thread a task is handed to an agent in
// takes the task's name and says who asked under it.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { isGivenTask, whatATeammateMaySet } from '../shared/team-rules.mts';
import { shownTitle } from '../shared/thread-title.mts';
import { wantsName } from '../main/row-label.mts';
import { taskHandOff } from '../renderer/src/threads/composer-rules.ts';
import { splitMessage } from '../renderer/src/message-split.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('what travels with a line', () => {
  const line = { id: 'w-1', ts: 1, source: 'agent', by: 'u-theo', uid: 'l-1', patch: { label: 'Cancel button auth headers' } };
  it('a name does, in a conversation', () => {
    expect(whatATeammateMaySet(line, { direct: true })?.patch).toEqual({ label: 'Cancel button auth headers' });
  });
  it('a name does not, in a shared project, where each thread has one owner', () => {
    expect(whatATeammateMaySet(line)).toBeNull();
  });
});

describe('who names a row', () => {
  const task = { status: 'open', title: 'Take this web app bug', body: 'Lena, can you take this web app bug?', createdBy: 'u-theo', assignee: 'u-lena', people: ['u-theo', 'u-lena'] };
  it('the computer of the person who made a task, not the one it was given to', () => {
    expect(wantsName(task, 'u-theo')).toBe(true);
    expect(wantsName(task, 'u-lena')).toBe(false);
  });
  it('your own thread, a thread with no maker, and any row when nobody is signed in, as before', () => {
    expect(wantsName({ status: 'open', title: 'Fix the header', createdBy: 'u-lena' }, 'u-lena')).toBe(true);
    expect(wantsName({ status: 'open', title: 'Fix the header' }, 'u-lena')).toBe(true);
    expect(wantsName(task)).toBe(true);
    expect(wantsName(task, null)).toBe(true);
  });
  it('the supervisor tells the namer who is signed in', () => {
    expect(read('main/supervisor.mts')).toContain('wantsName(i, this.store.author?.() ?? null)');
  });
});

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'one-name-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

describe('across two computers', () => {
  let cloud, theo, lena;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
    lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }));
    await theo.service.signIn();
    await theo.service.createTeam('Northwind');
    await theo.service.invite('lena@nw.test');
    await lena.service.signIn();
    await lena.service.acceptInvite(theo.service.state().team.id);
    disk.setLineAuthor(theo.personId);
  });
  afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await lena.service.signOut(); });
  const sync = async () => { for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); } };
  const taskOn = (mac) => mac.store.listItems().find((i) => isGivenTask(i, mac.store.listProducts().find((p) => p.slug === i.product)));

  it('the name its maker\'s computer wrote is the name on the other one', async () => {
    await theo.service.giveTask(lena.personId, { title: 'Take this web app bug', body: 'Lena, can you take this web app bug? The cancel button sends no token.' });
    await sync();
    const mine = taskOn(theo);
    theo.store.nameItem(mine.product, mine.id, 'Cancel button auth headers');
    await sync();
    expect(shownTitle(taskOn(theo))).toBe('Cancel button auth headers');
    expect(shownTitle(taskOn(lena))).toBe('Cancel button auth headers');
    expect(wantsName(taskOn(lena), lena.personId)).toBe(false);
  });
});

describe('a task handed to an agent', () => {
  const start = taskHandOff({ from: 'Theo Okafor', brief: { title: 'Cancel button auth headers', body: 'Lena, can you take this web app bug?', files: [] }, message: null, nameOf: () => 'Theo' });
  it('opens a thread that takes the task\'s name and says who asked under it', () => {
    expect(start.named).toBe('Cancel button auth headers');
    expect(splitMessage(start.body)).toEqual({ title: 'Cancel button auth headers', body: 'Theo Okafor asked:\n\nLena, can you take this web app bug?' });
  });
  it('is as it was for a task with no name, and for one message pressed inside a task', () => {
    const bare = taskHandOff({ from: 'Theo Okafor', brief: { body: 'Take the bug.', files: [] }, message: null, nameOf: () => 'Theo' });
    expect(bare.named).toBeUndefined();
    expect(bare.body).toBe('Theo Okafor asked:\n\nTake the bug.\n\n');
    const one = taskHandOff({ from: 'Theo Okafor', brief: { title: 'Cancel button auth headers', body: 'Take the bug.', files: [] }, message: { text: 'Which header is it?', by: 'u-theo' }, nameOf: () => 'Theo' });
    expect(one.named).toBeUndefined();
    expect(one.body).toBe('Theo wrote: Which header is it?\n\n');
  });
  it('keeps that name: the composer sends it as the thread\'s name while the first line still says it', () => {
    const composer = read('renderer/src/threads/ThreadComposer.tsx');
    expect(composer).toContain('...(initial?.named && message.title === initial.named ? { label: initial.named } : {}),');
    expect(read('main/ipc.mts')).toContain('if (typeof label === \'string\' && label.trim() && out?.id) store.nameItem(product, out.id, label);');
  });
});
