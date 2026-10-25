// YOUR MAC ALERTS YOUR PHONE WHEN A THREAD NEWLY NEEDS YOU.
//
// The phone app could turn alerts on and send itself a test, and nothing ever
// sent a real one (2026-10-23): the old sender (main/phone-link.mjs) spoke
// Web Push to the phone website and is no longer wired to anything. Now the
// Mac, in its phone pass (main/phone-inbox.mjs), hears the same arrivals the
// desktop banner hears (main/notify.mjs, from App.tsx's inbox) and sends
// them through Expo's push service to the phones in push_devices, by the
// same rules: nothing while you have used this Mac in the last five minutes,
// once per stretch away and once more for a permission card
// (shared/notify-rules.mjs), several close together folded into one. Each
// thread is alerted once per state and a token Expo calls dead is dropped.
// An alert is headed by the thread's title, as asked on 2026-10-13 and again
// on 2026-10-23 ("I want titles back for notifs"), with the desktop's sentence
// under it (shared/notify-rules.mjs phoneBanner), and carries nothing else of
// the thread. Measured here with the in-memory cloud and a stand-in for Expo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { sendToExpo, FOLD_MS, EXPO_PUSH } from '../main/phone-alerts.mjs';
import { phoneSlug } from '../renderer/src/phone-rows';
import { AWAY_AFTER_MS } from '../shared/notify-rules.mjs';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { installNotifier } from '../main/notify.mjs';
import { WRAPPED_ARGS } from '../shared/bridge-map.mjs';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';
const OTHER = 'ExponentPushToken[zyxwvutsrq9876543210ZY]';
const SECRET = 'Rename Acme before the merger';

const row = (id, over = {}) => ({ id, title: `${SECRET} ${id}`, body: 'the confidential brief', status: 'blocked', note: 'private note', createdAt: NOW - 3600_000, updatedAt: NOW - 60_000, wrote: { status: { ts: NOW - 60_000, source: 'agent' } }, ...over });

function setup({ devices = [TOKEN], tickets = {}, fail = null } = {}) {
  const cloud = createMemoryCloud();
  let clock = NOW;
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-alerts-')), 'phone-inbox.json');
  const world = { idle: 10 * 60_000, items: { alpha: [row('w-1'), row('w-2'), row('w-3')], beta: [row('w-9')] }, pushed: [], logs: [], fail };
  const inbox = createPhoneInbox({
    backend: mac,
    owner: me,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: (slug) => world.items[slug] ?? [],
    historyOf: () => [],
    apply: async () => ({ ok: true }),
    stateFile,
    now: () => clock,
    log: (line) => world.logs.push(line),
    idleMs: () => world.idle,
    sendPush: async (messages) => {
      if (world.fail) throw new Error(world.fail);
      world.pushed.push(messages);
      return messages.map((m) => tickets[m.to] ?? { status: 'ok', id: `t-${world.pushed.length}` });
    },
  });
  const ready = (async () => { for (const t of devices) await phone.putPushDevice({ token: t, platform: 'ios', appVersion: '1.0.0' }); await inbox.syncOnce(); })();
  const tick = (ms) => { clock += ms; };
  const arrive = (list, needsYou = list.filter((a) => a.kind === 'item').map((a) => ({ id: a.id, product: a.product }))) => inbox.arrivals(list, needsYou);
  const item = (id, product = 'alpha') => ({ id, title: `${SECRET} ${id}`, product, productName: 'Alpha', kind: 'item' });
  // A pass once the fold has had its moment.
  const pass = async () => { tick(FOLD_MS); await inbox.syncOnce(); };
  const messages = () => world.pushed.flat();
  return { cloud, mac, phone, inbox, world, ready, tick, arrive, item, pass, messages, stateFile };
}

describe('a thread that newly needs you', () => {
  it('reaches every phone with alerts on, once, and opens that thread', async () => {
    const t = setup({ devices: [TOKEN, OTHER] });
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(1);
    const sent = t.messages();
    expect(sent.map((m) => m.to).sort()).toEqual([TOKEN, OTHER].sort());
    expect(sent[0]).toMatchObject({ title: `${SECRET} w-1`, body: 'An agent is ready', sound: 'default', badge: 1 });
    // What the phone's alert handler reads (mobile/src/app/_layout.tsx) to open the thread.
    expect(sent[0].data).toEqual({ product: phoneSlug(t.inbox.device, 'alpha'), id: 'w-1' });
    await t.pass();
    expect(t.world.pushed).toHaveLength(1);
  });

  it('waits a moment, so several arriving together are one alert', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    t.tick(FOLD_MS / 3);
    await t.inbox.syncOnce();
    expect(t.world.pushed).toHaveLength(0);
    t.arrive([t.item('w-2'), t.item('w-3')], [{ id: 'w-1', product: 'alpha' }, { id: 'w-2', product: 'alpha' }, { id: 'w-3', product: 'alpha' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(1);
    expect(t.messages()[0]).toMatchObject({ title: `${SECRET} w-3`, body: 'Agents are ready', badge: 3 });
    // Several threads open the app on its inbox, not on one of them.
    expect(t.messages()[0].data).toEqual({});
  });

  it('counts on the badge only the threads that are on the phone', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')], [{ id: 'w-1', product: 'alpha' }, { id: 'w-2', product: 'alpha' }, { id: 'w-9', product: 'beta' }, { id: 'agent-x', product: 'alpha' }]);
    await t.pass();
    expect(t.messages()[0].badge).toBe(2);
  });

  it('is not alerted again for the same state, and is when it needs you again', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    // Back at the Mac, then away again: a new stretch.
    t.world.idle = 0;
    await t.pass();
    t.world.idle = 10 * 60_000;
    t.arrive([t.item('w-1')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(1);
    t.world.items.alpha[0] = row('w-1', { wrote: { status: { ts: NOW + 600_000, source: 'agent' } }, updatedAt: NOW + 600_000 });
    await t.inbox.syncOnce();
    t.arrive([t.item('w-1')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(2);
  });

  it('remembers what it alerted across a restart of the app', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    const file = JSON.parse(fs.readFileSync(t.stateFile, 'utf8'));
    expect(Object.keys(file.alerted)).toEqual(['alpha:w-1']);
  });
});

describe('when there is nothing to send', () => {
  it('says nothing while you have used this Mac in the last five minutes', async () => {
    const t = setup();
    await t.ready;
    t.world.idle = AWAY_AFTER_MS - 1000;
    t.arrive([t.item('w-1')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });

  it('drops an arrival you came back to before it went', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    t.world.idle = 2000;
    await t.pass();
    t.world.idle = 10 * 60_000;
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });

  it('never alerts a thread that is not on the phone', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-9', 'beta'), { id: 'agent-x', title: 'x', product: 'alpha', kind: 'item' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });

  it('sends nothing with no phone that turned alerts on', async () => {
    const t = setup({ devices: [] });
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });
});

describe('once for the whole time you are away', () => {
  it('then again only for a permission card, which has a clock on it', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    t.tick(10 * 60_000);
    t.arrive([t.item('w-2')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(1);
    t.arrive([{ id: 'ap-1', title: 'rm -rf build', thread: `${SECRET} w-3`, item: 'w-3', product: 'alpha', productName: 'Alpha', kind: 'approval' }], [{ id: 'w-1', product: 'alpha' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(2);
    expect(t.messages()[1].data).toEqual({ product: phoneSlug(t.inbox.device, 'alpha'), id: 'w-3' });
    t.arrive([{ id: 'ap-2', title: 'ls', item: 'w-2', product: 'alpha', kind: 'approval' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(2);
  });

  it('starts over once you have answered from your phone', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    await t.phone.addPhoneCommand({ device: t.inbox.device, project: 'alpha', item: 'w-1', kind: 'close', payload: {} });
    await t.inbox.syncOnce();
    t.arrive([t.item('w-2')]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(2);
  });
});

describe('what Expo is handed', () => {
  it('heads a permission card with the thread that asks, and what it asks to run under it', async () => {
    const t = setup();
    await t.ready;
    t.arrive([{ id: 'ap-1', title: 'npm test', thread: `${SECRET} w-2`, item: 'w-2', product: 'alpha', productName: 'Alpha', kind: 'approval' }]);
    await t.pass();
    expect(t.messages()[0]).toMatchObject({ title: `${SECRET} w-2`, body: 'Waiting on you: npm test' });
  });

  it('names a thread whose arrival came without a title by its copy on the phone', async () => {
    const t = setup();
    await t.ready;
    t.arrive([{ id: 'w-1', product: 'alpha', kind: 'item' }]);
    await t.pass();
    expect(t.messages()[0].title).toBe(`${SECRET} w-1`);
  });

  it('carries the title and nothing else of the thread or its project', async () => {
    const t = setup();
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    const said = JSON.stringify(t.messages());
    for (const words of ['confidential', 'private note', 'Alpha']) expect(said).not.toContain(words);
  });

  it('drops a phone Expo says is gone, and keeps the rest', async () => {
    const t = setup({ devices: [TOKEN, OTHER], tickets: { [OTHER]: { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } } });
    await t.ready;
    t.arrive([t.item('w-1')]);
    await t.pass();
    expect((await t.mac.pushDevices()).map((d) => d.token)).toEqual([TOKEN]);
  });

  it('says a failure once, and the pass goes on', async () => {
    const t = setup({ fail: 'getaddrinfo ENOTFOUND exp.host' });
    await t.ready;
    t.arrive([t.item('w-1')]);
    await expect(t.pass()).resolves.toBeUndefined();
    t.world.idle = 0; await t.pass(); t.world.idle = 10 * 60_000;
    t.arrive([t.item('w-2')]);
    await t.pass();
    expect(t.world.logs.filter((l) => /alert/.test(l) && /ENOTFOUND/.test(l))).toHaveLength(1);
    // Never tried again on its own: the next alert is the next arrival.
    t.world.fail = null;
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });
});

describe('the call to Expo', () => {
  it('posts every phone in one request to Expo\'s push address', async () => {
    const asked = [];
    const fetchImpl = async (url, init) => { asked.push({ url, init }); return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'a' }] }), { status: 200 }); };
    const tickets = await sendToExpo([{ to: TOKEN, title: 'Agentbox', body: 'A thread needs you.' }], { fetchImpl });
    expect(tickets).toEqual([{ status: 'ok', id: 'a' }]);
    expect(asked[0].url).toBe(EXPO_PUSH);
    expect(EXPO_PUSH).toBe('https://exp.host/--/api/v2/push/send');
    expect(asked[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ends a call Expo never answers', async () => {
    const server = http.createServer(() => { /* never answers */ });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/push`;
    try {
      const at = Date.now();
      await expect(sendToExpo([{ to: TOKEN }], { url, deadlineMs: 300 })).rejects.toThrow();
      expect(Date.now() - at).toBeLessThan(3000);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });

  it('turns down an answer that is not Expo\'s', async () => {
    const fetchImpl = async () => new Response('Bad gateway', { status: 502 });
    await expect(sendToExpo([{ to: TOKEN }], { fetchImpl })).rejects.toThrow(/502/);
  });
});

describe('how the window\'s arrivals reach Expo', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the banner\'s arrivals, with the inbox, go through the signed-in Mac to her phone', async () => {
    disk._internals.forgetFolds();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-alerts-e2e-'));
    const accountRoot = path.join(dir, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: dir, accountId: 'a', accountRoot, products: [] }).init();
    store.createProduct({ name: 'Alpha' });
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'owner@example.com' });
    await memoryBackend(cloud, me).putPushDevice({ token: TOKEN, platform: 'ios' });
    let clock = Date.now();
    const service = createTeamService({
      session: memorySession(() => memoryBackend(cloud, me)),
      store, disk, accountRoot, stateFile: path.join(dir, '.team-sync.json'), intervalMs: 3_600_000, now: () => clock,
      phone: { projects: () => ({ owner: me, slugs: ['alpha'] }), apply: async () => ({ ok: true }), stateFile: path.join(dir, '.phone-inbox.json'), idleMs: () => 10 * 60_000 },
    });
    const posted = [];
    vi.stubGlobal('fetch', async (url, init) => {
      posted.push({ url, body: JSON.parse(init.body), signal: init.signal });
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 't' }] }), { status: 200 });
    });
    try {
      await service.signIn();
      const a = store.composeItem('alpha', { title: SECRET, body: 'x' });
      await service.syncNow();
      const handlers = {};
      installNotifier({
        app: { getAppPath: () => dir }, window: { on() {}, isDestroyed: () => false, isFocused: () => false },
        Notification: { isSupported: () => false }, powerMonitor: { on() {}, getSystemIdleTime: () => 600 },
        ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } }, nativeImage: null,
        onArrivals: (list, needsYou) => service.phoneArrivals(list, needsYou),
      });
      await handlers['zero:notify']({}, { arrivals: [{ id: a.id, title: SECRET, product: 'alpha', productName: 'Alpha', kind: 'item' }], needsYou: [{ id: a.id, product: 'alpha' }] });
      clock += FOLD_MS;
      await service.syncNow();
      expect(posted.map((p) => p.url)).toEqual([EXPO_PUSH]);
      const device = (await memoryBackend(cloud, me).phoneProjects())[0].device;
      expect(posted[0].body).toEqual([expect.objectContaining({ to: TOKEN, title: SECRET, body: 'An agent is ready', badge: 1, data: { product: phoneSlug(device, 'alpha'), id: a.id } })]);
    } finally {
      await service.signOut();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the window says which inbox the arrivals came in, and an approval\'s thread', () => {
    const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    expect(WRAPPED_ARGS.notify).toEqual(['arrivals', 'needsYou']);
    expect(read('preload.cjs')).toMatch(/notify: \(arrivals, needsYou\) => ipcRenderer\.invoke\('zero:notify', \{ arrivals, needsYou \}\)/);
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/item: a\.item \?\? null,/);
    expect(app).toMatch(/window\.zero\?\.notify\?\.\(arrivals, inbox\.filter\(\(i\) => i\.product\)\.map\(\(i\) => \(\{ id: i\.id, product: i\.product as string \}\)\)\)/);
    const main = read('main/main.mjs');
    expect(main).toMatch(/onArrivals: \(list, needsYou\) => team\?\.phoneArrivals\(list, needsYou\)/);
    expect(main).toMatch(/idleMs: \(\) => powerMonitor\.getSystemIdleTime\(\) \* 1000/);
  });
});
