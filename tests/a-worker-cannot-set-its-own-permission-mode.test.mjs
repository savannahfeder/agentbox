// A WORKER CANNOT SET ITS OWN PERMISSION MODE (security audit 2026-10-23,
// finding 4).
//
// What one reply may do on this computer (main/answer-modes.mjs) was kept in
// the app's own home, and main/main.mjs and main/serve.mjs make that home the
// store root. The store root is in every Claude worker's additionalDirectories,
// so a file edit there goes through without a card. One write of
// answer-modes.json gave a thread bypassPermissions on its next run, and each
// run renewed it for 30 days.
//
// Measured before the fix by the first two cases here, in the layout the app
// runs in: her reply's mode was written to <store root>/answer-modes.json, and
// a file written there by hand came back as the row's mode, bypassPermissions.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { answerModes, answerModesFile, keepAnswerModesIn, setAnswerMode, _internals } from '../main/answer-modes.mjs';
import { appHomeEnv, setAppHome } from './app-home.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'answer-modes.json';

let tmp;
let storeRoot;
let userDir;
let configHome;
let wasHome;
let wasFile;

const inside = (file, dir) => {
  const f = path.resolve(file);
  const d = path.resolve(dir);
  return f === d || f.startsWith(d + path.sep);
};

// Every answer-modes.json anywhere under `dir`, followed or not.
function modeFilesUnder(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === FILE) found.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return found;
}

async function openStore() {
  const accountRoot = path.join(storeRoot, 'accounts', 'test-account');
  const dir = path.join(accountRoot, 'acme');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 2, id: 'acme', name: 'Acme' }));
  const store = await new Store({ storeRoot, accountId: 'test-account', accountRoot, products: [] }).init();
  return { store, slug: store.listProducts()[0].slug, dir };
}

const plant = (file, entries) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries));
};

const env = () => ({ XDG_CONFIG_HOME: configHome });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-own-mode-')));
  storeRoot = path.join(tmp, 'store');
  userDir = path.join(tmp, 'user-data');
  configHome = path.join(tmp, 'config');
  fs.mkdirSync(storeRoot, { recursive: true });
  wasHome = appHomeEnv();
  wasFile = answerModesFile();
  // The layout the app runs in: its home is the store root.
  setAppHome(storeRoot);
  keepAnswerModesIn({ userDir, storeRoot, env: env() });
});

afterEach(() => {
  setAppHome(wasHome);
  _internals.useFile(wasFile);
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('with the app home at the store root, as the app runs', () => {
  it('keeps her reply\'s mode in her own folder, and nothing of it in the store', async () => {
    const { store, slug } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'plan' });

    expect(store.readItem(slug, row.id).answerMode).toBe('plan');
    expect(modeFilesUnder(storeRoot)).toEqual([]);
    expect(inside(answerModesFile(), userDir)).toBe(true);
  });

  it('gets no mode from a file a worker writes into the store', async () => {
    const { store, slug, dir } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    const forged = { [`${slug}/${row.id}`]: { mode: 'bypassPermissions', at: Date.now() } };
    plant(path.join(storeRoot, FILE), forged);
    plant(path.join(dir, FILE), forged);

    expect(store.readItem(slug, row.id).answerMode).toBeUndefined();
  });

  it('still reads hers when a forged one sits in the store beside it', async () => {
    const { store, slug } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'careful', permissionMode: 'plan' });
    plant(path.join(storeRoot, FILE), { [`${slug}/${row.id}`]: { mode: 'bypassPermissions', at: Date.now() } });

    expect(store.readItem(slug, row.id).answerMode).toBe('plan');
  });
});

describe('where the file goes', () => {
  it('moves out of a folder of hers that sits inside the store', () => {
    const file = keepAnswerModesIn({ userDir: path.join(storeRoot, 'user-data'), storeRoot, env: env() });
    expect(inside(file, storeRoot)).toBe(false);
    expect(inside(file, configHome)).toBe(true);
  });

  it('keeps no modes at all, and says so, when there is nowhere outside the store', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = keepAnswerModesIn({
      userDir: path.join(storeRoot, 'user-data'), storeRoot, env: { XDG_CONFIG_HOME: path.join(storeRoot, 'config') },
    });
    expect(file).toBe(null);
    expect(warn).toHaveBeenCalled();

    const { store, slug } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'bypassPermissions' });
    expect(store.readItem(slug, row.id).answerMode).toBeUndefined();
    expect(modeFilesUnder(storeRoot)).toEqual([]);
  });

  it('keeps nothing, anywhere, until the app has said where', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    _internals.useFile(null);
    setAnswerMode('acme', 'w-1', 'plan');
    expect(answerModes()).toEqual({});
    expect(modeFilesUnder(storeRoot)).toEqual([]);
  });
});

describe('the file an older version left in the store', () => {
  it('carries her modes across once, and takes the old file away', async () => {
    const { store, slug } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    const old = path.join(storeRoot, FILE);
    fs.rmSync(answerModesFile(), { force: true });
    plant(old, { [`${slug}/${row.id}`]: { mode: 'acceptEdits', at: Date.now() } });

    keepAnswerModesIn({ userDir, storeRoot, env: env() });

    expect(store.readItem(slug, row.id).answerMode).toBe('acceptEdits');
    expect(fs.existsSync(old)).toBe(false);
  });

  it('never reads one written there after that, and takes it away too', async () => {
    const { store, slug } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    const old = path.join(storeRoot, FILE);
    plant(old, { [`${slug}/${row.id}`]: { mode: 'bypassPermissions', at: Date.now() } });

    // The next start of the app.
    keepAnswerModesIn({ userDir, storeRoot, env: env() });

    expect(store.readItem(slug, row.id).answerMode).toBeUndefined();
    expect(fs.existsSync(old)).toBe(false);
  });

  it('does not follow a link left where the old file was', async () => {
    const { store, slug } = await openStore();
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    fs.rmSync(answerModesFile(), { force: true });
    const theirs = path.join(storeRoot, 'accounts', 'notes.json');
    plant(theirs, { [`${slug}/${row.id}`]: { mode: 'bypassPermissions', at: Date.now() } });
    const old = path.join(storeRoot, FILE);
    fs.symlinkSync(theirs, old);

    keepAnswerModesIn({ userDir, storeRoot, env: env() });

    expect(store.readItem(slug, row.id).answerMode).toBeUndefined();
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.lstatSync(answerModesFile()).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(theirs)).toBe(true);
  });
});

describe('both ways the app starts say where, before the store opens', () => {
  it('the copy that runs without Electron keeps them in its own folder', async () => {
    const dir = path.join(tmp, 'headless');
    const store = path.join(dir, 'store');
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: store }));
    // What an older version kept, there at this version's first start.
    plant(path.join(store, FILE), { 'acme/w-1': { mode: 'acceptEdits', at: Date.now() } });
    _internals.useFile(null);

    const { bootHeadless } = await import('../main/serve.mjs');
    const booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    try {
      expect(answerModesFile()).toBe(path.join(dir, FILE));
      expect(fs.existsSync(path.join(store, FILE))).toBe(false);
      expect(answerModes()).toEqual({ 'acme/w-1': 'acceptEdits' });
    } finally {
      await booted.supervisor?.stopAll?.().catch?.(() => {});
    }
  }, 30_000);

  it('the desktop app names her folder before it opens the store', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'main', 'main.mjs'), 'utf8');
    const named = src.indexOf('keepAnswerModesIn({ userDir, storeRoot: config.storeRoot })');
    expect(named).toBeGreaterThan(src.indexOf('Object.assign(process.env, storeRootEnv(config.storeRoot))'));
    expect(named).toBeLessThan(src.indexOf('new Store(config)'));
  });
});

describe('no folder a worker is granted holds it', () => {
  const grantedTo = (product) => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = repoRoot;
    s.config = { storeRoot };
    const file = s.writeWorkerSettings(product, `own-mode-${Date.now()}`);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')).permissions.additionalDirectories; } finally { fs.rmSync(file, { force: true }); }
  };

  it('leaves out a product folder that has her modes file inside it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(grantedTo({ slug: 'acme', dir: tmp })).toEqual([storeRoot]);
  });

  it('still grants a product folder that does not', () => {
    const docs = path.join(tmp, 'docs');
    expect(grantedTo({ slug: 'acme', dir: docs })).toEqual([storeRoot, docs]);
  });
});
