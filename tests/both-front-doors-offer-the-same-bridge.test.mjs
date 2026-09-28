// THE TWO DOORS HAVE TO OFFER THE SCREEN THE SAME THING.
//
// `window.zero` is the whole of what the screen may ask for. On the desktop
// preload.cjs builds it out of Electron. In a browser tab
// renderer/src/browser-bridge.ts builds it out of http. One screen, built once,
// runs against either.
//
// The failure being guarded is the cheap one and it is silent: somebody adds a
// channel, wires it into preload.cjs because that is the file they had open,
// and the browser route quietly loses a feature. Nothing throws. The button is
// just dead, and only in the door nobody on this team uses daily.
//
// shared/bridge-map.mjs is what stops that, by being the list both doors read.
// This file is what stops the map itself drifting: it reads preload.cjs as text
// and asserts the map says exactly what preload does, name for name and channel
// for channel.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUEST_CHANNELS, PUSH_CHANNELS, WRAPPED_ARGS, DESKTOP_ONLY } from '../shared/bridge-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const preload = fs.readFileSync(path.join(repoRoot, 'preload.cjs'), 'utf8');

// What preload.cjs actually exposes, read off the source rather than believed.
// Two shapes: the one-liners that invoke a channel, and the block-bodied
// `onSomething` subscriptions that listen on one.
const exposedRequests = Object.fromEntries(
  [...preload.matchAll(/^\s{2}(\w+):\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\('([^']+)'/gm)]
    .map((m) => [m[1], m[2]]),
);
const exposedPushes = Object.fromEntries(
  [...preload.matchAll(/^\s{2}(\w+):\s*\([^)]*\)\s*=>\s*\{(?:(?!ipcRenderer\.invoke)[\s\S])*?ipcRenderer\.on\('([^']+)'/gm)]
    .map((m) => [m[1], m[2]]),
);

describe('shared/bridge-map.mjs', () => {
  it('lists every request channel preload exposes, under the same name', () => {
    expect(REQUEST_CHANNELS).toEqual(exposedRequests);
  });

  it('lists every push channel preload listens on', () => {
    expect(PUSH_CHANNELS).toEqual(exposedPushes);
  });

  it('accounts for every name on the bridge, one way or another', () => {
    // Everything preload puts on `window.zero`. If a name is neither a request,
    // nor a push, nor declared desktop-only, the browser door does not have it
    // and nothing has said so on purpose.
    const body = preload.slice(preload.indexOf('exposeInMainWorld'));
    const allNames = [...body.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    const covered = new Set([
      ...Object.keys(REQUEST_CHANNELS),
      ...Object.keys(PUSH_CHANNELS),
      ...DESKTOP_ONLY,
    ]);
    expect(allNames.filter((n) => !covered.has(n))).toEqual([]);
  });

  it('wraps the three that hand over bare values rather than an object', () => {
    for (const [name, keys] of Object.entries(WRAPPED_ARGS)) {
      expect(REQUEST_CHANNELS).toHaveProperty(name);
      // The keys have to match the argument names preload destructures into,
      // because the handler on the far side reads them by name.
      const at = preload.indexOf(`  ${name}: (`);
      expect(at).toBeGreaterThan(-1);
      const decl = preload.slice(at, preload.indexOf('\n', at));
      for (const key of keys) expect(decl).toContain(key);
    }
  });
});

describe('renderer/src/browser-bridge.ts', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'renderer', 'src', 'browser-bridge.ts'), 'utf8');

  it('builds the bridge from the map rather than a list of its own', () => {
    // A hand-written second list is the thing this whole file exists to prevent,
    // so the browser door must not contain one.
    expect(source).toContain("from '../../shared/bridge-map.mjs'");
    expect(source.match(/'zero:[a-z-]+'/g) ?? []).toEqual([]);
  });

  it('never takes a bridge off a desktop window that already has one', () => {
    expect(source).toMatch(/if \(typeof window === 'undefined' \|\| \(window as any\)\.zero\) return false;/);
  });

  it('is installed by api.ts before api.ts reads window.zero', () => {
    const api = fs.readFileSync(path.join(repoRoot, 'renderer', 'src', 'api.ts'), 'utf8');
    const installed = api.indexOf('installBrowserBridge()');
    const read = api.indexOf('!window.zero');
    expect(installed).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(installed);
  });

  it('keeps the token out of the address bar', () => {
    // It is a password. It must not sit in a screenshot, or ride along in a url
    // somebody copies out of the tab.
    expect(source).toContain("url.searchParams.delete('token')");
    expect(source).toContain('history.replaceState');
  });
});
