// A CLOUD WITH NO ROOM SENDS THREADS BACK TO THE MAC, AND SAYS WHY.
//
// What broke (w-6633e825a7, found reading the code before the upgrade prompt
// was drawn): the cloud server refuses a start for someone with no plan, whose
// month's hours are spent, whose agents are all running, while the cloud is
// paused, or before the current terms are accepted. run.mjs ended every such
// refusal as exit 1, a failed run: the thread spent an attempt, the cloud
// counted a fault and rested after three, and after three more the thread
// was kept on this Mac for good. Someone signed in with no plan would have
// watched their threads fail.
//
// Now each refusal is its own exit (79). The thread goes back in the queue
// with no attempt spent, the cloud takes no new thread for a while (half a
// minute when the agents are full, five minutes otherwise) so the Mac runs
// them, nothing is counted against the cloud or the thread, and the cloud
// button says which it was. Seeing a paid plan ends a "no plan" wait at once.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { refusedForRoom, CLOUD_NO_ROOM } from '../main/cloud/run.mjs';

let tmp;
beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudroom-'))); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function supervisor() {
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns: 'full' }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp);
  sup._saveState = () => {};
  sup._cloudRoom = () => true;
  sup._cloudStarting = () => 0;
  return sup;
}
const refused = (error, message) => ({ cloud: true, engine: 'claude', sessionId: null, result: null, tail: ['session spawned', `stderr: agentbox cloud: ${refusedForRoom({ ok: false, error, message }).line}\n`] });

describe('the run, refused for room', () => {
  it('ends as its own exit for each refusal that is about the plan, and says which', () => {
    for (const error of ['plan', 'hours', 'agents', 'paused', 'terms']) {
      const r = refusedForRoom({ ok: false, error, message: 'Choose a cloud plan to run agents there.' });
      expect(r).toEqual({ code: CLOUD_NO_ROOM, line: `no room in the cloud (${error}): Choose a cloud plan to run agents there.` });
    }
    expect(CLOUD_NO_ROOM).toBe(79);
  });

  it('a refusal that is the cloud\'s own trouble is not one', () => {
    for (const error of ['bad-start', 'cloud', 'busy', undefined]) expect(refusedForRoom({ ok: false, error, message: 'x' })).toBe(null);
    expect(refusedForRoom(null)).toBe(null);
  });
});

describe('the supervisor, told there is no room', () => {
  it('takes no new thread to the cloud, and the button says why', () => {
    const sup = supervisor();
    expect(sup._cloudSlotFor('claude')).toBe(true);
    const s = refused('plan', 'Choose a cloud plan to run agents there.');
    sup._noteCloudNoRoom(s, CLOUD_NO_ROOM);
    expect(sup._cloudSlotFor('claude')).toBe(false);
    expect(sup.cloudStatus().noRoom).toEqual({ error: 'plan', message: 'Choose a cloud plan to run agents there.' });
  });

  it('spends no attempt on the thread, counts no fault against the cloud, and does not keep the thread on the Mac', () => {
    const sup = supervisor();
    const item = { id: 'w-1', product: 'p' };
    for (let i = 0; i < 5; i += 1) {
      const s = refused('hours', 'This month\'s 400 cloud hours are used.');
      sup._noteCloudNoRoom(s, CLOUD_NO_ROOM);
      sup._noteCloudOutcome(s, CLOUD_NO_ROOM);
      expect(sup._cloudKeptOnMac(item, s, CLOUD_NO_ROOM)).toBe(false);
      expect(s.handedBack).toBe(true);
    }
    expect(sup.cloudStatus()).toMatchObject({ health: 'ok', lastError: null });
    expect(sup.threadOnMac[item.id]).toBeUndefined();
    expect(sup._handedBack?.has(item.id) ?? false).toBe(false);
  });

  it('waits half a minute when the agents are full, and five minutes otherwise', () => {
    const sup = supervisor();
    sup._noteCloudNoRoom(refused('agents', 'All 10 of your cloud agents are running.'), CLOUD_NO_ROOM);
    const full = sup._cloudNoRoom.until - Date.now();
    expect(full).toBeGreaterThan(25_000);
    expect(full).toBeLessThanOrEqual(30_000);
    sup._noteCloudNoRoom(refused('plan', 'Choose a cloud plan to run agents there.'), CLOUD_NO_ROOM);
    const plan = sup._cloudNoRoom.until - Date.now();
    expect(plan).toBeGreaterThan(4.5 * 60_000);
    expect(plan).toBeLessThanOrEqual(5 * 60_000);
  });

  it('takes threads again once the wait is over', () => {
    const sup = supervisor();
    sup._noteCloudNoRoom(refused('paused', 'The cloud is not starting new runs right now.'), CLOUD_NO_ROOM);
    sup._cloudNoRoom.until = Date.now() - 1;
    expect(sup._cloudSlotFor('claude')).toBe(true);
    expect(sup.cloudStatus().noRoom).toBe(null);
  });

  it('a paid plan seen ends a wait for a plan at once; no plan, or a wait for hours, is left', () => {
    const sup = supervisor();
    sup._noteCloudNoRoom(refused('plan', 'Choose a cloud plan to run agents there.'), CLOUD_NO_ROOM);
    sup.cloudPlanSeen({ plan: 'none' });
    expect(sup._cloudSlotFor('claude')).toBe(false);
    sup.cloudPlanSeen({ plan: 'pro' });
    expect(sup._cloudSlotFor('claude')).toBe(true);
    sup._noteCloudNoRoom(refused('hours', 'This month\'s 400 cloud hours are used.'), CLOUD_NO_ROOM);
    sup.cloudPlanSeen({ plan: 'pro' });
    expect(sup._cloudSlotFor('claude')).toBe(false);
  });

  it('any other exit is not a refusal for room', () => {
    const sup = supervisor();
    const s = refused('plan', 'x');
    for (const code of [0, 1, 75, 77, 78]) sup._noteCloudNoRoom(s, code);
    expect(sup._cloudNoRoom ?? null).toBe(null);
    expect(s.handedBack).toBeUndefined();
    sup._noteCloudNoRoom({ ...s, cloud: false }, CLOUD_NO_ROOM);
    expect(sup._cloudNoRoom ?? null).toBe(null);
  });
});
