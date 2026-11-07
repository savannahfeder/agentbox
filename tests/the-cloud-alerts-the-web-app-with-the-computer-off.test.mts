// THE CLOUD ALERTS THE WEB APP WITH THE COMPUTER OFF.
//
// What broke (2026-10-27): the web app's alerts came only from a computer, so
// with every computer off they never came, while a reply sent from the phone
// was still being answered in the cloud. The founder: "they need to work even
// when the computer is off." The web app leaves its subscription for its
// computers as a setting command; the cloud server (cloud/gateway/phone.mjs)
// now reads the latest of those per phone and sends the same alert the phone
// app gets, and a test alert no computer took within a minute is sent by the
// cloud. Measured with the gateway's in-memory bucket, a stand-in database
// and a stand-in push service.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { supabaseRest } from '../cloud/gateway/phone.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { KIT_VERSION, kitKey, runOfClaim } from '../shared/cloud-kit.mjs';
import { threadSnapshot } from '../shared/phone-snapshot.mjs';
import { WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY, webAlertsOn } from '../shared/web-alerts.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const OTHER = 'b2c3d4e5f6a1';
const MIN = 60_000;
const b64 = (n) => crypto.randomBytes(n).toString('base64url');
const sub = (endpoint) => ({
  on: true, endpoint, keys: { p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: b64(16) },
  vapid: { publicKey: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), privateKey: b64(32) },
});
const PHONE = 'https://web.push.apple.com/QH4bAbCdEfGh0123456789';
const LAPTOP_TAB = 'https://fcm.googleapis.com/fcm/send/abc123';

const kitFor = (t) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['claude', '--resume', 's-1'], env: { ZERO_ITEM: 'w-1' },
  bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  files: [{ path: '/tmp/settings.json', key: `runs/kits/${DEVICE}/alpha/w-1/files/1` }],
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-x' }], frame: { before: 'What they said:\n\n', after: '\n\n# Boundaries' }, note: '# In the cloud',
});

function fakeDb() {
  const commands = [];
  const threads = new Map();
  const iso = (t) => new Date(t).toISOString();
  const open = (c) => !c.taken_at && !c.claimed_at;
  return {
    commands, threads,
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'reply', owner: A, device: DEVICE, project: 'alpha', item: 'w-1', ...c, created_at: iso(c.created_at) }); },
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => c.kind === 'reply' && open(c) && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async webAlerts(owner) {
      return commands.filter((c) => c.owner === owner && c.kind === 'setting' && c.payload?.key === WEB_ALERTS_KEY).map((c) => ({ payload: c.payload, created_at: c.created_at }));
    },
    async waitingWebTests({ after, before, limit }) {
      return commands.filter((c) => c.kind === 'setting' && c.payload?.key === WEB_ALERTS_TEST_KEY && open(c) && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) {
      const c = commands.find((x) => x.id === id && open(x));
      if (!c) return false;
      Object.assign(c, { claimed_at: at, claimed_by: by });
      return true;
    },
    async giveBack() {},
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread(owner, device, project, item) { return threads.get(`${owner}|${device}|${project}|${item}`) ?? null; },
    async writeThread(owner, device, project, item, snapshot) { threads.set(`${owner}|${device}|${project}|${item}`, { snapshot }); },
    async pushDevices() { return []; },
    async dropPushDevice() {},
  };
}

async function setup({ refuse = () => null } = {}) {
  let clock = Date.UTC(2026, 9, 27, 12, 0, 0);
  const webPushed = [];
  const objects = memoryObjects();
  const db = fakeDb();
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
    plans: { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } },
    log: () => {},
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => messages.map(() => ({ status: 'ok' })),
      sendWebPush: async (to, body, opts) => {
        const no = refuse(to.endpoint);
        if (no) throw Object.assign(new Error(`push service said ${no}`), { statusCode: no });
        webPushed.push({ to, say: JSON.parse(body), opts });
      },
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  await objects.put(`runs/u-${A}/kits/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/kits/'.length)}`, JSON.stringify(kitFor(clock)));
  db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Ship it', status: 'blocked', result: 'Ready to ship?', updatedAt: clock - 3600_000 }, []) });
  const turnOn = (device, value, at) => db.add({ id: `s-${db.commands.length}`, kind: 'setting', device, project: null, item: null, payload: { scope: 'workspace', key: WEB_ALERTS_KEY, value }, created_at: at });
  // A reply with the computer off, answered in the cloud.
  async function answeredInTheCloud() {
    db.add({ id: 'c1', payload: { text: 'yes, ship it' }, created_at: clock - 2 * MIN });
    await gw.phoneSweep();
    const runId = runOfClaim(db.commands.find((c) => c.id === 'c1').claimed_by);
    clock += 10 * MIN;
    const line = `${JSON.stringify({ type: 'result', result: 'Shipped it.', is_error: false })}\n`;
    await objects.put(`runs/u-${A}/${runId}/events.jsonl`, JSON.stringify({ seq: 1, kind: 'stdout', data: Buffer.from(line).toString('base64') }));
    await objects.put(`runs/u-${A}/${runId}/done.json`, '{}');
    await gw.objectCreated(`runs/u-${A}/${runId}/done.json`);
  }
  return { gw, db, webPushed, turnOn, answeredInTheCloud, now: () => clock, tick: (ms) => { clock += ms; } };
}

describe('which phones are on', () => {
  it('is the latest setting for each phone, whichever computer it was left for', () => {
    const a = sub(PHONE);
    const b = sub(LAPTOP_TAB);
    const on = webAlertsOn([
      { created_at: '2026-10-27T10:00:00Z', payload: { key: WEB_ALERTS_KEY, value: a } },
      { created_at: '2026-10-27T10:00:01Z', payload: { key: WEB_ALERTS_KEY, value: a } },
      { created_at: '2026-10-27T10:05:00Z', payload: { key: WEB_ALERTS_KEY, value: b } },
      { created_at: '2026-10-27T11:00:00Z', payload: { key: WEB_ALERTS_KEY, value: { on: false, endpoint: LAPTOP_TAB } } },
    ]);
    expect(on.map((w) => w.endpoint)).toEqual([PHONE]);
  });
  it('is on again when turned on after being turned off, whatever order the rows come in', () => {
    const a = sub(PHONE);
    const on = webAlertsOn([
      { created_at: '2026-10-27T12:00:00Z', payload: { key: WEB_ALERTS_KEY, value: a } },
      { created_at: '2026-10-27T11:00:00Z', payload: { key: WEB_ALERTS_KEY, value: { on: false, endpoint: PHONE } } },
    ]);
    expect(on).toHaveLength(1);
  });
  it('takes no setting it would refuse, nor a test or another key', () => {
    const on = webAlertsOn([
      { created_at: '2026-10-27T10:00:00Z', payload: { key: WEB_ALERTS_KEY, value: { on: true, endpoint: PHONE } } },
      { created_at: '2026-10-27T10:00:00Z', payload: { key: WEB_ALERTS_TEST_KEY, value: { endpoint: PHONE } } },
      { created_at: '2026-10-27T10:00:00Z', payload: { key: 'adhdMode', value: true } },
    ]);
    expect(on).toEqual([]);
  });
});

describe('with the computer off', () => {
  it('a cloud run\'s answer alerts the web app once, naming the thread and opening it', async () => {
    const t = await setup();
    t.turnOn(DEVICE, sub(PHONE), t.now() - 60 * MIN);
    t.turnOn(OTHER, sub(PHONE), t.now() - 60 * MIN);
    await t.answeredInTheCloud();
    expect(t.webPushed).toHaveLength(1);
    expect(t.webPushed[0].to.endpoint).toBe(PHONE);
    expect(t.webPushed[0].say).toMatchObject({ title: 'Ship it', body: 'An agent is ready', open: 'w-1' });
    expect(t.webPushed[0].opts.vapidDetails.subject).toBe('https://agentbox.ac');
    expect(t.webPushed[0].opts.timeout).toBeGreaterThan(0);
    // The setting is still waiting for its computer, which learns it when it is back.
    expect(t.db.commands.filter((c) => c.kind === 'setting').every((c) => !c.taken_at)).toBe(true);
  });
  it('sends nothing to a phone that turned alerts off', async () => {
    const t = await setup();
    t.turnOn(DEVICE, sub(PHONE), t.now() - 60 * MIN);
    t.turnOn(DEVICE, { on: false, endpoint: PHONE }, t.now() - 30 * MIN);
    await t.answeredInTheCloud();
    expect(t.webPushed).toHaveLength(0);
  });
  it('a push service that refuses one phone does not stop the alert reaching the next', async () => {
    const t = await setup({ refuse: (e) => (e === LAPTOP_TAB ? 410 : null) });
    t.turnOn(DEVICE, sub(LAPTOP_TAB), t.now() - 60 * MIN);
    t.turnOn(DEVICE, sub(PHONE), t.now() - 59 * MIN);
    await t.answeredInTheCloud();
    expect(t.webPushed.map((p) => p.to.endpoint)).toEqual([PHONE]);
  });
});

describe('a test alert', () => {
  const askTest = (t, at) => t.db.add({ id: `t-${t.db.commands.length}`, kind: 'setting', project: null, item: null, payload: { scope: 'workspace', key: WEB_ALERTS_TEST_KEY, value: { endpoint: PHONE } }, created_at: at });

  it('no computer took within a minute is sent by the cloud and marked done', async () => {
    const t = await setup();
    t.turnOn(DEVICE, sub(PHONE), t.now() - 5 * MIN);
    askTest(t, t.now() - 70_000);
    await t.gw.phoneSweep();
    expect(t.webPushed).toHaveLength(1);
    expect(t.webPushed[0].say).toMatchObject({ title: 'Agentbox', body: 'Alerts reach this phone.' });
    expect(t.db.commands.at(-1)).toMatchObject({ outcome: 'done' });
    // Not named `cloud:<run>`: the computer brings every such claim home as a run.
    expect(t.db.commands.at(-1).claimed_by).toBeNull();
    expect(runOfClaim(t.db.commands.at(-1).claimed_by)).toBeNull();
    await t.gw.phoneSweep();
    expect(t.webPushed).toHaveLength(1);
  });
  it('is left for the computer for its first minute', async () => {
    const t = await setup();
    t.turnOn(DEVICE, sub(PHONE), t.now() - 5 * MIN);
    askTest(t, t.now() - 20_000);
    await t.gw.phoneSweep();
    expect(t.webPushed).toHaveLength(0);
    expect(t.db.commands.at(-1).taken_at).toBeNull();
  });
  it('for a phone whose alerts are not on says so rather than sending', async () => {
    const t = await setup();
    askTest(t, t.now() - 70_000);
    await t.gw.phoneSweep();
    expect(t.webPushed).toHaveLength(0);
    expect(t.db.commands.at(-1).outcome).toMatch(/^refused: alerts are not on/);
  });
  it('an hour old is not sent at all', async () => {
    const t = await setup();
    t.turnOn(DEVICE, sub(PHONE), t.now() - 120 * MIN);
    askTest(t, t.now() - 60 * MIN);
    await t.gw.phoneSweep();
    expect(t.webPushed).toHaveLength(0);
  });
});

describe('the database', () => {
  it('asks for the web app\'s settings and its waiting tests, with the service key and a deadline', async () => {
    const asked = [];
    const db = supabaseRest({ url: 'https://abc.supabase.co', serviceKey: 'svc', fetchImpl: async (url, init) => { asked.push({ url, init }); return { ok: true, text: async () => '[]' }; } });
    await db.webAlerts(A);
    await db.waitingWebTests({ after: Date.UTC(2026, 9, 27, 11), before: Date.UTC(2026, 9, 27, 12), limit: 50 });
    expect(asked[0].url).toContain(`owner=eq.${A}`);
    expect(asked[0].url).toContain('kind=eq.setting');
    expect(asked[0].url).toContain(`payload->>key=eq.${WEB_ALERTS_KEY}`);
    expect(asked[1].url).toContain(`payload->>key=eq.${WEB_ALERTS_TEST_KEY}`);
    expect(asked[1].url).toContain('taken_at=is.null');
    expect(asked[1].url).toContain('claimed_at=is.null');
    for (const a of asked) {
      expect(a.init.headers.authorization).toBe('Bearer svc');
      expect(a.init.signal).toBeTruthy();
    }
  });
});
