// THE CLOUD STARTS WHAT A SLEEPING MAC HANDED IT.
//
// Overnight on 2026-10-26 the founder's lid was shut from 10:07pm to 12:23pm.
// The cloud server only started replies and new threads sent from the phone,
// so everything queued on the Mac (fresh rows, the daily report, retries) was
// started by the Mac itself in its few-second dark wakes. Six runs died that
// way, each 14 to 17 minutes later at the next wake, with "The operation was
// aborted due to timeout".
//
// Now a sleeping Mac writes each waiting row into the command table, marked as
// its own (shared/cloud-carry.mjs). The server starts a row nobody has run
// from its project's new-thread kit under the row's own id, and a row with a
// reply from the thread's kit, both at once: the Mac said it is asleep, so
// there is no minute to wait for it. The phone's own Run now is still the
// computer's.
import { describe, it, expect } from 'vitest';
import {
  KIT_VERSION, NEW_ITEM_MARK, NEW_TITLE_MARK, NEW_BODY_MARK, newThreadKitKey, kitKey, runOfClaim,
} from '../shared/cloud-kit.mjs';
import { CARRIED } from '../shared/cloud-carry.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const SHA = 'c'.repeat(40);
const ROW = 'w-0123456789';

const projectKit = (t, over = {}) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: '_new',
  cwd: `/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`, branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA,
  argv: ['claude', '-p', '--output-format', 'stream-json'], env: { ZERO_ITEM: NEW_ITEM_MARK, ZERO_PRODUCT: 'alpha' },
  bundleKey: `runs/kits/${DEVICE}/alpha/_new/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: `/Users/me/.claude/projects/-Users-me-dev-alpha--claude-worktrees-${NEW_ITEM_MARK}` }],
  frame: { before: `Item ${NEW_ITEM_MARK}. They said: `, after: ' [end]' },
  marker: { branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA, sent: { branch: `agentbox/${NEW_ITEM_MARK}`, head: SHA, tree: 't', index: 't' }, toolEnv: { ZERO_ITEM: NEW_ITEM_MARK }, engine: 'claude' },
  newThread: { mainSha: SHA, brief: `# Your work item\nWork item id: ${NEW_ITEM_MARK}\nTitle: ${NEW_TITLE_MARK}\n\n${NEW_BODY_MARK}\n`, model: null, effort: null },
  ...over,
});

// One thread's own kit, as the computer leaves it after a turn.
const threadKit = (t) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: SHA,
  argv: ['claude', '-p', '--resume', 's-1'], env: { ZERO_ITEM: 'w-1' },
  bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-Users-me-dev-alpha--claude-worktrees-w-1' }],
  frame: { before: 'Reply: ', after: '' },
  marker: { branch: 'agentbox/w-1', startSha: SHA, sent: { branch: 'agentbox/w-1', head: SHA, tree: 't', index: 't' }, toolEnv: {}, engine: 'claude' },
});

function fakeDb() {
  const commands = [];
  const threads = new Map();
  const iso = (t) => new Date(t).toISOString();
  return {
    commands, threads,
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, owner: A, device: DEVICE, project: 'alpha', ...c, created_at: iso(c.created_at) }); },
    // The kinds the server's own query asks for (supabaseRest waitingReplies).
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => ['reply', 'new', 'run-now'].includes(c.kind) && !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread(o, d, p, i) { return threads.get(`${o}|${d}|${p}|${i}`) ?? null; },
    async writeThread(o, d, p, i, snapshot) { threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async newThread(o, d, p, i, snapshot) { if (!threads.has(`${o}|${d}|${p}|${i}`)) threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async pushDevices() { return []; },
    async dropPushDevice() {},
  };
}

async function server() {
  let clock = Date.UTC(2026, 9, 27, 9, 0, 0);
  const sent = []; const logs = [];
  const objects = memoryObjects();
  const db = fakeDb();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        if (payload.action === 'events') return { ok: true, state: 'running', events: [], more: false };
        return { ok: true };
      },
      async stop() {},
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {}, objects,
    whoIs: async (tok) => (tok === 'session-of-a' ? { id: A } : null),
    now: () => clock, plans: { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } }, log: (m) => logs.push(m),
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => messages.map(() => ({ status: 'ok' })),
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  const put = (key, kit) => objects.put(`runs/u-${A}/${key.slice('runs/'.length)}`, JSON.stringify(kit));
  await put(newThreadKitKey(DEVICE, 'alpha'), projectKit(clock));
  await put(kitKey(DEVICE, 'alpha', 'w-1'), threadKit(clock));
  return {
    gw, db, objects, logs, put,
    now: () => clock,
    starts: () => sent.filter((s) => s.payload?.action === 'start'),
    said: () => sent.filter((s) => s.payload?.action === 'stdin').map((s) => JSON.parse(Buffer.from(s.payload.data, 'base64').toString('utf8')).message.content),
  };
}

const carriedStart = (over = {}) => ({ id: 'c0ffee00-0000-4000-8000-0000000000a1', kind: 'run-now', item: ROW, payload: { carried: CARRIED, title: 'Write the daily report', body: 'Numbers since yesterday.' }, ...over });

describe('a row a sleeping Mac handed to the cloud', () => {
  it('starts at once from the project\'s kit, under the row\'s own id, folder and branch', async () => {
    const t = await server();
    t.db.add(carriedStart({ created_at: t.now() - 1000 }));
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.starts()[0].payload).toMatchObject({ branch: `agentbox/${ROW}`, cwd: `/Users/me/dev/alpha/.claude/worktrees/${ROW}`, env: { ZERO_ITEM: ROW } });
    expect(t.said()[0]).toBe(`# Your work item\nWork item id: ${ROW}\nTitle: Write the daily report\n\nNumbers since yesterday.\n`);
    expect(runOfClaim(t.db.commands[0].claimed_by)).toBeTruthy();
  });

  it('leaves a record that names the row it ran, for the computer to adopt', async () => {
    const t = await server();
    t.db.add(carriedStart({ created_at: t.now() - 1000 }));
    await t.gw.phoneSweep();
    const runId = runOfClaim(t.db.commands[0].claimed_by);
    const rec = JSON.parse((await t.objects.get(`runs/u-${A}/server/${runId}.json`)).body);
    expect(rec).toMatchObject({ item: ROW, carried: true, command: carriedStart().id });
  });

  it('is not given a second thread on the phone: the row\'s own copy is its thread', async () => {
    const t = await server();
    t.db.add(carriedStart({ created_at: t.now() - 1000 }));
    await t.gw.phoneSweep();
    expect(t.db.threads.size).toBe(0);
  });

  it('with a reply waiting starts from the thread\'s kit at once, not a minute later', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-0000000000b2', kind: 'reply', item: 'w-1', payload: { carried: CARRIED, text: 'Ship it' }, created_at: t.now() - 1000 });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.starts()[0].payload).toMatchObject({ branch: 'agentbox/w-1' });
    expect(t.said()[0]).toContain('Reply: Ship it');
  });

  it('is left to the computer when it asks for a model the project\'s kit does not run', async () => {
    const t = await server();
    t.db.add(carriedStart({ payload: { ...carriedStart().payload, model: 'claude-haiku-4-5' }, created_at: t.now() - 1000 }));
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
    expect(t.db.commands[0].claimed_by).toBeNull();
  });

  it('is left to the computer with no kit for its project', async () => {
    const t = await server();
    t.db.add(carriedStart({ project: 'beta', created_at: t.now() - 1000 }));
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
  });
});

describe('what the cloud still leaves to the computer', () => {
  it('Run now pressed on the phone, which is not a hand-over', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-0000000000c3', kind: 'run-now', item: ROW, payload: {}, created_at: t.now() - 5 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
    expect(t.db.commands[0].claimed_by).toBeNull();
  });

  it('a reply from the phone, for its first minute', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-0000000000d4', kind: 'reply', item: 'w-1', payload: { text: 'Ship it' }, created_at: t.now() - 1000 });
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
  });

  it('a hand-over with no title, which is no ask', async () => {
    const t = await server();
    t.db.add(carriedStart({ payload: { carried: CARRIED, title: '', body: '' }, created_at: t.now() - 1000 }));
    await t.gw.phoneSweep();
    expect(t.starts()).toEqual([]);
  });
});
