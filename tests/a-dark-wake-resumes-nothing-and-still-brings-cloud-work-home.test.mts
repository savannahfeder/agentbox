// A DARK WAKE RESUMES NOTHING, AND STILL BRINGS CLOUD WORK HOME.
//
// The wake sweep (`recoverInterrupted('wake')`, eight seconds after macOS says
// it woke) put interrupted sessions back on their rows through spawnWorker.
// In a few-second dark wake with the lid shut that start dies at the next
// wake, the same death as the six runs of 2026-10-27 (tests/a-sleeping-mac-
// hands-its-waiting-threads-to-the-cloud). Asleep, the sweep now keeps each
// session's record and counts it waiting, so it is resumed once the Mac is
// awake. What the cloud started is still joined in a dark wake: joining
// writes a marker and fetches results, which pick up where they left off.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';

const MIN = 60_000;

function interrupted() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-dark-'));
  const row = { id: 'w-1', product: 'alpha', status: 'open', kind: 'task', labels: ['founder'], title: 'T', createdAt: 1, updatedAt: 1 };
  const store = { listItems: () => [row], listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: root }], isDue: () => true };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup._liveSessions = { 'w-1': { sessionId: 's-1', product: 'alpha', cwd: root, profile: 'default', engine: 'claude', continuation: false, startedAt: 1 } };
  sup.transcriptFile = () => __filename;
  sup.idleMs = () => 30 * MIN;
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ id: item.id, opts });
  return sup;
}

describe('the wake sweep', () => {
  it('in a dark wake keeps the session to resume and starts nothing', () => {
    const sup = interrupted();
    sup._lastTickAt = Date.now() - 16 * MIN;
    const out = sup.recoverInterrupted('wake');
    expect(sup.spawned).toEqual([]);
    expect(out.resumed).toBe(0);
    expect(sup._liveSessions['w-1']).toBeTruthy();
  });

  it('awake, resumes it as before', () => {
    const sup = interrupted();
    const out = sup.recoverInterrupted('wake');
    expect(sup.spawned.map((s) => [s.id, s.opts.resumeSessionId])).toEqual([['w-1', 's-1']]);
    expect(out.resumed).toBe(1);
  });
});

describe('the phone pass in a dark wake', () => {
  it('still joins a run the cloud started, so its work comes home', async () => {
    const cloud = createMemoryCloud();
    cloud.now = () => Date.parse('2026-10-27T09:00:00Z');
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const adopted = [];
    const inbox = createPhoneInbox({
      backend: mac, owner: me, device: 'a1b2c3d4e5f6', projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [], historyOf: () => [], apply: async () => ({ ok: true }),
      stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dark-')), 's.json'), now: cloud.now, kitsFor: () => true,
      adopt: async (a) => { adopted.push(a.runId); return 'adopted'; }, runHome: () => true,
      asleep: () => true, toCarry: async () => [],
    });
    const cmd = await mac.addPhoneCommand({ device: 'a1b2c3d4e5f6', project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'go' } });
    claimForTheCloud(cloud, cmd.id, 'run-1');
    await inbox.syncOnce();
    expect(adopted).toEqual(['run-1']);
  });
});
