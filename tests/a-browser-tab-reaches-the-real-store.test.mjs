// THE WHOLE ROUTE, END TO END, WITH NO ELECTRON ANYWHERE.
//
// The other two files each prove one half. tests/the-doing-half-runs-with-no-
// electron.test.mjs proves the server answers. tests/both-front-doors-offer-
// the-same-bridge.test.mjs proves the two doors offer the same names. Neither
// proves the thing that matters, which is that the code the browser actually
// runs talks to the code the terminal actually starts.
//
// So this runs the real browser bridge, the file the bundle is built from, with
// a stand-in browser around it, against a real server on a real throwaway
// store. The only thing invented here is the window.
//
// WHY NOT A HEADLESS BROWSER. There is none in this tree, and adding one to run
// a suite that has 525 files in it is a poor trade. What a browser would add
// over this is React, and React is not what is new.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootHeadless, createServer, newToken } from '../main/serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

let dir, booted, server, token, base, bridge, streams;

/**
 * Just enough browser for the bridge to run in.
 *
 *  It touches five things: location, history, sessionStorage, fetch and
 *  EventSource. Everything else about a browser is React's problem, not this
 *  file's.
 */
function fakeBrowser(url) {
  const store = new Map();
  const streams = [];
  globalThis.location = new URL(url);
  globalThis.history = { replaceState: (_s, _t, next) => { globalThis.location = new URL(next); } };
  globalThis.sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };
  // The bridge fetches relative paths, the way a page served from the same
  // origin does. Node's fetch wants an absolute one.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => realFetch(new URL(input, base), init);
  const opened = [];
  globalThis.EventSource = class {
    constructor(at) { this.url = new URL(at, base).toString(); opened.push(this); }
  };
  globalThis.window = globalThis;
  return opened;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-tab-'));
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
  booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
  token = newToken();
  server = createServer({
    channels: booted.channels, token, listeners: booted.window.listeners,
    dist: path.join(dir, 'no-screen-here'),
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;

  streams = fakeBrowser(`${base}/?token=${token}`);
  const { installBrowserBridge } = await import('../renderer/src/browser-bridge.ts');
  const installed = installBrowserBridge();
  expect(installed).toBe(true);
  bridge = globalThis.window.zero;
}, 30_000);

afterAll(async () => {
  if (server) await new Promise((done) => server.close(done));
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  for (const key of ['location', 'history', 'sessionStorage', 'EventSource', 'window', 'zero']) {
    delete globalThis[key];
  }
});

describe('a browser tab, pointed at a local agentbox', () => {
  it('ends up with the same bridge the desktop has', async () => {
    // Everything preload exposes: the ones asked for, the ones listened on, and
    // the one only a desktop can answer. Counted off the map rather than typed,
    // because a number typed here is edited to pass rather than read.
    const { REQUEST_CHANNELS, PUSH_CHANNELS, DESKTOP_ONLY } = await import('../shared/bridge-map.mjs');
    const expected = Object.keys(REQUEST_CHANNELS).length
      + Object.keys(PUSH_CHANNELS).length
      + DESKTOP_ONLY.length;
    expect(Object.keys(bridge).length).toBe(expected);
    expect(typeof bridge.snapshot).toBe('function');
    expect(typeof bridge.onChanged).toBe('function');
  });

  it('reads a real snapshot out of a real store', async () => {
    const snapshot = await bridge.snapshot();
    for (const key of ['products', 'items', 'agents', 'approvals', 'supervisor']) {
      expect(snapshot).toHaveProperty(key);
    }
  });

  it('sends the three bare-value calls as the object the handler reads', async () => {
    // `track` is called with a name and the handler wants { name }. Getting this
    // wrong looks like nothing at all, because tracking is fire and forget.
    const seen = [];
    const real = booted.channels.get('zero:track');
    booted.channels.set('zero:track', async (_event, payload) => { seen.push(payload); return { ok: true }; });
    await bridge.track('a-test-ran');
    booted.channels.set('zero:track', real);
    expect(seen).toEqual([{ name: 'a-test-ran' }]);
  });

  it('takes the token out of the address bar and keeps it for a reload', () => {
    expect(globalThis.location.search).not.toContain('token');
    expect(globalThis.sessionStorage.getItem('agentbox-token')).toBe(token);
  });

  it('says what went wrong in a sentence when a channel is not there', async () => {
    // The screen shows whatever comes back, so a status code would reach her.
    booted.channels.delete('zero:badge');
    const bare = { ...bridge };
    await expect(bare.badge(1)).rejects.toThrow(/zero:badge/);
  });

  it('opens one event stream, carrying its token', () => {
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toContain(`/events?token=${encodeURIComponent(token)}`);
  });

  it('hands a push from the app to the screen that subscribed to it', () => {
    const changed = [];
    const zoomed = [];
    const stopChanged = bridge.onChanged((payload) => changed.push(payload));
    bridge.onZoomPercent((payload) => zoomed.push(payload));

    // Exactly what the server writes down the stream: the channel and the args
    // `window.webContents.send` was called with.
    const deliver = (channel, ...args) =>
      streams[0].onmessage({ data: JSON.stringify({ channel, args }) });

    deliver('zero:changed', { what: 'items' });
    deliver('zero:zoom-percent', 125);

    expect(changed).toEqual([{ what: 'items' }]);
    // One stream carries all eight channels, so a listener must only hear its own.
    expect(zoomed).toEqual([125]);

    stopChanged();
    deliver('zero:changed', { what: 'agents' });
    expect(changed).toHaveLength(1);
  });

  it('shrugs off a message that is not a push', () => {
    // A proxy injecting something, or a heartbeat read as data. It must not
    // take the page down.
    expect(() => streams[0].onmessage({ data: 'not json' })).not.toThrow();
    expect(() => streams[0].onmessage({ data: '{"no":"channel"}' })).not.toThrow();
  });

  it('does not let one broken listener stop the next one hearing', () => {
    const heard = [];
    bridge.onRecovered(() => { throw new Error('this component unmounted badly'); });
    bridge.onRecovered((payload) => heard.push(payload));
    streams[0].onmessage({ data: JSON.stringify({ channel: 'zero:recovered', args: [{ put: 2 }] }) });
    expect(heard).toEqual([{ put: 2 }]);
  });
});
