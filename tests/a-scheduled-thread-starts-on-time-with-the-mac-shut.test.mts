// A SCHEDULED THREAD STARTS ON TIME WITH THE MAC SHUT.
//
// The daily analytics report was due overnight on 2026-10-27 with the lid
// shut. Handing waiting rows to the cloud in a dark wake (tests/a-sleeping-mac-
// hands-its-waiting-threads-to-the-cloud) only reaches a row once it is due,
// and only if the Mac wakes again: on battery a shut Mac can go an hour or
// more between wakes, and a flat one never does. And the cloud server turned
// down a thread started on the phone for a later time ("it is to start later").
//
// Now a sleeping Mac also hands over what comes due in the next twelve hours,
// each with the moment it may start: rows set to start later, and the next
// run of each repeating task under the id that run will have. The server
// starts each at its moment, and a thread from the phone set for a time too.
// A hand-over left more than twelve hours is taken back and written again, so
// none goes stale past the day the server looks back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_VERSION, NEW_ITEM_MARK, NEW_TITLE_MARK, NEW_BODY_MARK, NEW_THREAD, newThreadKitKey } from '../shared/cloud-kit.mts';
import { CARRIED, CARRY_AHEAD_MS } from '../shared/cloud-carry.mts';
import { occurrenceId, periodKey, nextRunAt } from '../shared/repeats.mts';
import { occurrenceFields } from '../main/repeats.mts';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { Supervisor } from '../main/supervisor.mts';
import { kitCopyPath } from '../main/cloud/kit.mts';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const HOUR = 60 * MIN;
const SHA = 'c'.repeat(40);

/* ------------------------------ the server ------------------------------ */

const projectKit = (t) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: '_new',
  cwd: `/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`, branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA,
  argv: ['claude', '-p'], env: { ZERO_ITEM: NEW_ITEM_MARK },
  bundleKey: `runs/kits/${DEVICE}/alpha/_new/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: `/Users/me/.claude/projects/-x-${NEW_ITEM_MARK}` }],
  frame: { before: `Item ${NEW_ITEM_MARK}: `, after: '' },
  marker: { branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA, sent: { branch: `agentbox/${NEW_ITEM_MARK}`, head: SHA, tree: 't', index: 't' }, toolEnv: {}, engine: 'claude' },
  newThread: { mainSha: SHA, brief: `Item ${NEW_ITEM_MARK}\n${NEW_TITLE_MARK}\n${NEW_BODY_MARK}`, model: null, effort: null },
});

function fakeDb() {
  const commands = [];
  return {
    commands,
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, owner: A, device: DEVICE, project: 'alpha', item: null, ...c, created_at: new Date(c.created_at).toISOString() }); },
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => ['reply', 'new', 'run-now'].includes(c.kind) && !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken() {}, async thread() { return null; }, async writeThread() {}, async newThread() {},
    async pushDevices() { return []; }, async dropPushDevice() {},
  };
}

async function server() {
  let clock = Date.UTC(2026, 9, 27, 7, 0, 0);
  const sent = [];
  const objects = memoryObjects();
  const db = fakeDb();
  const gw = createGateway({
    agentcore: { async invoke(sessionId, payload) { sent.push({ sessionId, payload }); return payload.action === 'events' ? { ok: true, state: 'running', events: [], more: false } : { ok: true }; }, async stop() {} },
    links: { get: async (k) => `g/${k}`, put: async (k) => `p/${k}`, head: async (k) => `h/${k}` },
    removeObject: async () => {}, objects,
    whoIs: async (tok) => (tok === 'session-of-a' ? { id: A } : null),
    now: () => clock, plans: { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } }, log: () => {},
    phone: { db, runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) }, sendPush: async (m) => m.map(() => ({ status: 'ok' })) },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  await objects.put(`runs/u-${A}/${newThreadKitKey(DEVICE, 'alpha').slice('runs/'.length)}`, JSON.stringify(projectKit(clock)));
  return { gw, db, now: () => clock, tick: (ms) => { clock += ms; }, starts: () => sent.filter((s) => s.payload?.action === 'start') };
}

describe('the cloud server and a hand-over with a time', () => {
  it('waits for its moment, then starts it', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000001', kind: 'run-now', item: 'r-daily-20261027', payload: { carried: CARRIED, title: 'Daily report', body: '', notBefore: t.now() + 3 * HOUR }, created_at: t.now() - MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
    t.tick(3 * HOUR);
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.starts()[0].payload.env.ZERO_ITEM).toBe('r-daily-20261027');
  });

  it('starts one whose moment has passed at once', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000002', kind: 'run-now', item: 'w-1', payload: { carried: CARRIED, title: 'T', body: '', notBefore: t.now() - MIN }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
  });

  it('starts a thread from the phone set for a time, at that time', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000003', kind: 'new', payload: { title: 'Morning check', body: '', runAt: t.now() + 2 * HOUR }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
    t.tick(2 * HOUR);
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
  });

  it('still leaves a thread from the phone put off to Later with no time', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000004', kind: 'new', payload: { title: 'Someday', body: '', start: 'later' }, created_at: t.now() - 2 * MIN });
    t.tick(10 * HOUR);
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
  });
});

/* ------------------------------ the supervisor ------------------------------ */

const kit = (over = {}) => ({ v: 1, engine: 'claude', project: 'alpha', cwd: '/x', marker: {}, item: NEW_THREAD, newThread: { model: null, effort: null }, ...over });
const fresh = (id, extra = {}) => ({ id, product: 'alpha', status: 'open', kind: 'task', labels: ['founder'], title: `Task ${id}`, createdAt: 1000, updatedAt: 1000, ...extra });

function handing(items, { rules = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-ahead-'));
  const served = [];
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: root }],
    isDue: (i, now = Date.now()) => !i?.runAt || i.runAt <= now,
    readItem: (slug, id) => items.find((i) => i.id === id) ?? null,
    repeats: { due: () => [], list: () => rules, serve: async (dir, rule, key) => { served.push([rule, key]); return { occurrenceId: occurrenceId(rule, key) }; } },
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup.spawnWorker = () => {};
  sup.idleMs = () => 30 * MIN;
  sup._phoneCarries = { device: DEVICE, slugs: new Set(['alpha']) };
  sup.leavesKitsFor = (slug) => slug === 'alpha';
  fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
  fs.writeFileSync(kitCopyPath(root, 'alpha', NEW_THREAD), JSON.stringify(kit()));
  sup._lastTickAt = Date.now() - 16 * MIN;
  return { sup, served, root };
}

describe('what a sleeping Mac hands over ahead of time', () => {
  it('a row set to start within twelve hours, with its moment', async () => {
    const at = Date.now() + 3 * HOUR;
    const { sup } = handing([fresh('w-1', { runAt: at })]);
    const list = await sup.carryWhileAsleep();
    expect(list).toEqual([expect.objectContaining({ item: 'w-1', kind: 'run-now', payload: expect.objectContaining({ notBefore: at }) })]);
  });

  it('not one set for further ahead than that', async () => {
    const { sup } = handing([fresh('w-1', { runAt: Date.now() + CARRY_AHEAD_MS + HOUR })]);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('the next run of a repeating task, under the id and with the words that run will have', async () => {
    const soon = new Date(Date.now() + 2 * HOUR);
    const rule = { id: 'r-daily', title: 'Daily report', body: 'Count the installs.', every: 'day', at: `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`, priority: 5 };
    const { sup } = handing([], { rules: [rule] });
    const due = nextRunAt(rule, Date.now());
    const key = periodKey(rule, due);
    const list = await sup.carryWhileAsleep();
    const words = occurrenceFields(rule, key);
    expect(list).toEqual([{
      project: 'alpha', item: occurrenceId('r-daily', key), kind: 'run-now',
      payload: { carried: CARRIED, title: words.title, body: words.body, engine: 'claude', notBefore: due, repeat: { rule: 'r-daily', key } },
    }]);
  });

  it('not a repeating task that has ended, or one whose next run is a day away', async () => {
    const later = new Date(Date.now() - 2 * HOUR);
    const at = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
    const { sup } = handing([], { rules: [
      { id: 'r-ended', title: 'Old', every: 'day', at: '09:00', endedAt: 1 },
      { id: 'r-far', title: 'Far', every: 'day', at },
    ] });
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  // CARRY_AGAIN_MS, and why it is half an hour rather than the twelve it was:
  // tests/a-reply-the-cloud-could-not-start-is-handed-over-again.
  it('a hand-over the cloud has not started in half an hour is written again, replacing the old one', async () => {
    const { sup } = handing([fresh('w-1')]);
    sup._carried['w-1'] = { command: 'c-old', kind: 'run-now', at: Date.now() - 31 * MIN };
    const list = await sup.carryWhileAsleep();
    expect(list).toEqual([expect.objectContaining({ item: 'w-1', replaces: 'c-old' })]);
  });

  it('one written in the last half hour is not written again', async () => {
    const { sup } = handing([fresh('w-1')]);
    sup._carried['w-1'] = { command: 'c-new', kind: 'run-now', at: Date.now() - 20 * MIN };
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });
});

describe('waking, a repeating task\'s run the cloud started', () => {
  it('is made the way the repeat makes it, then joined', async () => {
    const { sup, served } = handing([]);
    await sup.adoptCloudNewThread({ product: 'alpha', itemId: 'r-daily-20261027', runId: 'run-1', title: 'Daily report', carried: true, repeat: { rule: 'r-daily', key: '2026-10-27' } });
    expect(served).toEqual([['r-daily', '2026-10-27']]);
  });
});

/* ------------------------------ the phone pass ------------------------------ */

function world() {
  const cloud = createMemoryCloud();
  const NOW = Date.parse('2026-10-27T09:00:00Z');
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahead-'));
  const toCarry = [];
  const handed = []; const back = []; const adoptedNew = [];
  const inbox = createPhoneInbox({
    backend: mac, owner: me, device: DEVICE, projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [], historyOf: () => [], apply: async () => ({ ok: true }),
    stateFile: path.join(dir, 's.json'), now: () => NOW, kitsFor: () => true,
    adoptNew: async (a) => { adoptedNew.push(a); return 'adopted'; }, adopt: async () => 'adopted', runHome: () => true,
    asleep: () => true, toCarry: async () => toCarry.splice(0), handedOver: (c) => handed.push(c), takenBack: (c) => back.push(c),
  });
  return { cloud, mac, inbox, toCarry, handed, back, adoptedNew };
}

describe('the phone pass writing a hand-over again', () => {
  it('marks the old one taken before writing the new one', async () => {
    const w = world();
    const old = await w.mac.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'T' } });
    w.toCarry.push({ project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'T' }, replaces: old.id });
    await w.inbox.syncOnce();
    const cmds = await w.mac.phoneCommands();
    expect(cmds.find((c) => c.id === old.id)).toMatchObject({ outcome: 'done' });
    expect(cmds.filter((c) => !c.takenAt)).toHaveLength(1);
  });

  it('writes nothing again when the cloud has started the old one', async () => {
    const w = world();
    const old = await w.mac.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'T' } });
    claimForTheCloud(w.cloud, old.id, 'run-9');
    w.toCarry.push({ project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'T' }, replaces: old.id });
    await w.inbox.syncOnce();
    expect(await w.mac.phoneCommands()).toHaveLength(1);
  });

  it('hands a repeating task\'s run the cloud started to the supervisor with its rule', async () => {
    const w = world();
    const cmd = await w.mac.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'r-daily-20261027', kind: 'run-now', payload: { carried: CARRIED, title: 'Daily', body: '', repeat: { rule: 'r-daily', key: '2026-10-27' } } });
    claimForTheCloud(w.cloud, cmd.id, 'run-3');
    await w.inbox.syncOnce();
    expect(w.adoptedNew).toEqual([expect.objectContaining({ item: 'r-daily-20261027', repeat: { rule: 'r-daily', key: '2026-10-27' } })]);
  });
});
