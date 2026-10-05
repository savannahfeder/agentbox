// WHAT FINISHED AGENTS LEAVE RUNNING IS STOPPED, ON A RULE THE PERSON TURNED ON — w-3958c3753d.
//
// WHAT BROKE. On 2026-10-05, after a night of agents, the founder's 16 GB Mac
// showed "Your system has run out of application memory" with every agent
// already finished. Measured that morning: programs finished agents had
// started and never stopped held 3.3 GB (two Next.js dev servers, one almost
// 3 days old; three preview servers with headless browsers; three copies of a
// test script) and Docker Desktop, started by one of them, 4.5 GB more. 40
// programs from 7 tasks; stopping them by hand took swap from 7.4 to 4.2 GB.
//
// THE RULES, agreed with Codex over four rounds (the first version, which
// stopped anything tagged whenever memory was tight, was taken apart):
//   - it is its own switch, off by default; with it off leftovers are only
//     reported;
//   - a task's programs may be stopped only after its run has explicitly ended
//     in this app (or its worker is verified gone), 2 hours after that, or 10
//     minutes while memory is tight, never earlier than when the switch went on;
//   - starting a run on the task cancels it at once, inside the app, before the
//     worker is spawned;
//   - nothing protected is ever stopped: AGENTBOX_KEEP=1, anything run from an
//     installed app or the system, an unreadable executable, anything under
//     those; protection is remembered per process, so it survives a parent
//     exiting;
//   - a process must be seen with the same identity a minute apart and again
//     just before the signal; SIGTERM only, never SIGKILL; whatever survives is
//     reported, and the next agent on that task is told not to reuse it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseListings, LeftoverCleaner } from '../main/leftovers.mjs';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_791_200_000_000;
const sec = (ms) => Math.floor(ms / 1000);

describe('reading the process list', () => {
  const date = (ms) => new Date(ms).toString().slice(0, 24).replace(/GMT.*/, '').trim();
  const lstart = (ms) => {
    const d = new Date(ms);
    const day = d.toLocaleString('en-US', { weekday: 'short' });
    const mon = d.toLocaleString('en-US', { month: 'short' });
    const pad = (n) => String(n).padStart(2, '0');
    return `${day} ${mon} ${String(d.getDate()).padStart(2, ' ')} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}`;
  };
  void date;
  const started = T0 - 3 * HOUR;
  const base = [
    `30788     1  90000 ${lstart(started)} /usr/local/bin/node`,
    `31907 30788 700000 ${lstart(started)} /usr/local/bin/node`,
    `40000     1  10000 ${lstart(started)} /usr/local/bin/node`,
    `50000     1  10000 ${lstart(started)} /usr/local/bin/node`,
  ].join('\n');
  const argv = [
    `30788 ${lstart(started)} node next dev -p 3011`,
    `31907 ${lstart(started)} next-server (v16.3.6)`,
    `40000 ${lstart(started)} node tool.mjs ZERO_ITEM=w-fromargv`,
    `50000 ${lstart(started)} node other.mjs`,
  ].join('\n');
  const full = [
    `30788 ${lstart(started)} node next dev -p 3011 PATH=/usr/bin ZERO_PRODUCT=demo ZERO_ITEM=w-aaaa1111 HOME=/Users/x`,
    `31907 ${lstart(started)} next-server (v16.3.6)`,
    `40000 ${lstart(started)} node tool.mjs ZERO_ITEM=w-fromargv`,
    `50000 ${lstart(started + 5000)} node other.mjs ZERO_ITEM=w-bbbb2222`,
  ].join('\n');
  const procs = parseListings({ base, argv, full });
  const by = Object.fromEntries(procs.map((p) => [p.pid, p]));

  it('takes the task id from the environment, never from the command\'s own words', () => {
    expect(by[30788].item).toBe('w-aaaa1111');
    expect(by[30788].product).toBe('demo');
    expect(by[40000].item).toBe(null);
  });

  it('reads nothing when the two looks disagree about which program it is', () => {
    expect(by[50000].item).toBe(null);
  });

  it('a program that hides its environment carries no tag of its own', () => {
    expect(by[31907].item).toBe(null);
  });

  it('keeps start time to the second, the executable path, and memory', () => {
    expect(by[30788].start).toBe(sec(started));
    expect(by[30788].exe).toBe('/usr/local/bin/node');
    expect(Math.round(by[31907].mb)).toBe(684);
  });
});

describe('the cleaner', () => {
  const NODE = '/Users/x/.nvm/versions/node/v22/bin/node';
  const p = (pid, ppid, item, extra = {}) => ({ pid, ppid, mb: 100, start: sec(T0 - 5 * HOUR), exe: NODE, item, product: 'demo', keep: false, cmd: 'node server.mjs', ...extra });

  function harness(procs, { pressure = 'normal', onSince = T0 - 10 * HOUR, owns = () => true } = {}) {
    let now = T0;
    let list = procs;
    let level = pressure;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleaner-'));
    const signals = [];
    const live = new Set();
    const make = () => new LeftoverCleaner({
      list: async () => list,
      kill: (pid, sig) => { signals.push([pid, sig]); },
      clock: () => now,
      readPressure: async () => level,
      file: path.join(dir, 'leftovers.json'),
      enabledSince: onSince,
      live: (item) => live.has(item),
      owns,
    });
    const h = {
      cleaner: make(), signals, live,
      setList: (l) => { list = l; },
      setPressure: (l) => { level = l; },
      advance: (ms) => { now += ms; },
      restart: () => { h.cleaner = make(); },
      tick: () => h.cleaner.tick(),
      // Two looks a minute apart, the way the app's timer does it.
      settle: async () => { await h.tick(); now += MIN; await h.tick(); },
    };
    return h;
  }
  const night = () => [p(30788, 1, 'w-done'), p(31907, 30788, null, { cmd: 'next-server' })];

  it('stops a finished task\'s programs, and what hides its tag under them, two hours after the run ended', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    // `settle` looks twice a minute apart, so this last look is at 1 h 59 m.
    h.advance(118 * MIN); await h.settle();
    expect(h.signals).toEqual([]);
    h.advance(1 * MIN); await h.settle();
    expect(h.signals.map(([pid, s]) => `${pid}:${s}`).sort()).toEqual(['30788:SIGTERM', '31907:SIGTERM']);
  });

  it('after ten minutes instead while memory is tight', async () => {
    const h = harness(night(), { pressure: 'tight' });
    h.cleaner.ended('w-done');
    h.advance(9 * MIN); await h.settle();
    expect(h.signals.length).toBe(2);
  });

  it('never earlier than two hours after the switch went on, whenever the run ended', async () => {
    const h = harness(night(), { onSince: T0 });
    h.cleaner.ended('w-done');
    h.advance(60 * MIN); await h.settle();
    expect(h.signals).toEqual([]);
    h.advance(61 * MIN); await h.settle();
    expect(h.signals.length).toBe(2);
  });

  it('never SIGKILL, and what ignores the request is reported, not forced', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(3 * HOUR); await h.settle();
    h.advance(5 * MIN); await h.settle();
    expect(h.signals.some(([, s]) => s === 'SIGKILL')).toBe(false);
    expect(h.cleaner.status().survivors.map((s) => s.pid).sort()).toEqual([30788, 31907]);
  });

  it('a run starting on the task cancels it, and the agent is told what is still shutting down', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(3 * HOUR); await h.settle();
    const note = h.cleaner.starting('w-done');
    expect(note).toMatch(/30788/);
    expect(note).toMatch(/do not reuse/i);
    h.setList(night());
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals.length).toBe(2);
  });

  it('a run starting before the time is up means nothing is stopped', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(100 * MIN);
    h.cleaner.starting('w-done');
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals).toEqual([]);
  });

  it('a task the app has a session for is never touched, whatever the records say', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.live.add('w-done');
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals).toEqual([]);
  });

  it('a task with no ended run is never stopped: a run with no end is not finished', async () => {
    const h = harness(night(), { owns: () => false });
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals).toEqual([]);
    expect(h.cleaner.status().leftovers.map((l) => l.item)).toEqual(['w-done']);
  });

  it('a task of this app with leftovers and no session is recorded as ended, and gets a full two hours from then', async () => {
    const h = harness(night());
    await h.settle();
    h.advance(100 * MIN); await h.settle();
    expect(h.signals).toEqual([]);
    h.advance(25 * MIN); await h.settle();
    expect(h.signals.length).toBe(2);
  });

  it('a run left "running" by a crash counts as ended only once its worker is seen gone', async () => {
    const worker = p(600, 1, 'w-crashed', { exe: '/Users/x/.local/bin/claude', cmd: 'claude -p' });
    const h = harness([worker, p(601, 1, 'w-crashed')]);
    h.cleaner.starting('w-crashed');
    h.cleaner.worker('w-crashed', 600);
    h.restart();
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals).toEqual([]);
    h.setList([p(601, 1, 'w-crashed')]);
    await h.settle();
    h.advance(2 * HOUR + 2 * MIN); await h.settle();
    expect(h.signals).toEqual([[601, 'SIGTERM']]);
  });

  it('records survive the app restarting', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.restart();
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals.length).toBe(2);
  });

  it('nothing the person asked to keep, nothing from an installed app, nothing under those', async () => {
    const h = harness([
      p(700, 1, 'w-done', { keep: true }), p(701, 700, null),
      p(800, 1, 'w-done', { exe: '/Applications/Docker.app/Contents/MacOS/com.docker.backend' }), p(801, 800, null, { exe: '/Users/x/.docker/helper' }),
      p(900, 1, 'w-done', { exe: '' }),
      p(950, 1, 'w-done'),
    ]);
    h.cleaner.ended('w-done');
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals).toEqual([[950, 'SIGTERM']]);
  });

  it('protection is remembered when its parent exits, even across a restart', async () => {
    // Docker's helpers carry the agent's task id themselves, so once the app
    // that protected them exits, only the remembered protection keeps them.
    const h = harness([p(800, 1, 'w-done', { exe: '/Applications/Docker.app/Contents/MacOS/Docker' }), p(801, 800, 'w-done')]);
    h.cleaner.ended('w-done');
    await h.tick();
    h.setList([p(801, 1, 'w-done')]);
    h.restart();
    h.advance(3 * HOUR); await h.settle();
    expect(h.signals).toEqual([]);
  });

  it('a program first seen less than a minute ago waits for the next look', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(3 * HOUR); await h.settle();
    const late = p(32000, 30788, null, { start: sec(T0 + 3 * HOUR) });
    h.setList([...night(), late]);
    h.signals.length = 0;
    await h.tick();
    expect(h.signals.find(([pid]) => pid === 32000)).toBeUndefined();
  });

  it('checks again just before the signal: a run that started meanwhile wins', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(3 * HOUR); await h.tick();
    h.advance(MIN);
    let calls = 0;
    h.cleaner.list = async () => { calls += 1; if (calls === 2) h.cleaner.starting('w-done'); return night(); };
    await h.tick();
    expect(h.signals).toEqual([]);
  });

  it('a pid now held by a different program is never signalled', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(3 * HOUR); await h.tick();
    h.advance(MIN);
    h.setList([p(30788, 1, 'w-done', { start: sec(T0 + 3 * HOUR) }), p(31907, 30788, null, { cmd: 'next-server' })]);
    await h.tick();
    expect(h.signals).toEqual([[31907, 'SIGTERM']]);
  });

  it('a list that cannot be read stops nothing and does not throw', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.cleaner.list = async () => { throw new Error('ps failed'); };
    h.advance(3 * HOUR);
    await expect(h.tick()).resolves.toBeTruthy();
    expect(h.signals).toEqual([]);
  });

  it('reports what is left, how old, and when it stops, for the Settings page', async () => {
    const h = harness(night());
    h.cleaner.ended('w-done');
    h.advance(30 * MIN); await h.settle();
    const s = h.cleaner.status();
    expect(s.leftovers).toEqual([expect.objectContaining({ item: 'w-done', programs: 2, stopsAt: T0 + 2 * HOUR })]);
  });
});

describe('the app', () => {
  // These need the real Supervisor and settings, imported late so the file's
  // pure tests above do not pay for them.
  async function app(config = {}) {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const { fileURLToPath } = await import('node:url');
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cleaner-app-'));
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: (slug, id) => (id === 'w-mine' ? { id, product: slug } : null) };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, ...config }, store, root, tmp, tmp);
    return { sup, tmp };
  }

  it('with the switch off there is no cleaner and agents are told nothing about it', async () => {
    const { sup } = await app();
    expect(sup.leftoverStatus()).toBe(null);
    expect(sup.leftoverBriefNote({ id: 'w-x' }, { fresh: true })).toBe(null);
  });

  it('with it on, a fresh agent is told what happens to what it leaves running, and how to keep something', async () => {
    const { sup } = await app({ cleanupLeftovers: true, cleanupLeftoversSince: T0 });
    await sup.setLeftoverCleanup(true);
    const note = sup.leftoverBriefNote({ id: 'w-x' }, { fresh: true });
    expect(note).toMatch(/AGENTBOX_KEEP=1/);
    expect(note).toMatch(/two hours/);
    await sup.setLeftoverCleanup(false);
  });

  it('a session ending is recorded as the run ending, and a later session on the row is left alone', async () => {
    const { sup } = await app({ cleanupLeftovers: true, cleanupLeftoversSince: T0 });
    await sup.setLeftoverCleanup(true);
    const cleaner = sup._leftoverCleaner;
    const first = {};
    sup.sessions.set('w-mine', first);
    cleaner.starting('w-mine');
    await sup.endSession({ id: 'w-mine', product: 'demo' }, first, null);
    expect(cleaner.runs['w-mine'].state).toBe('ended');
    const later = {};
    sup.sessions.set('w-mine', later);
    cleaner.starting('w-mine');
    await sup.endSession({ id: 'w-mine', product: 'demo' }, first, null);
    expect(cleaner.runs['w-mine'].state).toBe('running');
    await sup.setLeftoverCleanup(false);
  });

  it('the cleaner knows which tasks are this app\'s and which have a session', async () => {
    const { sup } = await app({ cleanupLeftovers: true, cleanupLeftoversSince: T0 });
    await sup.setLeftoverCleanup(true);
    const cleaner = sup._leftoverCleaner;
    expect(cleaner.owns('w-mine', 'demo')).toBe(true);
    expect(cleaner.owns('w-someone-elses', 'demo')).toBe(false);
    expect(cleaner.owns('w-mine', null)).toBe(false);
    sup.sessions.set('w-mine', {});
    expect(cleaner.live('w-mine')).toBe(true);
    await sup.setLeftoverCleanup(false);
  });
});

describe('the Settings page', () => {
  it('turning it on is remembered with the moment it went on, and starts the cleaner now', async () => {
    const { setWorkspaceSetting, leftoverSettings } = await import('../main/settings.mjs');
    const { loadConfig } = await import('../main/config.mjs');
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleaner-settings-'));
    fs.writeFileSync(path.join(appDir, 'zero.config.json'), '{}');
    const config = loadConfig(appDir);
    config.appDir = appDir;
    expect(config.cleanupLeftovers).toBe(false);
    const calls = [];
    const supervisor = { setLeftoverCleanup: async (on) => { calls.push(on); }, leftoverStatus: () => null };
    const before = Date.now();
    setWorkspaceSetting({ config, supervisor }, { key: 'cleanupLeftovers', value: true });
    const disk = JSON.parse(fs.readFileSync(path.join(appDir, 'zero.config.json'), 'utf8'));
    expect(disk.cleanupLeftovers).toBe(true);
    expect(disk.cleanupLeftoversSince).toBeGreaterThanOrEqual(before);
    expect(calls).toEqual([true]);
    expect(leftoverSettings({ config, supervisor }).on).toBe(true);
  });

  it('says what finished agents have left running, and when it goes', async () => {
    const { leftoverSettings } = await import('../main/settings.mjs');
    const now = Date.now();
    const status = {
      leftovers: [
        { item: 'w-a', programs: 4, kept: 0, oldest: now - 3 * 24 * HOUR, stopsAt: now + 100 * MIN },
        { item: 'w-b', programs: 0, kept: 2, oldest: now - HOUR, stopsAt: null },
      ],
      survivors: [],
    };
    const on = leftoverSettings({ config: { cleanupLeftovers: true }, supervisor: { leftoverStatus: () => status } }).now;
    expect(on).toBe('Finished agents have left 6 programs running. 4 stop in 1 h 40 m; 2 are kept.');
    const off = leftoverSettings({ config: { cleanupLeftovers: false }, supervisor: { leftoverStatus: () => null } }).now;
    expect(off).toBe(null);
  });
});

// FOUND ON THE REAL MAC, 2026-10-05, running the cleaner on real processes: a
// Next.js dev server renames itself (process.title), and macOS then reports
// that new name as its executable ("next-server (e2e"), so it read as an
// executable we could not see and was kept forever. And when its parent was
// stopped first it was moved under launchd and lost its task. Measured: lsof
// resolves the real executable for the 46 renamed processes on that Mac in
// 24 ms.
describe('a program that renames itself', () => {
  it('has its real executable read from lsof', async () => {
    const { applyExecutables } = await import('../main/leftovers.mjs');
    const procs = [{ pid: 97969, exe: 'next-server (e2e' }, { pid: 500, exe: '/usr/bin/caffeinate' }, { pid: 600, exe: 'login' }];
    const lsof = 'p97969\nftxt\nn/Users/x/.nvm/versions/node/v22/bin/node\nftxt\nn/usr/lib/dyld\np600\n';
    applyExecutables(procs, lsof);
    expect(procs.map((p) => p.exe)).toEqual(['/Users/x/.nvm/versions/node/v22/bin/node', '/usr/bin/caffeinate', 'login']);
  });

  it('stays its task\'s after its parent is stopped, and is stopped too', async () => {
    const NODE = '/Users/x/.nvm/versions/node/v22/bin/node';
    const p = (pid, ppid, item) => ({ pid, ppid, mb: 50, start: sec(T0 - 5 * HOUR), exe: NODE, item, product: 'demo', keep: false, cmd: 'node' });
    let now = T0;
    let list = [p(10, 1, 'w-done'), p(11, 10, null)];
    const signals = [];
    const cleaner = new LeftoverCleaner({
      list: async () => list, kill: (pid, sig) => signals.push([pid, sig]), clock: () => now,
      readPressure: async () => 'normal', enabledSince: 0, owns: () => true,
    });
    cleaner.ended('w-done');
    await cleaner.tick();
    // The parent exits on its own; launchd adopts the child.
    list = [p(11, 1, null)];
    now += 3 * HOUR; await cleaner.tick();
    now += MIN; await cleaner.tick();
    expect(signals).toEqual([[11, 'SIGTERM']]);
  });
});

// CODEX'S CODE REVIEW OF c7e490c, 2026-10-05: six defects, each reproduced by
// Codex with injected listings before it reported them. One test per defect.
describe('what the code review found', () => {
  const NODE = '/Users/x/.nvm/versions/node/v22/bin/node';
  const p = (pid, ppid, item, extra = {}) => ({ pid, ppid, mb: 50, start: sec(T0 - 5 * HOUR), exe: NODE, item, product: 'demo', keep: false, cmd: 'node', ...extra });
  const LAUNCHD = { pid: 1, ppid: 0, mb: 10, start: sec(T0 - 9 * 24 * HOUR), exe: '/sbin/launchd', item: null, product: null, keep: false, cmd: '/sbin/launchd' };
  function make(list, extra = {}) {
    let now = T0;
    const signals = [];
    const c = new LeftoverCleaner({
      list: async () => (typeof list === 'function' ? list() : list), kill: (pid, sig) => signals.push([pid, sig]), clock: () => now,
      readPressure: async () => 'normal', enabledSince: 0, owns: () => true, ...extra,
    });
    return { c, signals, advance: (ms) => { now += ms; } };
  }

  it('1. switching it off while a look is under way stops nothing', async () => {
    let calls = 0;
    const h = make(() => { calls += 1; if (calls === 3) h.c.disable(); return [LAUNCHD, p(10, 1, 'w-done')]; });
    h.c.ended('w-done');
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([]);
  });

  it('1b. while it is off it looks and reports, and never signals', async () => {
    const h = make([LAUNCHD, p(10, 1, 'w-done')]);
    h.c.disable();
    h.c.ended('w-done');
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([]);
    expect(h.c.status().leftovers.map((l) => l.item)).toEqual(['w-done']);
  });

  it('2. a task with a running agent process is never finished, records or not, and an agent is never signalled', async () => {
    const worker = p(600, 500, 'w-orphan', { exe: '/Users/x/.local/bin/claude', cmd: '/Users/x/.local/bin/claude -p' });
    const h = make([LAUNCHD, worker, p(601, 600, null)]);
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(3 * HOUR); await h.c.tick();
    expect(h.signals).toEqual([]);
    expect(h.c.runs['w-orphan']).toBeUndefined();
    h.c.ended('w-orphan');
    h.advance(3 * HOUR); await h.c.tick();
    expect(h.signals).toEqual([]);
  });

  it('3. launchd adopting a server does not protect it', async () => {
    const h = make([LAUNCHD, p(10, 1, 'w-done')]);
    h.c.ended('w-done');
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
  });

  it('3b. a command an agent ran through the system shell is not protected by the shell', async () => {
    const shell = p(20, 1, 'w-done', { exe: '/bin/zsh', cmd: '/bin/zsh -c npm run dev' });
    const h = make([LAUNCHD, shell, p(21, 20, null)]);
    h.c.ended('w-done');
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals.map(([pid]) => pid).sort()).toEqual([20, 21]);
  });

  it('3c. but an installed app\'s helpers stay protected, and protection saved by the old version is thrown away', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cleaner-v1-')), 'leftovers.json');
    fs.writeFileSync(file, JSON.stringify({ runs: {}, protectedIds: [`10:${sec(T0 - 5 * HOUR)}:${NODE}`], stopping: {} }));
    const docker = p(30, 1, 'w-done', { exe: '/Applications/Docker.app/Contents/MacOS/com.docker.backend' });
    const h = make([LAUNCHD, p(10, 1, 'w-done'), docker, p(31, 30, 'w-done')], { file });
    h.c.ended('w-done');
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
  });

  it('4. a run on a task whose programs were asked to stop under 30 seconds ago waits for the rest of that time', async () => {
    const h = make([LAUNCHD, p(10, 1, 'w-done')]);
    h.c.ended('w-done');
    h.advance(3 * HOUR); await h.c.tick();
    h.advance(MIN); await h.c.tick();
    expect(h.c.holdMs('w-done')).toBe(30_000);
    h.advance(20_000);
    expect(h.c.holdMs('w-done')).toBe(10_000);
    h.advance(11_000);
    expect(h.c.holdMs('w-done')).toBe(0);
    expect(h.c.holdMs('w-other')).toBe(0);
  });

  it('5. while it is off, Settings says what turning it on would stop, including what is running now', async () => {
    const { leftoverSettings } = await import('../main/settings.mjs');
    const status = { leftovers: [{ item: 'w-a', programs: 38, kept: 2, oldest: Date.now() - 3 * 24 * HOUR, stopsAt: null }], survivors: [] };
    const off = leftoverSettings({ config: { cleanupLeftovers: false }, supervisor: { leftoverStatus: () => status } }).now;
    expect(off).toBe('Right now finished agents have left 40 programs running; turning this on stops 38 of them, two hours from then.');
  });
});

describe('6. every run is told the rule while it is on', () => {
  it('a resumed conversation too', async () => {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const { fileURLToPath } = await import('node:url');
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cleaner-brief-'));
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, cleanupLeftovers: true, cleanupLeftoversSince: T0 }, store, root, tmp, tmp);
    await sup.setLeftoverCleanup(true);
    expect(sup.leftoverBriefNote({ id: 'w-x' }, { fresh: false })).toMatch(/AGENTBOX_KEEP=1/);
    await sup.setLeftoverCleanup(false);
    expect(sup.leftoverBriefNote({ id: 'w-x' }, { fresh: true })).toBe(null);
  });
});
