// THE COMPUTER NEVER DOES A REPLY THE CLOUD TOOK, AND JOINS ITS RUN ON WAKING.
//
// With the lid shut, a reply from the phone is started in the cloud by the
// cloud server, which claims the command `cloud:<run id>` (shared/cloud-kit.mjs).
// Before this, a computer reading a claimed, untaken command took it for its
// own claim from before a restart ('ours') and did it again: the same reply
// twice, once in the cloud and once here. Now a cloud claim is never done or
// claimed here; on waking the computer makes the cloud's run the thread's own
// once (Supervisor#adoptCloudRun), marks the command taken, and says on each
// project whether its threads carry on in the cloud. Measured with the
// in-memory cloud and the phone inbox's own passes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const DEV = 'a1b2c3d4e5f6';

function world({ adoptAs = () => 'adopted', kits = () => true, home = () => true } = {}) {
  const cloud = createMemoryCloud();
  let clock = NOW;
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-cloud-'));
  const applied = []; const adopted = []; const carried = []; const more = [];
  const inbox = createPhoneInbox({
    backend: mac, owner: me, device: DEV, projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [{ id: 'w-1', title: 'Ship it', status: 'blocked', updatedAt: NOW - 5000 }],
    historyOf: (s, id) => [{ id, ts: NOW - 5000, source: 'agent', patch: { result: 'Ready?' } }],
    apply: async (cmd) => { applied.push(cmd); return { ok: true }; },
    stateFile: path.join(dir, 's.json'), now: () => clock,
    carrying: (c) => carried.push(c),
    kitsFor: kits,
    adopt: async (a) => { adopted.push(a); return adoptAs(a); },
    cloudReplies: async (a) => { more.push(a); },
    runHome: (a) => home(a),
  });
  return { cloud, mac, phone, inbox, applied, adopted, carried, more, tick: (ms) => { clock += ms; } };
}

describe('a reply the cloud took', () => {
  it('is never done or claimed by this computer', async () => {
    const w = world({ adoptAs: () => 'busy' });
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } });
    expect(claimForTheCloud(w.cloud, cmd.id, 'run-1')).toBe(true);
    await w.inbox.syncOnce();
    expect(w.applied).toEqual([]);
    const row = (await w.phone.phoneCommands()).find((c) => c.id === cmd.id);
    expect(row).toMatchObject({ claimedBy: 'cloud:run-1', takenAt: null });
  });

  it('is never claimed here even when the cloud claims it between the read and the claim', async () => {
    const w = world();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } });
    const read = w.mac.waitingPhoneCommands.bind(w.mac);
    w.mac.waitingPhoneCommands = async (d) => { const rows = await read(d); claimForTheCloud(w.cloud, cmd.id, 'run-2'); return rows; };
    await w.inbox.syncOnce();
    expect(w.applied).toEqual([]);
    // Joined as the cloud's, not done as this computer's.
    expect(w.adopted.map((a) => a.runId)).toEqual(['run-2']);
  });

  it('a claim the cloud holds answers as the cloud\'s', async () => {
    const w = world();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } });
    claimForTheCloud(w.cloud, cmd.id, 'run-7');
    expect(await w.mac.claimPhoneCommand(cmd.id)).toBe('cloud');
  });

  it('a reply nobody took is still done here, as before', async () => {
    const w = world();
    await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } });
    await w.inbox.syncOnce();
    expect(w.applied.map((c) => c.payload.text)).toEqual(['yes']);
    expect(w.adopted).toEqual([]);
  });
});

describe('waking up', () => {
  it('makes the cloud\'s run the thread\'s own once, with her words, and marks the command taken', async () => {
    const w = world();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes, go ahead' } });
    claimForTheCloud(w.cloud, cmd.id, 'run-1');
    await w.inbox.syncOnce();
    expect(w.adopted).toEqual([{ project: 'alpha', item: 'w-1', runId: 'run-1', replies: ['yes, go ahead'], commands: [cmd.id] }]);
    expect((await w.phone.phoneCommands())[0]).toMatchObject({ outcome: 'done' });
    await w.inbox.syncOnce();
    expect(w.adopted).toHaveLength(1);
  });

  it('a command the server already marked taken is still joined once', async () => {
    const w = world();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'go' } });
    claimForTheCloud(w.cloud, cmd.id, 'run-3');
    await w.mac.markPhoneCommand(cmd.id, 'answered in the cloud');
    await w.inbox.syncOnce();
    expect(w.adopted.map((a) => a.runId)).toEqual(['run-3']);
    expect((await w.phone.phoneCommands())[0].outcome).toBe('answered in the cloud');
  });

  it('waits while other cloud work here is coming home, and joins it once that is done', async () => {
    let busy = true;
    const w = world({ adoptAs: () => (busy ? 'busy' : 'adopted') });
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'go' } });
    claimForTheCloud(w.cloud, cmd.id, 'run-4');
    await w.inbox.syncOnce();
    expect((await w.phone.phoneCommands())[0].takenAt).toBeNull();
    busy = false;
    await w.inbox.syncOnce();
    expect(w.adopted).toHaveLength(2);
    expect((await w.phone.phoneCommands())[0].takenAt).not.toBeNull();
  });

  it('lets a run go after a few failed tries rather than trying for ever', async () => {
    const w = world({ adoptAs: () => { throw new Error('disk full'); } });
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'go' } });
    claimForTheCloud(w.cloud, cmd.id, 'run-5');
    for (let i = 0; i < 6; i += 1) await w.inbox.syncOnce();
    expect(w.adopted).toHaveLength(3);
  });

  it('looks back a week, not for ever', async () => {
    const w = world();
    const cmd = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'old' } });
    claimForTheCloud(w.cloud, cmd.id, 'run-6');
    w.tick(8 * 24 * 3600_000);
    await w.inbox.syncOnce();
    expect(w.adopted).toEqual([]);
  });
});

describe('a run the server kept open for her follow-ups', () => {
  it('is joined once, with every reply it took on the row in order', async () => {
    const w = world();
    const ids = [];
    for (const text of ['first', 'second', 'third']) {
      const c = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text } });
      claimForTheCloud(w.cloud, c.id, 'run-8');
      ids.push(c.id);
      w.tick(1000);
    }
    await w.inbox.syncOnce();
    expect(w.adopted).toEqual([{ project: 'alpha', item: 'w-1', runId: 'run-8', replies: ['first', 'second', 'third'], commands: ids }]);
  });

  it('a reply the server fed it after the computer joined still goes on the row, once', async () => {
    const w = world({ home: () => false });
    const first = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'first' } });
    claimForTheCloud(w.cloud, first.id, 'run-9');
    await w.inbox.syncOnce();
    const late = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'late' } });
    claimForTheCloud(w.cloud, late.id, 'run-9');
    await w.inbox.syncOnce();
    await w.inbox.syncOnce();
    expect(w.adopted).toHaveLength(1);
    expect(w.more).toEqual([{ project: 'alpha', item: 'w-1', runId: 'run-9', replies: ['late'] }]);
  });

  it('each of its commands is marked taken once the run is home, not before', async () => {
    let home = false;
    const w = world({ home: () => home });
    for (const text of ['a', 'b']) {
      const c = await w.phone.addPhoneCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text } });
      claimForTheCloud(w.cloud, c.id, 'run-10');
    }
    await w.inbox.syncOnce();
    expect((await w.phone.phoneCommands()).map((c) => c.takenAt)).toEqual([null, null]);
    home = true;
    await w.inbox.syncOnce();
    expect((await w.phone.phoneCommands()).every((c) => c.outcome === 'done')).toBe(true);
  });
});

describe('what the phone is told', () => {
  it('which projects carry on in the cloud, and the supervisor which are on the phone', async () => {
    const w = world();
    await w.inbox.syncOnce();
    expect((await w.phone.phoneProjects())[0]).toMatchObject({ project: 'alpha', cloud: true });
    expect(w.carried.at(-1)).toEqual({ device: DEV, slugs: ['alpha'] });
  });

  it('a project whose threads do not carry on says so', async () => {
    const w = world({ kits: () => false });
    await w.inbox.syncOnce();
    expect((await w.phone.phoneProjects())[0].cloud).toBe(false);
  });
});
