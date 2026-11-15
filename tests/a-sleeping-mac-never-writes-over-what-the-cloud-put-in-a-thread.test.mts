// A SLEEPING MAC NEVER WRITES OVER WHAT THE CLOUD PUT IN A THREAD.
//
// What broke, 2026-10-31 (w-3e955eadb4): with her Mac shut she sent "How's it
// going? Can you share any screenshots of progress?" from the phone at 11:41am.
// The cloud server took it at 11:42, answered at 11:43 and wrote her words and
// its answer into the thread's copy online (cloud/gateway/phone.mjs
// `relayTurn`). Her Mac, in one of a sleeping Mac's short wakes, could not
// make that run its own yet ('busy': another cloud run on the thread had not
// come home), so its ledger did not have the reply, and it sent its own copy
// of the thread anyway because the run's line had moved. That copy replaced
// the cloud's, and her message and the answer were gone from the phone until
// the Mac woke at 3:29pm.
//
// Now, while a run the cloud took one of her replies into has not come home,
// her Mac leaves that thread's copy to the cloud, for twelve hours at most.
// Measured with the in-memory cloud and the phone inbox's own passes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';

const NOW = Date.parse('2026-10-31T21:41:00Z');
const DEV = 'a1b2c3d4e5f6';
const HOUR = 3600_000;
const TEXT = 'How’s it going? Can you share any screenshots of progress?';

function world({ adoptAs = () => 'busy', home = () => false } = {}) {
  const cloud = createMemoryCloud();
  let clock = NOW;
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-held-'));
  // The other run on the thread, moved to the cloud from the Mac: its line moves every pass.
  let step = 0;
  const lines = [{ id: 'w-1', ts: NOW - 5000, source: 'agent', patch: { result: 'Moved to the cloud.' } }];
  const inbox = createPhoneInbox({
    backend: mac, owner: me, device: DEV, projects: () => [{ slug: 'alpha', name: 'Alpha' }, { slug: 'beta', name: 'Beta' }],
    listItems: () => [{ id: 'w-1', title: 'Multiplayer', status: 'claimed', updatedAt: NOW - 5000 }],
    historyOf: (s, id) => lines.map((l) => ({ ...l, id })),
    liveOf: () => ({ since: NOW - HOUR, where: 'cloud', runId: 'moved-run', doing: [{ label: `step ${(step += 1)}`, startedAt: clock }] }),
    apply: async () => ({ ok: true }),
    stateFile: path.join(dir, 's.json'), now: () => clock,
    kitsFor: () => true,
    adopt: async (a) => adoptAs(a),
    cloudReplies: async () => {},
    runHome: (a) => home(a),
  });
  const copy = async (project = 'alpha') => (await phone.phoneThreads()).find((t) => t.project === project && t.item === 'w-1')?.snapshot;
  // What the cloud server writes when its run answers (shared/phone-snapshot.mts withCloudTurn).
  const cloudAnswers = async () => {
    const key = `${me}:${DEV}:alpha:w-1`;
    const t = cloud.phoneThreads.get(key);
    const history = [...t.snapshot.history,
      { id: 'w-1', ts: NOW, source: 'founder', patch: { answer: TEXT, status: 'open' } },
      { id: 'w-1', ts: NOW + 120_000, source: 'agent', patch: { result: 'Going well, here are the screens.' } }];
    cloud.phoneThreads.set(key, { ...t, snapshot: { ...t.snapshot, history }, updatedAt: clock });
  };
  return { cloud, phone, inbox, lines, copy, cloudAnswers, tick: (ms) => { clock += ms; } };
}
const says = (snap) => (snap?.history ?? []).map((l) => l.patch.answer ?? l.patch.result);

describe('a thread the cloud answered while its run is not home', () => {
  it('keeps the cloud\'s copy, her message and the answer, through the Mac\'s next passes (the reported case)', async () => {
    const w = world();
    await w.inbox.syncOnce();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: TEXT } });
    expect(claimForTheCloud(w.cloud, cmd.id, 'run-1')).toBe(true);
    await w.cloudAnswers();
    for (let i = 0; i < 3; i += 1) { w.tick(3 * 60_000); await w.inbox.syncOnce(); }
    expect(says(await w.copy())).toContain(TEXT);
    expect(says(await w.copy())).toContain('Going well, here are the screens.');
  });

  it('still sends the Mac\'s copy once the run is home and her words are on its row', async () => {
    let isHome = false;
    const w = world({ adoptAs: () => (isHome ? 'adopted' : 'busy'), home: () => isHome });
    await w.inbox.syncOnce();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: TEXT } });
    claimForTheCloud(w.cloud, cmd.id, 'run-1');
    await w.cloudAnswers();
    isHome = true;
    w.lines.push({ id: 'w-1', ts: NOW + 9 * 60_000, source: 'founder', patch: { answer: TEXT } }, { id: 'w-1', ts: NOW + 9 * 60_000, source: 'agent', patch: { result: 'Home now.' } });
    w.tick(10 * 60_000);
    await w.inbox.syncOnce();
    expect(says(await w.copy())).toContain('Home now.');
  });

  it('lets go after twelve hours, so a run that never comes home cannot freeze the thread', async () => {
    const w = world();
    await w.inbox.syncOnce();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: TEXT } });
    claimForTheCloud(w.cloud, cmd.id, 'run-1');
    await w.cloudAnswers();
    w.lines.push({ id: 'w-1', ts: NOW + 13 * HOUR, source: 'agent', patch: { result: 'Much later.' } });
    w.tick(13 * HOUR);
    await w.inbox.syncOnce();
    expect(says(await w.copy())).toContain('Much later.');
  });

  it('holds only that thread: the others still go up', async () => {
    const w = world();
    await w.inbox.syncOnce();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: TEXT } });
    claimForTheCloud(w.cloud, cmd.id, 'run-1');
    await w.cloudAnswers();
    w.lines.push({ id: 'w-1', ts: NOW + 60_000, source: 'agent', patch: { result: 'Newer on the Mac.' } });
    w.tick(3 * 60_000);
    await w.inbox.syncOnce();
    // The same thread id in another project is another thread.
    expect(says(await w.copy('beta'))).toContain('Newer on the Mac.');
    expect(says(await w.copy('alpha'))).not.toContain('Newer on the Mac.');
  });

  it('is not held for a reply this computer took itself', async () => {
    const w = world();
    await w.inbox.syncOnce();
    await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'from the phone, computer awake' } });
    w.lines.push({ id: 'w-1', ts: NOW + 60_000, source: 'agent', patch: { result: 'Newer on the Mac.' } });
    w.tick(60_000);
    await w.inbox.syncOnce();
    expect(says(await w.copy())).toContain('Newer on the Mac.');
  });
});
