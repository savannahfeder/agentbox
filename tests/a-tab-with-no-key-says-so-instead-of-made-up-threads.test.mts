// A TAB OPENED WITHOUT ITS KEY SAYS SO, INSTEAD OF DRAWING AN INVENTED INBOX.
//
// The screen decides between the real store and its canned fixtures by asking
// whether a bridge is there (renderer/src/api.ts). In a browser tab the bridge
// is built from the key in the address (renderer/src/browser-bridge.ts), so an
// address with no key on it left no bridge and the screen quietly drew the
// fixtures: three products nobody owns and fifteen threads nobody wrote, with
// nothing on screen saying they were made up. Measured on the Linux QA box on
// 2026-10-27 at http://127.0.0.1:7818/ with no ?token=: NEEDS YOU 15, projects
// ONBOARD, KESTREL and THICKET, and the person's own thread nowhere.
//
// The fixtures themselves are right where they are: a design preview opens the
// built screen with no bridge on purpose. What was missing is the page knowing
// which of the two it is, so the door now marks the html it serves.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, newToken } from '../main/serve.mts';

describe('the door marks the page it serves', () => {
  let server, base, token, dist;

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-no-key-'));
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Agentbox</title></head><body><div id="root"></div></body></html>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
    token = newToken();
    server = createServer({ channels: new Map(), token, dist });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise((done) => server.close(done));
    fs.rmSync(dist, { recursive: true, force: true });
  });

  it('marks the page, with or without the key, by either name', async () => {
    for (const at of ['/', `/?token=${token}`, '/index.html', '/threads']) {
      const said = await (await fetch(`${base}${at}`)).text();
      expect(said, at).toContain('name="agentbox-door"');
      expect(said, at).toContain('<div id="root">');
    }
  });

  it('marks nothing but the page', async () => {
    const script = await fetch(`${base}/assets/app.js`);
    expect(await script.text()).toBe('console.log(1)');
  });
});

/**
 * Just enough browser for the bridge, as tests/a-browser-tab-reaches-the-real-
 * store.test.mjs builds it, plus the one thing this behaviour reads: a page
 * that may or may not carry the door's mark.
 */
function fakeBrowser(url, { marked, kept = null } = {}) {
  const made = [];
  const element = () => {
    const node = { id: '', tagName: '', dataset: {}, children: [], attributes: {}, innerHTML: '', textContent: '',
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(child) { this.children.push(child); return child; } };
    return node;
  };
  const body = element();
  const document = {
    documentElement: element(),
    head: element(),
    body,
    createElement(tag) { const node = element(); node.tagName = tag; made.push(node); return node; },
    getElementById: (id) => [body, ...body.children].find((n) => n.id === id) ?? null,
    querySelector: (selector) => (selector === 'meta[name="agentbox-door"]' && marked ? element() : null),
  };
  const session = new Map();
  const local = new Map(kept ? [['agentbox-token', kept]] : []);
  globalThis.location = new URL(url);
  globalThis.document = document;
  globalThis.history = { replaceState: (_s, _t, next) => { globalThis.location = new URL(next); } };
  globalThis.sessionStorage = { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)) };
  globalThis.localStorage = { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, String(v)) };
  globalThis.crypto ??= { getRandomValues: (a) => a };
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
  globalThis.EventSource = class { constructor(at) { this.url = at; } close() {} };
  globalThis.window = globalThis;
  globalThis.zero = undefined;
  globalThis.addEventListener ??= () => {};
  return { document, body };
}

async function freshBridge() {
  vi.resetModules();
  return import('../renderer/src/browser-bridge.ts');
}

describe('a tab on this computer with no key', () => {
  afterAll(() => {
    for (const key of ['location', 'document', 'history', 'sessionStorage', 'localStorage', 'fetch', 'EventSource', 'window', 'zero']) {
      delete globalThis[key];
    }
  });

  it('says what the link is missing rather than drawing anything', async () => {
    const { document, body } = fakeBrowser('http://127.0.0.1:7818/', { marked: true });
    const { installBrowserBridge, theDoorNeedsItsKey } = await freshBridge();
    expect(installBrowserBridge()).toBe(false);
    expect(theDoorNeedsItsKey()).toBe(true);
    expect(globalThis.window.zero).toBeUndefined();
    const said = body.children.map((n) => n.innerHTML).join(' ');
    expect(said).toMatch(/key/i);
    // The one thing a person can act on: the address the terminal printed.
    expect(said).toContain('token=');
    expect(document.getElementById('needs-its-key')).toBeTruthy();
  });

  it('says it once, however many times the screen asks', async () => {
    const { body } = fakeBrowser('http://127.0.0.1:7818/', { marked: true });
    const { installBrowserBridge } = await freshBridge();
    installBrowserBridge();
    installBrowserBridge();
    expect(body.children.filter((n) => n.id === 'needs-its-key')).toHaveLength(1);
  });

  it('tells a phone to scan the code again, which is how a phone gets one', async () => {
    const { body } = fakeBrowser('http://100.64.1.7:7818/', { marked: true });
    const { installBrowserBridge, theDoorNeedsItsKey } = await freshBridge();
    expect(installBrowserBridge()).toBe(false);
    expect(theDoorNeedsItsKey()).toBe(true);
    expect(body.children.map((n) => n.innerHTML).join(' ')).toMatch(/scan/i);
  });
});

describe('what must not change', () => {
  it('leaves a design preview on its fixtures: no mark, no key, nothing said', async () => {
    const { body } = fakeBrowser('http://localhost:5173/?fixtures=1', { marked: false });
    const { installBrowserBridge, theDoorNeedsItsKey } = await freshBridge();
    expect(installBrowserBridge()).toBe(false);
    expect(theDoorNeedsItsKey()).toBe(false);
    expect(body.children).toHaveLength(0);
  });

  it('leaves a tab that has its key alone', async () => {
    const { body } = fakeBrowser('http://127.0.0.1:7818/?token=abc123abc123abc123abc123', { marked: true });
    const { installBrowserBridge, theDoorNeedsItsKey } = await freshBridge();
    expect(installBrowserBridge()).toBe(true);
    expect(theDoorNeedsItsKey()).toBe(false);
    expect(body.children).toHaveLength(0);
    expect(typeof globalThis.window.zero).toBe('object');
  });

  it('leaves a reload alone: the key is in sessionStorage, not the address', async () => {
    fakeBrowser('http://127.0.0.1:7818/?token=abc123abc123abc123abc123', { marked: true });
    const { installBrowserBridge, theDoorNeedsItsKey } = await freshBridge();
    installBrowserBridge();
    // The reload: same tab, same sessionStorage, an address with no key on it.
    globalThis.location = new URL('http://127.0.0.1:7818/');
    globalThis.zero = undefined;
    expect(installBrowserBridge()).toBe(true);
    expect(theDoorNeedsItsKey()).toBe(false);
  });

  it('draws nothing at all when the door needs its key', async () => {
    const main = fs.readFileSync(new URL('../renderer/src/main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/theDoorNeedsItsKey\(\)/);
    expect(main).toMatch(/if \(!theDoorNeedsItsKey\(\)\) boot\(\);/);
  });
});
