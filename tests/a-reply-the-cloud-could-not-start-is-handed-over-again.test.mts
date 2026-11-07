// A REPLY SENT WITH THE LAPTOP SHUT STARTS, EVEN WHEN THE CLOUD TURNS IT DOWN.
//
// What broke (2026-10-31, w-e5f506ccb3). At 00:52 UTC a cloud run ended with
// its work still in the cloud ("fetch failed"), and the lid was shut. The
// reply sent from the phone at 01:33 was handed to the cloud as designed; the
// server could not start it, and after three tries five minutes apart
// (cloud/gateway/phone.mjs PHONE_TRIES) it left the command to the computer
// for good. The computer meanwhile holds a row it has handed over
// (Supervisor#_carriedHolds) and only writes the hand-over again when it is
// twelve hours old, so nothing ran for 6 h 39 min, until the lid opened. The
// row said nothing at all: it was out of the queue, so it had no reason to
// show, and read "Up next" the whole time.
//
// Measured by reading the two clocks against each other: the server gives up
// after about fifteen minutes, the computer tried again after twelve hours.
// Now a hand-over the cloud has not started is written again half an hour
// after the moment it could have run, which gives the server three fresh
// tries every half hour for as long as the lid is shut, and the row says the
// cloud has it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CARRY_AGAIN_MS, CARRY_AHEAD_MS, CARRIED, handOverSpent } from '../shared/cloud-carry.mjs';
import { KIT_VERSION, kitKey } from '../shared/cloud-kit.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { GIVEN_UP_FOR_MS, PHONE_TRIES } from '../cloud/gateway/phone.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { Supervisor } from '../main/supervisor.mts';
import { kitCopyPath } from '../main/cloud/kit.mts';
import { writeMarker } from '../main/cloud/marker.mts';
import { cannotStartLine } from '../renderer/src/live-line';

const MIN = 60_000;

describe('when a hand-over is written again', () => {
  it('is spent half an hour after it was made', () => {
    const at = Date.now();
    expect(handOverSpent({ at, now: at + CARRY_AGAIN_MS - 1 })).toBe(false);
    expect(handOverSpent({ at, now: at + CARRY_AGAIN_MS })).toBe(true);
  });

  it('is spent half an hour after the moment it was handed over for, not after the hand-over', () => {
    const at = Date.now();
    const notBefore = at + 10 * 3600_000;
    expect(handOverSpent({ at, notBefore, now: at + 2 * 3600_000 })).toBe(false);
    expect(handOverSpent({ at, notBefore, now: notBefore + CARRY_AGAIN_MS })).toBe(true);
  });

  it('is never spent with nothing handed over', () => {
    expect(handOverSpent({ now: Date.now() })).toBe(false);
  });

  it('comes round many times inside the twelve hours a shut lid is handed ahead for', () => {
    expect(CARRY_AGAIN_MS).toBeLessThan(CARRY_AHEAD_MS / 4);
  });
});

/* -------------------------- the sleeping computer -------------------------- */

const DEV = 'a1b2c3d4e5f6';
const fresh = (id, extra = {}) => ({ id, product: 'alpha', status: 'open', kind: 'task', labels: ['founder'], title: `Task ${id}`, createdAt: 1000, updatedAt: 1000, ...extra });

// A Mac whose last pass came a quarter of an hour ago, with nobody at it: one
// of a shut lid's few-second wakes (shared/cloud-carry.mjs macAsleep).
function sleeping(items, { dir = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-again-'));
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: dir ?? path.join(root, 'nowhere') }],
    isDue: (i, now = Date.now()) => !i?.runAt || i.runAt <= now,
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ item, opts });
  sup.idleMs = () => 30 * MIN;
  sup._phoneCarries = { device: DEV, slugs: new Set(['alpha']) };
  sup.leavesKitsFor = (slug) => slug === 'alpha';
  sup._lastTickAt = Date.now() - 16 * MIN;
  fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
  const putKit = (item, kit) => fs.writeFileSync(kitCopyPath(root, 'alpha', item), JSON.stringify({ v: 1, engine: 'claude', item, project: 'alpha', cwd: root, marker: {}, ...kit }));
  const asleepAgain = () => { sup._lastTickAt = Date.now() - 16 * MIN; };
  return { sup, root, putKit, asleepAgain };
}

describe('a hand-over the cloud never started', () => {
  it('is written again half an hour on, naming the one it replaces', async () => {
    const { sup, putKit, asleepAgain } = sleeping([fresh('w-2', { answer: 'continue' })]);
    putKit('w-2', {});
    const [first] = await sup.carryWhileAsleep();
    expect(first.item).toBe('w-2');
    sup.handedOver({ ...first, command: 'c-1' });
    sup._carried['w-2'].at = Date.now() - CARRY_AGAIN_MS;
    asleepAgain();
    const again = await sup.carryWhileAsleep();
    expect(again.map((c) => [c.item, c.kind, c.replaces])).toEqual([['w-2', 'reply', 'c-1']]);
  });

  it('is left alone before then, so the cloud keeps its own three tries', async () => {
    const { sup, putKit, asleepAgain } = sleeping([fresh('w-2', { answer: 'continue' })]);
    putKit('w-2', {});
    const [first] = await sup.carryWhileAsleep();
    sup.handedOver({ ...first, command: 'c-1' });
    sup._carried['w-2'].at = Date.now() - (CARRY_AGAIN_MS - MIN);
    asleepAgain();
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('for a row due later waits half an hour past that moment, not past the hand-over', async () => {
    const soon = Date.now() + 8 * 3600_000;
    const { sup, putKit, asleepAgain } = sleeping([fresh('w-2', { answer: 'continue', runAt: soon })]);
    putKit('w-2', {});
    const [first] = await sup.carryWhileAsleep();
    expect(first.payload.notBefore).toBe(soon);
    sup.handedOver({ ...first, command: 'c-1' });
    sup._carried['w-2'].at = Date.now() - 2 * 3600_000;
    asleepAgain();
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });
});

describe('a reply whose folder still has a cloud run to bring home', () => {
  it('is not handed over, because the kit would start the cloud on work that never came back', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-pending-'));
    const cwd = path.join(root, 'w-2');
    fs.mkdirSync(cwd);
    execFileSync('git', ['init', '-q'], { cwd });
    const { sup, putKit } = sleeping([fresh('w-2', { answer: 'continue' })]);
    putKit('w-2', { cwd });
    expect((await sup.carryWhileAsleep()).map((c) => c.item)).toEqual(['w-2']);
    writeMarker(cwd, { runId: 'run-0', branch: 'agentbox/w-2' });
    sup._lastTickAt = Date.now() - 16 * MIN;
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });
});

/* ------------------------------ the cloud server ------------------------------ */

const OWNER = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const SHA = 'c'.repeat(40);

const threadKit = (madeAt) => ({
  v: KIT_VERSION, engine: 'claude', madeAt, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: SHA,
  argv: ['claude', '-p', '--resume', 's-1'], env: { ZERO_ITEM: 'w-1' },
  bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-Users-me-dev-alpha--claude-worktrees-w-1' }],
  frame: { before: 'Reply: ', after: '' },
  marker: { branch: 'agentbox/w-1', startSha: SHA, sent: { branch: 'agentbox/w-1', head: SHA, tree: 't', index: 't' }, toolEnv: {}, engine: 'claude' },
});

// A server whose cloud cannot be reached, as it could not be on 2026-10-31,
// and whose clock a test moves on.
async function failingCloud() {
  let clock = Date.UTC(2026, 9, 31, 1, 33, 0);
  const tried = [];
  const iso = (t) => new Date(t).toISOString();
  const commands = [];
  const objects = memoryObjects();
  const db = {
    commands,
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread() { return null; },
    async writeThread() {},
    async newThread() {},
    async pushDevices() { return []; },
    async dropPushDevice() {},
  };
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        if (payload.action !== 'start') return { ok: true, state: 'running', events: [], more: false };
        tried.push(clock);
        throw Object.assign(new Error('fetch failed'), { error: 'cloud' });
      },
      async stop() {},
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {}, objects,
    whoIs: async (tok) => (tok === 'session-of-a' ? { id: OWNER } : null),
    now: () => clock, plans: { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } }, log: () => {},
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => messages.map(() => ({ status: 'ok' })),
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: OWNER, plan: 'test' });
  await objects.put(`runs/u-${OWNER}/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/'.length)}`, JSON.stringify(threadKit(clock - MIN)));
  commands.push({
    id: 'c0ffee00-0000-4000-8000-0000000000b2', owner: OWNER, device: DEVICE, project: 'alpha', item: 'w-1',
    kind: 'reply', payload: { carried: CARRIED, text: 'continue' }, created_at: iso(clock - 1000),
    claimed_at: null, claimed_by: null, taken_at: null, outcome: null,
  });
  return { gw, db, tried, on: (ms) => { clock += ms; }, sweep: () => gw.phoneSweep() };
}

describe('a reply the cloud server could not start', () => {
  it('is given its three tries five minutes apart, and then rested', async () => {
    const t = await failingCloud();
    for (let i = 0; i < 20; i += 1) { await t.sweep(); t.on(MIN); }
    expect(t.tried).toHaveLength(PHONE_TRIES);
  });

  it('is tried again half an hour on, rather than left for the lid to open', async () => {
    const t = await failingCloud();
    for (let i = 0; i < 20; i += 1) { await t.sweep(); t.on(MIN); }
    t.on(GIVEN_UP_FOR_MS);
    await t.sweep();
    expect(t.tried).toHaveLength(PHONE_TRIES + 1);
  });

  it('gives the claim back each time, so the waking computer can take it', async () => {
    const t = await failingCloud();
    await t.sweep();
    expect(t.tried).toHaveLength(1);
    expect(t.db.commands[0]).toMatchObject({ claimed_at: null, claimed_by: null, taken_at: null });
  });
});

describe('a row the cloud has been handed', () => {
  it('says so on its line instead of saying nothing', async () => {
    const { sup } = sleeping([fresh('w-2', { answer: 'continue', wrote: { answer: { ts: Date.now(), source: 'founder' } } })]);
    sup.handedOver({ project: 'alpha', item: 'w-2', command: 'c-1', kind: 'reply' });
    await sup.tick();
    expect(sup.spawned).toEqual([]);
    expect(sup._notStarting.get('w-2')?.why).toBe('cloud-carried');
  });

  it('has words for it on the row', () => {
    expect(cannotStartLine({ why: 'cloud-carried', tool: 'Claude Code' })).toMatch(/cloud/i);
  });
});
