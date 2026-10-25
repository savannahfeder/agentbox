// A PHONE THAT SCANNED AN OLDER CODE TAKES THE NEW ONE (2026-10-16).
//
// Reported: "whenever I scan this with my phone, it gets stuck."
//
// Measured in a phone-sized Electron window against the live relay and the
// running app: a fresh phone reached the inbox in 3 s, but a phone that had
// once opened a different code (an earlier key, or another copy of the app)
// sat on "Connecting" for 20 s, then said "Your computer is not connected" and
// kept saying it every 8 s, with the computer on and answering. The phone's
// worker (relay/phone/sw.mjs) answered the page with the key it had kept,
// before the first page that stores the new key could run, and a new key is a
// new room, so the old one only ever heard nobody. Now a page opened at
// …/#k=<key> runs on that key; where a browser hides the # from the worker,
// the "not connected" page hands the key over and reloads.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memory = vi.hoisted(() => ({ key: null, writes: 0 }));
const tunnelled = vi.hoisted(() => []);

vi.mock('../relay/phone/store.mjs', async (importOriginal) => {
  const real = await importOriginal();
  const read = async () => memory.key;
  const write = async (k) => { memory.key = k; memory.writes += 1; };
  return { ...real, readKey: read, writeKey: write, keyFor: (url) => real.keyFor(url, { read, write }) };
});
vi.mock('../relay/phone/tunnel.mjs', async (importOriginal) => {
  const real = await importOriginal();
  const tunnelFetch = async (_request, ctx) => { tunnelled.push(ctx.room); return new Response('inbox'); };
  return { ...real, tunnelFetch, withPatience: (once) => once() };
});

const OLD = 'o'.repeat(43);
const NEW = 'n'.repeat(43);
const SITE = 'https://relay.test';

describe('which key a page opened at an address runs on', async () => {
  const { keyFor } = await vi.importActual('../relay/phone/store.mjs');
  const keeper = (start) => {
    const k = { key: start, writes: 0 };
    return { k, deps: { read: async () => k.key, write: async (v) => { k.key = v; k.writes += 1; } } };
  };

  it('a newly scanned key replaces the kept one', async () => {
    const { k, deps } = keeper(OLD);
    expect(await keyFor(`${SITE}/#k=${NEW}`, deps)).toBe(NEW);
    expect(k.key).toBe(NEW);
  });

  it('the same key scanned again writes nothing', async () => {
    const { k, deps } = keeper(NEW);
    expect(await keyFor(`${SITE}/#k=${NEW}`, deps)).toBe(NEW);
    expect(k.writes).toBe(0);
  });

  it('an address with no key (the home-screen icon, a request inside the app) keeps the kept one', async () => {
    const { k, deps } = keeper(OLD);
    expect(await keyFor(`${SITE}/`, deps)).toBe(OLD);
    expect(await keyFor(null, deps)).toBe(OLD);
    expect(await keyFor('not an address', deps)).toBe(OLD);
    expect(k.writes).toBe(0);
  });

  it('a too-short k= is not a key', async () => {
    const { deps } = keeper(OLD);
    expect(await keyFor(`${SITE}/#k=short`, deps)).toBe(OLD);
  });
});

describe('the phone\'s worker', () => {
  const handlers = {};
  beforeEach(async () => {
    vi.resetModules();
    tunnelled.length = 0;
    memory.key = OLD;
    memory.writes = 0;
    globalThis.self = {
      location: new URL(`${SITE}/relay-sw.js`),
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting() {},
      clients: { claim: async () => {} },
    };
    await import('../relay/phone/sw.mjs');
  });

  const open = async (url, mode = 'navigate') => {
    let answer;
    handlers.fetch({ request: { url, mode, headers: new Headers() }, respondWith: (p) => { answer = p; } });
    return answer;
  };
  const roomOf = async (key) => (await import('../shared/relay-crypto.mjs')).relayIds(key).then((r) => r.room);

  it('opens a scanned code in the new key\'s room, not the kept one\'s', async () => {
    await open(`${SITE}/#k=${NEW}`);
    expect(tunnelled).toEqual([await roomOf(NEW)]);
    expect(memory.key).toBe(NEW);
  });

  it('opens the app with no code in the kept key\'s room', async () => {
    await open(`${SITE}/`);
    expect(tunnelled).toEqual([await roomOf(OLD)]);
  });

  it('takes no key from a request that is not opening a page', async () => {
    await open(`${SITE}/api/zero:snapshot#k=${NEW}`, 'cors');
    expect(tunnelled).toEqual([await roomOf(OLD)]);
    expect(memory.key).toBe(OLD);
  });

  it('takes a key handed over by the page, and says so only when it changed', async () => {
    const said = [];
    const message = async (key) => {
      let done;
      handlers.message({ data: { key }, source: { postMessage: (m) => said.push(m) }, waitUntil: (p) => { done = p; } });
      await done;
    };
    await message(NEW);
    expect(memory.key).toBe(NEW);
    expect(said).toEqual(['key-taken']);
    await message(NEW);
    expect(said).toEqual(['key-taken']);
  });
});

describe('the "not connected" page', async () => {
  const { TAKE_KEY } = await vi.importActual('../relay/phone/tunnel.mjs');
  const run = (hash, { controller = true } = {}) => {
    const posted = [];
    const listeners = {};
    let reloads = 0;
    const location = { hash, reload: () => { reloads += 1; } };
    const navigator = { serviceWorker: { controller: controller ? { postMessage: (m) => posted.push(m) } : null, addEventListener: (t, fn) => { listeners[t] = fn; } } };
    new Function('location', 'navigator', TAKE_KEY)(location, navigator);
    return { posted, reply: (data) => listeners.message?.({ data }), reloads: () => reloads };
  };

  it('hands the worker the key it was opened with, and reloads once it is taken', () => {
    const p = run(`#k=${NEW}`);
    expect(p.posted).toEqual([{ key: NEW }]);
    p.reply('key-taken');
    expect(p.reloads()).toBe(1);
  });

  it('does not reload on anything else the worker says', () => {
    const p = run(`#k=${NEW}`);
    p.reply('something else');
    expect(p.reloads()).toBe(0);
  });

  it('hands over nothing when opened with no key, or with no worker', () => {
    expect(run('').posted).toEqual([]);
    expect(run(`#k=${NEW}`, { controller: false }).posted).toEqual([]);
  });
});
