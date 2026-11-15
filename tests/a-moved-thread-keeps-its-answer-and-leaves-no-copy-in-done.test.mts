// A MOVED THREAD KEEPS ITS ANSWER AND LEAVES NO COPY IN DONE.
//
// Power test round 2, issues 25 and 35. A thread that had answered with
// "1 Ship it / 2 Change something first" was moved with More actions > Move to
// another project: the new thread showed only the first message, "Moved here
// from Infra." and Thinking. The answer and its options were gone and the agent
// had started over. A thread moved while queued ran in the new project, and the
// old project's Done list kept a DONE copy reading "Moved to Web app." beside
// the real one. Reproduced in a live copy on stand-ins (both), then measured
// here through the store's move, the ledger it writes and the list rules.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { leftByAMove, movedAway, movedHere } from '../shared/move-thread.mts';
import { answerSettled, stoppedByHer } from '../shared/answers.mts';
import { belongsInInbox } from '../renderer/src/list-rules.ts';
import { offerIsLive, itemOptions } from '../renderer/src/format.ts';

const OFFER = 'Worked on it. The audit found two routes with no auth check.\n\n## Options\n1. Ship it (recommended)\n2. Change something first\n3. Throw it away';

let store, root;
const project = (slug, name) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name }));
};
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-keeps-'));
  project('infra', 'Infra');
  project('data', 'Data');
  store = await new Store({ accountRoot: root, products: [] }).init();
});

const disk = () => store.modules.workItemsDisk;
// Minutes apart, starting after the thread is written (composeItem stamps it now).
let clock;
beforeEach(() => { clock = Date.now(); });
const tick = () => (clock += 60_000);
// An agent's answer the way a run writes it when it ends (main/store.mts recordSessionResult).
const agentAnswers = (id, result) => {
  disk().updateWorkItem(store.productDir('infra'), id, { result }, { source: 'agent', now: tick() });
  disk().updateWorkItem(store.productDir('infra'), id, { status: 'blocked' }, { source: 'system', now: clock });
};
const youReply = (id, answer) => {
  disk().updateWorkItem(store.productDir('infra'), id, { answer, status: 'open' }, { source: 'founder', now: tick() });
};
const settle = (id) => store.settleAnswer('infra', id, store.readItem('infra', id).wrote.answer.ts);
const turns = (slug, id) => store.readThread(slug, id).map((t) => [t.field, t.text, t.ts]);

function answeredThread() {
  const made = store.composeItem('infra', { title: "Nightly export is missing yesterday's rows again", model: 'opus' });
  agentAnswers(made.id, OFFER);
  return made;
}

describe('a thread an agent answered', () => {
  it('arrives with the answer and its options, waiting for you, not started over', () => {
    const made = answeredThread();
    const out = store.moveItem('infra', made.id, 'data');
    const landed = store.readItem('data', out.item.id);

    expect(landed.result).toBe(OFFER);
    expect(offerIsLive(landed)).toBe(true);
    expect(itemOptions(landed).map((o) => o.text)).toEqual(['Ship it (recommended)', 'Change something first', 'Throw it away']);
    expect(landed.status).toBe('blocked');
    expect(belongsInInbox(landed)).toBe(true);
    expect(landed.body).toBe(`Nightly export is missing yesterday's rows again\n\n${movedHere('Infra')}`);
    expect(landed.model).toBe('opus');
  });

  // A run that ends with the store tools on writes its answer and leaves the
  // status alone, so the row stays open (the live copy's thread did).
  it('is not started there on its own, whether it was left open or blocked', () => {
    const sup = new Supervisor({ storeRoot: root, authProfiles: ['default'], home: root }, store, root);
    for (const status of ['open', 'blocked']) {
      const made = store.composeItem('infra', { title: `Audit the API (${status})` });
      disk().updateWorkItem(store.productDir('infra'), made.id, { result: OFFER }, { source: 'agent', now: tick() });
      if (status === 'blocked') disk().updateWorkItem(store.productDir('infra'), made.id, { status }, { source: 'system', now: clock });
      youReply(made.id, 'Only the v2 routes.');
      settle(made.id);
      disk().updateWorkItem(store.productDir('infra'), made.id, { result: `Checked v2. ${OFFER}` }, { source: 'agent', now: tick() });
      if (status === 'blocked') disk().updateWorkItem(store.productDir('infra'), made.id, { status }, { source: 'system', now: clock });
      const landed = { ...store.readItem('data', store.moveItem('infra', made.id, 'data').item.id), product: 'data' };
      expect(landed.status, status).toBe(status);
      expect(sup._isFreshWork(landed, Date.now()), status).toBe(false);
      expect(answerSettled(landed), status).toBe(true);
      expect(belongsInInbox(landed), status).toBe(true);
    }
  });

  it('carries every message in the order and at the time it was said', () => {
    const made = answeredThread();
    youReply(made.id, 'Only the EU bucket, check that first.');
    settle(made.id);
    agentAnswers(made.id, 'The EU bucket was the one. Fixed the cron.');
    youReply(made.id, 'Does it backfill?');
    settle(made.id);
    agentAnswers(made.id, `It does now. ${OFFER}`);
    const before = turns('infra', made.id).filter(([field]) => field !== 'body');

    const out = store.moveItem('infra', made.id, 'data');
    const after = turns('data', out.item.id);
    expect(after.filter(([field]) => field !== 'body')).toEqual(before);
    expect(after[0][1]).toContain(movedHere('Infra'));
    const landed = store.readItem('data', out.item.id);
    expect(landed.status).toBe('blocked');
    expect(answerSettled(landed)).toBe(true);
  });

  it('a reply of yours still on its way goes on to the agent there, with the conversation before it', () => {
    const made = answeredThread();
    youReply(made.id, 'Change the retention to 30 days first.');
    const out = store.moveItem('infra', made.id, 'data');
    const landed = store.readItem('data', out.item.id);

    expect(landed.status).toBe('open');
    expect(landed.answer).toBe('Change the retention to 30 days first.');
    expect(answerSettled(landed)).toBe(false);
    expect(landed.result).toBe(OFFER);
    expect(offerIsLive(landed)).toBe(false);
  });

  it('a thread you stopped stays stopped there, the reply before your stop included', () => {
    const made = answeredThread();
    youReply(made.id, 'Rerun the export for the 6th.');
    disk().updateWorkItem(store.productDir('infra'), made.id, { status: 'blocked' }, { source: 'founder', now: tick() });
    const landed = store.readItem('data', store.moveItem('infra', made.id, 'data').item.id);
    expect(landed.status).toBe('blocked');
    expect(stoppedByHer(landed)).toBe(true);
  });

  it('a reply you took back leaves it waiting for you, as it was', () => {
    const made = answeredThread();
    youReply(made.id, 'Actually, hold on.');
    disk().updateWorkItem(store.productDir('infra'), made.id, { answer: '(withdrawn)', status: 'blocked' }, { source: 'founder', now: tick() });
    const landed = store.readItem('data', store.moveItem('infra', made.id, 'data').item.id);
    expect(landed.status).toBe('blocked');
    expect(offerIsLive(landed)).toBe(true);
  });

  it('one the app wrote on but no agent answered still runs there', () => {
    const made = store.composeItem('infra', { title: 'Rotate the staging keys' });
    disk().updateWorkItem(store.productDir('infra'), made.id, { note: 'Waiting for a free agent.' }, { source: 'system', now: tick() });
    const landed = store.readItem('data', store.moveItem('infra', made.id, 'data').item.id);
    expect(landed.status).toBe('open');
  });

  it('brings the record of the work it did', () => {
    const made = answeredThread();
    const traces = store.machineryFile('infra', path.join('sessions', made.id));
    fs.mkdirSync(traces, { recursive: true });
    fs.writeFileSync(path.join(traces, '1794000000000.log'), '06:07:01  [Read] src/export.js\n');
    const out = store.moveItem('infra', made.id, 'data');
    const there = store.machineryFile('data', path.join('sessions', out.item.id, '1794000000000.log'));
    expect(fs.readFileSync(there, 'utf8')).toContain('[Read] src/export.js');
  });
});

describe('a thread nothing has run on', () => {
  it('moves as before and runs there', () => {
    const made = store.composeItem('infra', { title: 'Add a /health endpoint to web app' });
    const out = store.moveItem('infra', made.id, 'data');
    const landed = store.readItem('data', out.item.id);
    expect(landed.status).toBe('open');
    expect(landed.body).toBe(`Add a /health endpoint to web app\n\n${movedHere('Infra')}`);
    expect(landed.result ?? null).toBe(null);
  });
});

describe('the row it leaves behind', () => {
  it('is in no list, whether the thread had run or not', () => {
    for (const made of [answeredThread(), store.composeItem('infra', { title: 'Add a /health endpoint' })]) {
      store.moveItem('infra', made.id, 'data');
      const left = store.readItem('infra', made.id);
      expect(left.status).toBe('done');
      expect(left.note).toBe(movedAway('Data'));
      expect(leftByAMove(left)).toBe(true);
    }
  });

  it('comes back when Z reopens it, and a close of yours after that is an ordinary close', () => {
    const made = answeredThread();
    store.moveItem('infra', made.id, 'data');
    disk().updateWorkItem(store.productDir('infra'), made.id, { status: 'open' }, { source: 'founder', now: Date.now() + 10 });
    expect(leftByAMove(store.readItem('infra', made.id))).toBe(false);
    disk().updateWorkItem(store.productDir('infra'), made.id, { status: 'done' }, { source: 'founder', now: Date.now() + 60_000 });
    expect(leftByAMove(store.readItem('infra', made.id))).toBe(false);
  });

  it('is never a thread you closed yourself, or one an agent wrote "Moved to" on', () => {
    const made = store.composeItem('infra', { title: 'Move the cron to staging' });
    expect(leftByAMove(store.answerItem('infra', made.id, { status: 'done' }))).toBe(false);
    const other = store.composeItem('infra', { title: 'Move the cron to staging' });
    const now = Date.now();
    disk().updateWorkItem(store.productDir('infra'), other.id, { note: 'Moved to staging.' }, { source: 'agent', now });
    disk().updateWorkItem(store.productDir('infra'), other.id, { status: 'done' }, { source: 'founder', now });
    expect(leftByAMove(store.readItem('infra', other.id))).toBe(false);
  });

  it('is left out of what the window is sent, the older pages of Done, and the phone', () => {
    const read = (file) => fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
    const ipc = read('main/ipc.mts');
    const snapshot = ipc.slice(ipc.indexOf("ipcMain.handle('zero:snapshot'"), ipc.indexOf("ipcMain.handle('zero:snapshot'") + 2500);
    expect(snapshot).toMatch(/items: supervisor\.withPlaces\(items\.filter\(\(i\) => !leftByAMove\(i\)\)\)/);
    const store2 = read('main/store.mts');
    const older = store2.slice(store2.indexOf('  listOlderItems('), store2.indexOf('  listOlderItems(') + 900);
    expect(older).toMatch(/!leftByAMove\(item\)/);
    expect(read('main/phone-inbox.mts')).toMatch(/threadsWorthCarrying\(listItems\(p\.slug\)\.filter\(\(i\) => !leftByAMove\(i\)\)/);
  });});
