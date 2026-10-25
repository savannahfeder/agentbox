// A TASK KEEPS WHAT IT RUNS UNTIL YOU CLOSE IT (w-7b5b89d886).
//
// What broke: a phone app's dev server, started for a thread that was still
// open, stopped while it was being used, and the agent had to explain how to
// start it again. Three rules could each end it with the task still open:
//   - what an agent left running was stopped two hours after its run ended
//     (main/leftovers.mjs), unless the agent had guessed to mark it
//     AGENTBOX_KEEP=1;
//   - a shipped task's folder is deleted once its work is in main
//     (main/task-folders.mjs), with the server still running from it;
//   - closed tasks' folders are packed away (`parkClosedFolders`) the same way.
// The rule asked for instead: what a task runs lives while the task is open,
// and goes when it is closed. Measured here with injected listings and clocks,
// and with a real repository for the folder.
import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LeftoverCleaner } from '../main/leftovers.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { ensureTaskFolder } from '../main/task-folders.mjs';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_791_200_000_000;
const NODE = '/Users/x/.nvm/versions/node/v22/bin/node';
const sec = (ms) => Math.floor(ms / 1000);
const p = (pid, item, extra = {}) => ({ pid, ppid: 1, mb: 400, start: sec(T0 - HOUR), exe: NODE, item, product: 'demo', keep: false, cmd: 'node expo start', ...extra });

function cleaner(procs, { closed = {}, pressure = 'normal' } = {}) {
  let now = T0;
  const signals = [];
  const level = { now: pressure };
  const c = new LeftoverCleaner({
    list: async () => procs, kill: (pid, sig) => signals.push([pid, sig]), clock: () => now,
    readPressure: async () => level.now, enabledSince: 0, owns: () => true,
    closedAt: (item) => closed[item] ?? null,
  });
  const look = async () => { await c.tick(); now += MIN; await c.tick(); };
  return { c, signals, level, closed, look, advance: (ms) => { now += ms; }, now: () => now };
}

describe('what an agent left running', () => {
  it('keeps running for days while its task is open', async () => {
    const h = cleaner([p(10, 'w-open')]);
    h.c.ended('w-open');
    for (let i = 0; i < 3 * 24; i++) { h.advance(HOUR); await h.look(); }
    expect(h.signals).toEqual([]);
  });

  it('stops two minutes after its task is closed, and not at one', async () => {
    const h = cleaner([p(10, 'w-a')]);
    h.c.ended('w-a');
    h.advance(5 * HOUR);
    h.closed['w-a'] = h.now();
    await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([]);
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
  });

  it('keeps running when the task is reopened inside those two minutes', async () => {
    const h = cleaner([p(10, 'w-a')]);
    h.c.ended('w-a');
    h.closed['w-a'] = h.now();
    await h.c.tick();
    h.advance(MIN);
    delete h.closed['w-a'];
    h.advance(HOUR); await h.look();
    expect(h.signals).toEqual([]);
  });

  it('while memory is short, goes one task a look, the one that finished longest ago first', async () => {
    const h = cleaner([p(10, 'w-old'), p(20, 'w-mid'), p(30, 'w-new')], { pressure: 'tight' });
    h.c.ended('w-old');
    h.advance(HOUR); h.c.ended('w-mid');
    h.advance(HOUR); h.c.ended('w-new');
    h.advance(HOUR);
    await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([[10, 'SIGTERM'], [20, 'SIGTERM']]);
    h.level.now = 'normal';
    h.advance(MIN); await h.c.tick();
    expect(h.signals.length).toBe(2);
  });

  it('while memory is short, not a run that ended under ten minutes ago', async () => {
    const h = cleaner([p(10, 'w-just')], { pressure: 'critical' });
    h.c.ended('w-just');
    h.advance(8 * MIN); await h.look();
    expect(h.signals).toEqual([]);
    h.advance(MIN); await h.look();
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
  });

  it('is known to be running, so its folder can be kept', async () => {
    const h = cleaner([p(10, 'w-a'), p(11, 'w-b', { exe: '/Applications/Docker.app/Contents/MacOS/Docker' })]);
    await h.c.tick();
    expect(h.c.hasPrograms('w-a')).toBe(true);
    expect(h.c.hasPrograms('w-b')).toBe(false);
    expect(h.c.hasPrograms('w-none')).toBe(false);
  });
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'keeps-folder-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}
function supervisorOver(repoPath, rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeps-folder-sup-'));
  const product = { slug: 'demo', dir, repoPath };
  const sup = new Supervisor(
    { home: path.join(dir, 'home'), storeRoot: dir, claudeBin: '/nonexistent/claude', codexBin: '/nonexistent/codex', authProfiles: ['default'], codexHome: path.join(dir, 'codex-home') },
    { listItems: () => rows, listProducts: () => [product], readItem: (slug, id) => rows.find((r) => r.id === id) ?? null, isDue: () => true, settleAnswer() {}, recordSessionResult() {} },
    '/nonexistent-app',
  );
  return { sup, product, dir };
}

describe('a task\'s folder', () => {
  it('a shipped task\'s folder stays while its terminal is open, and goes once it is not', async () => {
    const dir = repo();
    const folder = ensureTaskFolder(dir, 'w-shipped');
    const { sup, product, dir: store } = supervisorOver(dir, [{ id: 'w-shipped', product: 'demo', status: 'open' }]);
    try {
      let open = true;
      sup.terminalOpen = (id) => open && id === 'w-shipped';
      expect(await sup.releaseWorkFolder({ id: 'w-shipped', product: 'demo' }, product)).toBe(null);
      expect(fs.existsSync(folder.path)).toBe(true);
      open = false;
      expect((await sup.releaseWorkFolder({ id: 'w-shipped', product: 'demo' }, product))?.removed).toBe(true);
      expect(fs.existsSync(folder.path)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(store, { recursive: true, force: true });
    }
  });

  it('a closed task\'s folder is not packed away while a program its agent started still runs', async () => {
    const dir = repo();
    const busy = ensureTaskFolder(dir, 'w-server');
    const idle = ensureTaskFolder(dir, 'w-quiet');
    fs.writeFileSync(path.join(busy.path, 'app.txt'), 'serving\n');
    fs.writeFileSync(path.join(idle.path, 'app.txt'), 'nothing running\n');
    const { sup, product, dir: store } = supervisorOver(dir, [
      { id: 'w-server', product: 'demo', status: 'done' },
      { id: 'w-quiet', product: 'demo', status: 'done' },
    ]);
    try {
      sup._leftoverCleaner = { hasPrograms: (id) => id === 'w-server' };
      expect(await sup.parkClosedFolders(product)).toBe(1);
      expect(fs.existsSync(busy.path)).toBe(true);
      expect(fs.existsSync(idle.path)).toBe(false);
    } finally {
      sup._leftoverCleaner = null;
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(store, { recursive: true, force: true });
    }
  });
});

describe('the app reading when a task was closed', () => {
  it('is the moment the store recorded it done, and nothing while it is open', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keeps-closed-'));
    const rows = {
      'w-done': { id: 'w-done', status: 'done', updatedAt: T0 + 5, wrote: { status: { ts: T0 } } },
      'w-old': { id: 'w-old', status: 'done', updatedAt: T0 + 9 },
      'w-open': { id: 'w-open', status: 'open', updatedAt: T0 },
    };
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: (slug, id) => rows[id] ?? null };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp }, store, path.resolve('.'), tmp, tmp);
    try {
      await sup.setLeftoverCleanup(false);
      const at = sup._leftoverCleaner.closedAt;
      expect(at('w-done', 'demo')).toBe(T0);
      expect(at('w-old', 'demo')).toBe(T0 + 9);
      expect(at('w-open', 'demo')).toBe(null);
      expect(at('w-missing', 'demo')).toBe(null);
      expect(at('w-done', null)).toBe(null);
    } finally {
      clearInterval(sup._leftoverTimer);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
