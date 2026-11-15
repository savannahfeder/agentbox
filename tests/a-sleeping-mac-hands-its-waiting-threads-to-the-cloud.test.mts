// A SLEEPING MAC HANDS ITS WAITING THREADS TO THE CLOUD, AND STARTS NOTHING.
//
// What broke (2026-10-26 to 27, the founder's own Mac): the lid was shut from
// 10:07pm to 12:23pm, and in that time the Mac only woke for 2 to 21 seconds
// every quarter of an hour (pmset -g log). The supervisor ticked in those
// wakes, saw rows due, and started them. Each start had to pack and send the
// thread to the cloud, which takes 20 s to minutes, so each died at the next
// wake, 14 to 17 minutes later: six runs at 00:08, 00:40, 01:14, 08:53, 10:32
// and 11:09, each "agentbox cloud: stopped: The operation was aborted due to
// timeout". Nothing ran until she opened the lid.
//
// Now a pass that comes after a gap counts as asleep until a minute has gone
// by or somebody touches the Mac. Asleep, the tick starts nothing; the phone
// pass writes each waiting row into the command table, marked as the Mac's
// own, for the cloud server to start (tests/the-cloud-starts-what-a-sleeping-
// mac-handed-it). Awake again, the Mac takes back what the cloud did not start
// and joins what it did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { macAsleep, carryCommand, isCarried, CARRIED, ASLEEP_SETTLE_MS, SLEPT_GAP_MS } from '../shared/cloud-carry.mts';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { Supervisor } from '../main/supervisor.mts';
import { kitCopyPath } from '../main/cloud/kit.mts';
import { NEW_THREAD } from '../shared/cloud-kit.mts';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';

const MIN = 60_000;
const NOW = Date.parse('2026-10-27T09:00:00Z');
const DEV = 'a1b2c3d4e5f6';

describe('when the Mac counts as asleep', () => {
  it('is asleep on the first pass after a gap, before anyone could have touched it', () => {
    expect(macAsleep({ now: NOW, lastTickAt: NOW - 16 * MIN })).toBe(true);
    expect(macAsleep({ now: NOW, lastTickAt: NOW, wokeAt: NOW, idleMs: 16 * MIN })).toBe(true);
  });

  it('stays asleep for the minute after the gap while nobody touches it', () => {
    expect(macAsleep({ now: NOW + 30_000, lastTickAt: NOW + 15_000, wokeAt: NOW, idleMs: 17 * MIN })).toBe(true);
    expect(macAsleep({ now: NOW + ASLEEP_SETTLE_MS - 1, lastTickAt: NOW + 45_000, wokeAt: NOW })).toBe(true);
  });

  it('is awake once the minute is up, whoever is there', () => {
    expect(macAsleep({ now: NOW + ASLEEP_SETTLE_MS, lastTickAt: NOW + 45_000, wokeAt: NOW, idleMs: 30 * MIN })).toBe(false);
  });

  it('is awake as soon as a key or the mouse is touched after the wake', () => {
    expect(macAsleep({ now: NOW + 15_000, lastTickAt: NOW, wokeAt: NOW, idleMs: 5_000 })).toBe(false);
  });

  it('is awake with passes coming on time, and on the first pass of all', () => {
    expect(macAsleep({ now: NOW, lastTickAt: NOW - 15_000 })).toBe(false);
    expect(macAsleep({ now: NOW, lastTickAt: NOW - SLEPT_GAP_MS + 1 })).toBe(false);
    expect(macAsleep({ now: NOW, lastTickAt: 0 })).toBe(false);
  });
});

describe('a row as a hand-over', () => {
  const row = { id: 'w-1', product: 'alpha', title: 'Write the report', body: 'Since yesterday.', status: 'open', model: 'opus' };
  it('one nobody has run goes as Run now, with what the cloud needs to start it', () => {
    expect(carryCommand({ item: row, engine: 'claude' })).toEqual({
      project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'Write the report', body: 'Since yesterday.', engine: 'claude', model: 'opus' },
    });
  });
  it('one with a reply goes as that reply', () => {
    expect(carryCommand({ item: { ...row, answer: 'Ship it' }, continuation: true })).toEqual({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { carried: CARRIED, text: 'Ship it' } });
  });
  it('is nothing with no words to start from', () => {
    expect(carryCommand({ item: { ...row, title: ' ' } })).toBeNull();
    expect(carryCommand({ item: { ...row, answer: '' }, continuation: true })).toBeNull();
  });
  it('is told apart from what the phone sent', () => {
    expect(isCarried(carryCommand({ item: row }))).toBe(true);
    expect(isCarried({ kind: 'run-now', payload: {} })).toBe(false);
    expect(isCarried({ kind: 'reply', payload: { text: 'x', carried: true } })).toBe(false);
  });
});

/* ------------------------------ the supervisor ------------------------------ */

// Nobody at the Mac since before it slept, unless a test says otherwise.
function makeSupervisor(items, { idle = () => 30 * MIN } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-asleep-'));
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: '/tmp/nowhere' }],
    isDue: (i, now = Date.now()) => !i?.runAt || i.runAt <= now,
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ item, opts });
  sup.idleMs = idle;
  return { sup, root };
}
const fresh = (id, extra = {}) => ({ id, product: 'alpha', status: 'open', kind: 'task', labels: ['founder'], title: `Task ${id}`, createdAt: 1000, updatedAt: 1000, ...extra });
const real = (s) => s.spawned.filter((x) => x.item.kind !== 'drive' && x.item.kind !== 'digest').map((x) => x.item.id);
const sleep = (sup, ms = 16 * MIN) => { sup._lastTickAt = Date.now() - ms; };

describe('the tick on a sleeping Mac', () => {
  it('starts nothing on the first pass after a gap, and keeps what it would have started', async () => {
    const { sup } = makeSupervisor([fresh('w-1'), fresh('w-2', { answer: 'Go', labels: ['founder'] })]);
    sleep(sup);
    await sup.tick();
    expect(real(sup)).toEqual([]);
    expect(sup.asleep()).toBe(true);
    expect(sup._asleepQueue.map((r) => [r.item.id, r.continuation])).toEqual(expect.arrayContaining([['w-1', false], ['w-2', true]]));
  });

  it('starts them once somebody touches the Mac', async () => {
    let idle = 20 * MIN;
    const { sup } = makeSupervisor([fresh('w-1')], { idle: () => idle });
    sleep(sup);
    await sup.tick();
    expect(real(sup)).toEqual([]);
    sup._wokeAt -= 15_000;
    idle = 3_000;
    await sup.tick();
    expect(real(sup)).toEqual(['w-1']);
  });

  it('starts them a minute after the wake with nobody there', async () => {
    const { sup } = makeSupervisor([fresh('w-1')]);
    sleep(sup);
    await sup.tick();
    sup._wokeAt -= ASLEEP_SETTLE_MS;
    await sup.tick();
    expect(real(sup)).toEqual(['w-1']);
  });

  it('a copy with no keyboard to read (headless, or a test) is never asleep, however late its pass', async () => {
    const { sup } = makeSupervisor([fresh('w-1')], { idle: null });
    sleep(sup);
    await sup.tick();
    expect(real(sup)).toEqual(['w-1']);
  });

  it('starts as before when passes come on time', async () => {
    const { sup } = makeSupervisor([fresh('w-1')]);
    await sup.tick();
    expect(real(sup)).toEqual(['w-1']);
    expect(sup.asleep()).toBe(false);
  });

  it('turns away any other start while asleep, and hands back a reply it was carrying', () => {
    const { sup } = makeSupervisor([]);
    const real = Supervisor.prototype.spawnWorker;
    sleep(sup);
    const back = [];
    sup.redeliverAnswer = (item, answer) => back.push([item.id, answer]);
    real.call(sup, fresh('w-3', { answer: 'Yes' }), { continuation: true });
    expect(sup.sessions.size).toBe(0);
    expect(back).toEqual([['w-3', 'Yes']]);
  });
});

describe('a row handed to the cloud', () => {
  it('is not started here, asleep or awake, until it is taken back', async () => {
    const { sup } = makeSupervisor([fresh('w-1')]);
    sup.handedOver({ project: 'alpha', item: 'w-1', command: 'c-1', kind: 'run-now' });
    await sup.tick();
    expect(real(sup)).toEqual([]);
    sup.takenBack({ project: 'alpha', item: 'w-1' });
    await sup.tick();
    expect(real(sup)).toEqual(['w-1']);
  });

  it('runs here once the Mac has been awake ten minutes with no phone pass to take it back', async () => {
    const { sup } = makeSupervisor([fresh('w-1')]);
    sup.handedOver({ project: 'alpha', item: 'w-1', command: 'c-1', kind: 'run-now' });
    sup._bootAt = Date.now() - 11 * MIN;
    await sup.tick();
    expect(real(sup)).toEqual(['w-1']);
    expect(sup._carried['w-1']).toBeUndefined();
  });

  it('is still held ten minutes on while the phone pass keeps coming', async () => {
    const { sup } = makeSupervisor([fresh('w-1')]);
    sup.handedOver({ project: 'alpha', item: 'w-1', command: 'c-1', kind: 'run-now' });
    sup._bootAt = Date.now() - 11 * MIN;
    sup.phoneCarrying({ device: DEV, slugs: ['alpha'] });
    await sup.tick();
    expect(real(sup)).toEqual([]);
  });

  it('is remembered across a restart', () => {
    const { sup, root } = makeSupervisor([]);
    sup.handedOver({ project: 'alpha', item: 'w-1', command: 'c-1', kind: 'run-now' });
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const again = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
    expect(again._carried['w-1']).toMatchObject({ command: 'c-1' });
  });
});

describe('what a sleeping Mac hands over', () => {
  const kit = (over = {}) => ({ v: 1, engine: 'claude', item: 'w-2', project: 'alpha', cwd: '/x', marker: {}, ...over });
  function handing(items) {
    const { sup, root } = makeSupervisor(items);
    sup._phoneCarries = { device: DEV, slugs: new Set(['alpha']) };
    sup.leavesKitsFor = (slug) => slug === 'alpha';
    fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
    const put = (item, k) => fs.writeFileSync(kitCopyPath(root, 'alpha', item), JSON.stringify(k));
    return { sup, put };
  }

  it('a fresh row when its project has a new-thread kit, and a reply when its thread has a kit', async () => {
    const { sup, put } = handing([fresh('w-1'), fresh('w-2', { answer: 'Ship it' })]);
    put(NEW_THREAD, kit({ item: NEW_THREAD, newThread: { model: null, effort: null } }));
    put('w-2', kit());
    sleep(sup);
    const list = await sup.carryWhileAsleep();
    expect(list.map((c) => [c.item, c.kind])).toEqual(expect.arrayContaining([['w-1', 'run-now'], ['w-2', 'reply']]));
    expect(list).toHaveLength(2);
  });

  it('nothing while awake', async () => {
    const { sup, put } = handing([fresh('w-1')]);
    put(NEW_THREAD, kit({ item: NEW_THREAD, newThread: { model: null, effort: null } }));
    await sup.tick();
    sup.spawned.length = 0;
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('nothing with no kit to start it from, or for a project not on the phone', async () => {
    const { sup } = handing([fresh('w-1'), fresh('w-2', { answer: 'Ship it' }), fresh('w-3', { product: 'beta' })]);
    sleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('nothing for a row asking for a model the project\'s kit does not run', async () => {
    const { sup, put } = handing([fresh('w-1', { model: 'claude-haiku-4-5' })]);
    put(NEW_THREAD, kit({ item: NEW_THREAD, newThread: { model: null, effort: null } }));
    sleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('nothing for a thread she keeps on this Mac', async () => {
    const { sup, put } = handing([fresh('w-1')]);
    put(NEW_THREAD, kit({ item: NEW_THREAD, newThread: { model: null, effort: null } }));
    sup.threadOnMac = { 'w-1': true };
    sleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('a row once, not again at every wake', async () => {
    const { sup, put } = handing([fresh('w-1')]);
    put(NEW_THREAD, kit({ item: NEW_THREAD, newThread: { model: null, effort: null } }));
    sleep(sup);
    const [c] = await sup.carryWhileAsleep();
    sup.handedOver({ ...c, command: 'c-1' });
    sleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });
});

describe('waking, the supervisor makes the cloud\'s run of a handed-over row its own', () => {
  function adopting(row) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-adopt-'));
    const cwd = path.join(root, 'w-1');
    fs.mkdirSync(cwd);
    execFileSync('git', ['init', '-q'], { cwd });
    const answered = []; const composed = [];
    const store = {
      listItems: () => [row], listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: root }], isDue: () => true,
      readItem: (slug, id) => (id === row.id ? row : null),
      answerItem: (slug, id, a) => { answered.push(a.answer); return { ...row, answer: a.answer }; },
      composeItem: (slug, r) => { composed.push(r); return r; },
    };
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
    sup._tellServerJoined = async () => {};
    sup._bringCloudHome = () => {};
    sup.handedOver({ project: 'alpha', item: row.id, command: 'c-1', kind: 'reply' });
    fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
    const putKit = () => fs.writeFileSync(kitCopyPath(root, 'alpha', row.id), JSON.stringify({ v: 1, engine: 'claude', item: row.id, project: 'alpha', cwd, marker: { branch: 'b' } }));
    return { sup, answered, composed, putKit };
  }

  it('a reply it handed over is carried by the run, and not written on the row a second time', async () => {
    const t = adopting(fresh('w-1', { answer: 'Ship it', wrote: { answer: { ts: 5, source: 'founder' } } }));
    t.putKit();
    expect(await t.sup.adoptCloudRun({ product: 'alpha', itemId: 'w-1', runId: 'run-1', replies: [], carried: true })).toBe('adopted');
    expect(t.answered).toEqual([]);
    expect(t.sup._liveSessions['w-1'].carrying).toBeTruthy();
    expect(t.sup._carried['w-1']).toBeUndefined();
  });

  it('with no kit here the row is this computer\'s again, and runs here', async () => {
    const t = adopting(fresh('w-1', { answer: 'Ship it' }));
    expect(await t.sup.adoptCloudRun({ product: 'alpha', itemId: 'w-1', runId: 'run-1', replies: [], carried: true })).toBe('no-kit');
    expect(t.answered).toEqual([]);
    expect(t.sup._carried['w-1']).toBeUndefined();
  });

  it('a fresh row with no project kit here keeps its own row and is not made again', async () => {
    const t = adopting(fresh('w-1'));
    expect(await t.sup.adoptCloudNewThread({ product: 'alpha', itemId: 'w-1', runId: 'run-1', title: 'Task w-1', carried: true })).toBe('no-kit');
    expect(t.composed).toEqual([]);
    expect(t.sup._carried['w-1']).toBeUndefined();
  });
});

/* ------------------------------ the phone pass ------------------------------ */

function world({ asleep = true, toCarry = [], adoptAs = () => 'adopted' } = {}) {
  const cloud = createMemoryCloud();
  let clock = NOW;
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
  const state = { asleep, toCarry };
  const applied = []; const handed = []; const back = []; const adopted = []; const adoptedNew = [];
  const inbox = createPhoneInbox({
    backend: mac, owner: me, device: DEV, projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [{ id: 'w-1', title: 'Write the report', status: 'open', updatedAt: NOW - 5000 }],
    historyOf: () => [],
    apply: async (cmd) => { applied.push(cmd); return { ok: true }; },
    stateFile: path.join(dir, 's.json'), now: () => clock,
    kitsFor: () => true,
    adopt: async (a) => { adopted.push(a); return adoptAs(a); },
    adoptNew: async (a) => { adoptedNew.push(a); return adoptAs(a); },
    runHome: () => true,
    asleep: () => state.asleep,
    toCarry: async () => state.toCarry.filter((c) => !handed.some((h) => h.item === c.item)),
    handedOver: (c) => handed.push(c),
    takenBack: (c) => back.push(c),
  });
  return { cloud, mac, inbox, state, applied, handed, back, adopted, adoptedNew, tick: (ms) => { clock += ms; } };
}
const fresh1 = { project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'Write the report', body: '' } };

describe('the phone pass on a sleeping Mac', () => {
  it('writes each waiting row as the Mac\'s own command, once', async () => {
    const w = world({ toCarry: [fresh1] });
    await w.inbox.syncOnce();
    await w.inbox.syncOnce();
    const cmds = await w.mac.phoneCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ device: DEV, project: 'alpha', item: 'w-1', kind: 'run-now', payload: fresh1.payload, takenAt: null, claimedAt: null });
    expect(w.handed).toEqual([{ ...fresh1, command: cmds[0].id }]);
  });

  it('leaves its own commands for the cloud while it sleeps', async () => {
    const w = world({ toCarry: [fresh1] });
    await w.inbox.syncOnce();
    await w.inbox.syncOnce();
    expect((await w.mac.phoneCommands())[0]).toMatchObject({ claimedAt: null, takenAt: null });
    expect(w.applied).toEqual([]);
  });

  it('writes nothing while awake', async () => {
    const w = world({ asleep: false, toCarry: [fresh1] });
    await w.inbox.syncOnce();
    expect(await w.mac.phoneCommands()).toEqual([]);
  });

  it('a row it could not write is not counted as handed over', async () => {
    const w = world({ toCarry: [fresh1] });
    w.mac.addPhoneCommand = async () => { throw new Error('offline'); };
    await w.inbox.syncOnce();
    expect(w.back.map((c) => c.item)).toEqual(['w-1']);
  });
});

describe('the phone pass once the Mac is awake', () => {
  it('takes back what the cloud did not start, without doing it as a phone command', async () => {
    const w = world({ toCarry: [fresh1] });
    await w.inbox.syncOnce();
    w.state.asleep = false;
    await w.inbox.syncOnce();
    expect((await w.mac.phoneCommands())[0]).toMatchObject({ outcome: 'done' });
    expect(w.applied).toEqual([]);
    expect(w.back.map((c) => c.item)).toEqual(['w-1']);
  });

  it('joins a row the cloud started under the row\'s own id, with no reply of hers put on it', async () => {
    const w = world({ toCarry: [fresh1] });
    await w.inbox.syncOnce();
    const [cmd] = await w.mac.phoneCommands();
    claimForTheCloud(w.cloud, cmd.id, 'run-1');
    w.state.asleep = false;
    await w.inbox.syncOnce();
    expect(w.applied).toEqual([]);
    expect(w.adoptedNew).toEqual([expect.objectContaining({ project: 'alpha', item: 'w-1', runId: 'run-1', title: 'Write the report', replies: [], carried: true })]);
  });

  it('joins a thread whose waiting reply the cloud started, without putting the reply on it twice', async () => {
    const reply = { project: 'alpha', item: 'w-1', kind: 'reply', payload: { carried: CARRIED, text: 'Ship it' } };
    const w = world({ toCarry: [reply] });
    await w.inbox.syncOnce();
    const [cmd] = await w.mac.phoneCommands();
    claimForTheCloud(w.cloud, cmd.id, 'run-2');
    w.state.asleep = false;
    await w.inbox.syncOnce();
    expect(w.adopted).toEqual([expect.objectContaining({ item: 'w-1', runId: 'run-2', replies: [], carried: true })]);
  });
});

describe('the phone\'s screen', () => {
  const iso = (ms) => new Date(ms).toISOString();
  const rows = (commands) => ({
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', snapshot: { v: 2, item: { id: 'w-1', title: 'T', status: 'open', answer: 'Ship it', updatedAt: NOW - 1e5 }, history: [] } }],
    commands,
  });
  const cmd = (kind, payload) => ({ id: 'c1', device: DEV, project: 'alpha', item: 'w-1', kind, payload, created_at: iso(NOW - 1000), taken_at: null, outcome: null });

  it('does not draw the Mac\'s hand-over as a reply she sent', () => {
    const v = phoneView(rows([cmd('reply', { carried: CARRIED, text: 'Ship it' })]), NOW);
    expect(v.waiting).toEqual([]);
  });

  it('still draws a reply she did send', () => {
    const v = phoneView(rows([cmd('reply', { text: 'Ship it' })]), NOW);
    expect(v.waiting.map((x) => x.text)).toEqual(['Ship it']);
    expect(phoneSlug(DEV, 'alpha')).toBeTruthy();
  });
});
