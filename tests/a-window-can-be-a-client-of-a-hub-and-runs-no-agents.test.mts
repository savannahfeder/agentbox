// A WINDOW CAN BE A CLIENT OF A HUB AND RUNS NO AGENTS.
//
// With agents in the cloud a 16 GB Mac was still swapping (2026-10-30): the Mac
// holds the store, a task folder for every thread, one process per cloud run,
// the packing, the bringing home and the shipping, so what it costs grows with
// every agent, and 200 cannot work however cheap each part is. The design agreed
// with Codex moves all of that to one headless copy (main/serve.mts) on a machine
// of its own, the hub, and the Mac keeps a window. This is that window: when a hub
// is named, no store and no supervisor are even loaded.
//
// What must never happen: a Mac that names a hub also starting agents, a key sent
// in the clear to another machine, a link opening on the hub instead of here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readHubAddress, whichApp } from '../main/hub-address.mts';
import { withDesktopShell, onPhoneDoor } from '../renderer/src/browser-bridge';
import { mayOpenOutside, sameHub } from '../main/hub-rules.mts';
import { stripTypesFlags } from '../main/strip-types.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
const write = (dir, data) => { fs.mkdirSync(path.join(dir, '.agentbox'), { recursive: true }); fs.writeFileSync(path.join(dir, '.agentbox', 'hub.json'), JSON.stringify(data)); };
const KEY = 'k'.repeat(32);

describe('whether this Mac has a hub', () => {
  it('no file and nothing in the environment: it does not, and the app starts as it always has', () => {
    expect(readHubAddress({}, home())).toBeNull();
  });

  it('a file naming an https hub and its key: it does', () => {
    const dir = home();
    write(dir, { url: 'https://hub.example.com/', key: KEY });
    expect(readHubAddress({}, dir)).toEqual({ url: 'https://hub.example.com', key: KEY });
  });

  it('this computer over plain http is allowed, because nothing leaves it', () => {
    const dir = home();
    write(dir, { url: 'http://127.0.0.1:4000', key: KEY });
    expect(readHubAddress({}, dir)?.url).toBe('http://127.0.0.1:4000');
  });

  it('another computer over plain http is refused: the key would cross the network readable', () => {
    const dir = home();
    write(dir, { url: 'http://hub.example.com', key: KEY });
    expect(readHubAddress({}, dir).invalid).toBeTruthy();
    write(dir, { url: 'http://127.0.0.1.example.com', key: KEY });
    expect(readHubAddress({}, dir).invalid).toBeTruthy();
  });

  it('a damaged file, a missing or short key, or another scheme is refused, and is not the same as no hub', () => {
    const dir = home();
    fs.mkdirSync(path.join(dir, '.agentbox'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agentbox', 'hub.json'), '{not json');
    expect(readHubAddress({}, dir).invalid).toMatch(/hub\.json/);
    write(dir, { url: 'https://hub.example.com' });
    expect(readHubAddress({}, dir).invalid).toBeTruthy();
    write(dir, { url: 'https://hub.example.com', key: 'short' });
    expect(readHubAddress({}, dir).invalid).toBeTruthy();
    write(dir, { url: 'file:///etc/passwd', key: KEY });
    expect(readHubAddress({}, dir).invalid).toBeTruthy();
    expect(readHubAddress({ AGENTBOX_HUB: 'nonsense' }, home()).invalid).toBeTruthy();
  });

  it('a Mac that names a hub it cannot use starts no agents: two copies must never own one store', () => {
    expect(whichApp(null)).toBe('whole');
    expect(whichApp({ url: 'https://hub.example.com', key: KEY })).toBe('client');
    expect(whichApp({ invalid: 'damaged' })).toBe('refuse');
  });

  it('the browser copy will not start agents on a Mac that names a hub either', () => {
    const dir = home();
    write(dir, { url: 'https://hub.example.com', key: KEY });
    const env = { ...process.env, HOME: dir };
    for (const k of Object.keys(env)) if (/^(AGENTBOX_|ZERO_|STORE_|ASTRAL_|XDG_)/.test(k)) delete env[k];
    const data = path.join(dir, 'data');
    const ran = spawnSync(process.execPath, [...stripTypesFlags(), path.join(root, 'bin', 'agentbox.mjs'), '--dir', data, '--no-open'], { env, encoding: 'utf8', timeout: 20_000 });
    expect(ran.status).toBe(1);
    expect(ran.stderr).toMatch(/hub/);
    expect(fs.existsSync(path.join(data, 'zero.config.json'))).toBe(false);
  });

  it('the environment names one for a test copy, ahead of the file', () => {
    const dir = home();
    write(dir, { url: 'https://hub.example.com', key: KEY });
    expect(readHubAddress({ AGENTBOX_HUB: 'http://localhost:5000', AGENTBOX_HUB_KEY: KEY }, dir)?.url).toBe('http://localhost:5000');
  });
});

describe('the client carries no part of the hub', () => {
  const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  function reach(file, seen = new Set()) {
    if (seen.has(file)) return seen;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) reach(path.resolve(path.dirname(file), m[1] ?? m[2]), seen);
    return seen;
  }
  it('nothing the client loads reaches the store, the supervisor or the handlers', () => {
    const loaded = [...reach(path.join(root, 'main', 'hub-client.mts'))].map((f) => path.relative(root, f));
    for (const heavy of ['main/supervisor.mts', 'main/store.mts', 'main/ipc.mts', 'main/main.mts', 'main/serve.mts']) expect(loaded).not.toContain(heavy);
  });

  it('the app starts from a file that loads one or the other, never both', () => {
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main).toBe('main/start.mjs');
    const start = fs.readFileSync(path.join(root, 'main', 'start.mjs'), 'utf8');
    expect(start).not.toMatch(/^\s*import\s[^(]*from\s*['"]\.\/(main|hub-client)\.m[jt]s/m);
    expect(start).toMatch(/import\(['"]\.\/main\.mts['"]\)/);
    expect(start).toMatch(/import\(['"]\.\/hub-client\.mts['"]\)/);
  });
});

describe('what stays on this Mac', () => {
  const made = () => ({ calls: [], notify(p) { this.calls.push(['notify', p]); return Promise.resolve(null); }, badge(c) { this.calls.push(['badge', c]); return Promise.resolve(null); }, open(u) { this.calls.push(['open', u]); return Promise.resolve(true); } });

  it('an alert and the Dock count are this Mac\'s, and do not go to the hub', async () => {
    const shell = made();
    const asked = [];
    const bridge = withDesktopShell({ notify: (...a) => asked.push(a), badge: (...a) => asked.push(a) }, shell);
    await bridge.notify(3, 2);
    await bridge.badge(5);
    expect(shell.calls).toEqual([['notify', { arrivals: 3, needsYou: 2 }], ['badge', 5]]);
    expect(asked).toEqual([]);
  });

  it('a web link opens here; a file of the thread still goes to the hub', async () => {
    const shell = made();
    const asked = [];
    const bridge = withDesktopShell({ openArtifact: (p) => { asked.push(p); return { ok: true }; } }, shell);
    expect(await bridge.openArtifact({ src: 'https://example.com/a' })).toEqual({ ok: true, opened: 'https://example.com/a' });
    expect(shell.calls).toEqual([['open', 'https://example.com/a']]);
    await bridge.openArtifact({ src: 'designs/a.png' });
    expect(asked).toEqual([{ src: 'designs/a.png' }]);
  });

  it('a link asked only to be resolved is not opened', async () => {
    const shell = made();
    const bridge = withDesktopShell({ openArtifact: () => ({ ok: true }) }, shell);
    await bridge.openArtifact({ src: 'https://example.com/a', mode: 'resolve' });
    expect(shell.calls).toEqual([]);
  });

  it('a press on this Mac\'s alert opens its thread, as does one the hub sends', () => {
    let here = null;
    let hub = null;
    const offs = [];
    const shell = { ...made(), onOpenItem: (fn) => { here = fn; return () => offs.push('here'); } };
    const bridge = withDesktopShell({ onOpenItem: (fn) => { hub = fn; return () => offs.push('hub'); } }, shell);
    const opened = [];
    const off = bridge.onOpenItem((p) => opened.push(p.id));
    here({ id: 'w-1' });
    hub({ id: 'w-2' });
    expect(opened).toEqual(['w-1', 'w-2']);
    off();
    expect(offs.sort()).toEqual(['here', 'hub']);
  });

  it('with no shell, as in a tab or on a phone, the bridge is left as it was', () => {
    const bridge = { notify: () => 'hub' };
    expect(withDesktopShell(bridge, undefined)).toBe(bridge);
  });

  it('a desktop client on another machine is not a phone', () => {
    expect(onPhoneDoor('hub.example.com')).toBe(true);
    expect(onPhoneDoor('hub.example.com', { notify() {} })).toBe(false);
    expect(onPhoneDoor('127.0.0.1')).toBe(false);
  });

  it('the window stays on its hub, and only web links leave for the browser', () => {
    expect(sameHub('https://hub.example.com/x?a=1', 'https://hub.example.com')).toBe(true);
    expect(sameHub('https://hub.example.com.evil.test/', 'https://hub.example.com')).toBe(false);
    expect(sameHub('http://hub.example.com/', 'https://hub.example.com')).toBe(false);
    expect(mayOpenOutside('https://example.com')).toBe(true);
    expect(mayOpenOutside('mailto:a@example.com')).toBe(true);
    expect(mayOpenOutside('file:///etc/passwd')).toBe(false);
    expect(mayOpenOutside('javascript:alert(1)')).toBe(false);
  });
});
