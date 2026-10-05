// WHAT FINISHED AGENTS LEFT RUNNING IS STOPPED WHEN MEMORY IS SHORT — w-3958c3753d.
//
// WHAT BROKE. On 2026-10-05, after a night of agents, the founder's 16 GB Mac
// showed "Your system has run out of application memory" with every agent
// already finished. Measured that morning: programs that finished agents had
// started and never stopped held 3.3 GB (two Next.js dev servers, one 14 hours
// and one almost 3 days old; three video preview servers with headless
// browsers; three copies of a test script), and Docker Desktop, started by one
// of those agents, held 4.5 GB more in its virtual machine. About 7.7 GB of 16
// held by work that had already ended. The memory check only orders commands
// that are about to start, so it said "Nothing heavy running" the whole time.
//
// HOW THEY ARE FOUND. Every worker is spawned with ZERO_ITEM=<its task id> in
// its environment and everything it starts inherits it, measured on all eight
// leftovers that morning, Docker's backend included. A program that renames
// itself (next-server) hides its environment from `ps`, so a process under a
// tagged one belongs to the same task.
//
// WHEN THEY ARE STOPPED. Only while memory is tight or critical, and only for a
// task with no agent running, seen that way on two looks a minute apart, so a
// reply that is just restarting the agent is not raced. Never while memory is
// fine: agents leave a preview server running on purpose for somebody to open,
// and stopping those on a timer would break the link in their answer.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvListing, leftovers, LeftoverSweeper } from '../main/leftovers.mjs';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';
import { memoryGateSettings } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const HOUR = 3_600_000;
const T0 = 1_791_200_000_000;

/** One `ps -E -ww -axo pid=,ppid=,etime=,rss=,command=` line. */
const line = (pid, ppid, etime, rssKb, command) => `${String(pid).padStart(6)} ${String(ppid).padStart(6)} ${etime.padStart(11)} ${String(rssKb).padStart(8)} ${command}`;

const APP = { pid: 500, ppid: 1, startedAt: T0 - 9 * HOUR, mb: 300, cmd: 'Electron .', item: null };
const agent = (pid, item) => ({ pid, ppid: APP.pid, startedAt: T0 - HOUR, mb: 300, cmd: '/Users/x/.local/bin/claude -p --output-format stream-json', item });
const proc = (pid, ppid, item, cmd = 'node server.mjs', mb = 100, startedAt = T0 - 5 * HOUR) => ({ pid, ppid, startedAt, mb, cmd, item });

describe('reading the process list', () => {
  it('takes the task id from each program\'s environment, and its start time from how long it has run', () => {
    const text = [
      line(30788, 1, '14:38:21', 90_000, 'node pnpm exec next dev -p 3011 PATH=/usr/bin ZERO_PRODUCT=astral-video ZERO_ITEM=w-bddbdfe747 HOME=/Users/x'),
      line(31907, 30788, '14:38:14', 700_000, 'next-server (v16.3.6)'),
      line(64505, 1, '3-02:00:00', 900_000, '/Applications/Arc.app/Contents/MacOS/Arc'),
    ].join('\n');
    const procs = parseEnvListing(text, T0);
    expect(procs.map((p) => [p.pid, p.item])).toEqual([[30788, 'w-bddbdfe747'], [31907, null], [64505, null]]);
    expect(procs[0].startedAt).toBe(T0 - (14 * 3600 + 38 * 60 + 21) * 1000);
    expect(Math.round(procs[1].mb)).toBe(684);
    expect(procs[0].cmd).toBe('node pnpm exec next dev -p 3011');
  });
});

describe('what counts as left behind', () => {
  it('a finished agent\'s server and everything under it, including a program that hides its environment', () => {
    const procs = [APP, proc(30788, 1, 'w-gone'), proc(31907, 30788, null, 'next-server (v16.3.6)', 700)];
    const found = leftovers(procs);
    expect(found).toHaveLength(1);
    expect(found[0].item).toBe('w-gone');
    expect(found[0].procs.map((p) => p.pid).sort()).toEqual([30788, 31907]);
    expect(Math.round(found[0].mb)).toBe(800);
  });

  it('never a task whose agent is still running', () => {
    const procs = [APP, agent(600, 'w-live'), proc(601, 600, 'w-live'), proc(700, 1, 'w-live')];
    expect(leftovers(procs)).toEqual([]);
  });

  it('never a task the app says has a session, even before its agent process shows up', () => {
    const procs = [APP, proc(700, 1, 'w-starting')];
    expect(leftovers(procs, { live: (item) => item === 'w-starting' })).toEqual([]);
  });

  it('never a program no agent started: the app itself, your browser, your own terminal sessions', () => {
    const procs = [APP, proc(64505, 1, null, 'Arc'), proc(800, 1, null, '/Users/x/.local/bin/claude'), proc(801, 800, null, 'node dev')];
    expect(leftovers(procs)).toEqual([]);
  });
});

describe('the sweep', () => {
  function harness(procs, { pressure = 'tight' } = {}) {
    let now = T0;
    let list = procs;
    const signals = [];
    const sweeper = new LeftoverSweeper({
      list: async () => list,
      kill: (pid, sig) => { signals.push([pid, sig]); },
      clock: () => now,
    });
    return {
      sweeper, signals,
      setList: (l) => { list = l; },
      advance: (ms) => { now += ms; },
      sweep: () => sweeper.sweep(pressure),
    };
  }
  const night = () => [APP, proc(30788, 1, 'w-gone'), proc(31907, 30788, null, 'next-server', 700)];

  it('does nothing while memory is fine', async () => {
    const h = harness(night(), { pressure: 'normal' });
    await h.sweep(); h.advance(120_000); await h.sweep();
    expect(h.signals).toEqual([]);
  });

  it('waits for a second look a minute later, then asks every leftover to stop', async () => {
    const h = harness(night());
    await h.sweep();
    expect(h.signals).toEqual([]);
    h.advance(30_000); await h.sweep();
    expect(h.signals).toEqual([]);
    h.advance(31_000); await h.sweep();
    expect(h.signals.map(([p, s]) => `${p}:${s}`).sort()).toEqual(['30788:SIGTERM', '31907:SIGTERM']);
  });

  it('leaves a task alone if its agent came back between the two looks', async () => {
    const h = harness(night());
    await h.sweep();
    h.setList([...night(), agent(900, 'w-gone')]);
    h.advance(61_000); await h.sweep();
    h.setList(night());
    h.advance(61_000); await h.sweep();
    expect(h.signals).toEqual([]);
  });

  it('forces what is still running ten seconds later, and only if it is the same program', async () => {
    const h = harness(night());
    await h.sweep(); h.advance(61_000); await h.sweep();
    // 30788 stopped; 31907 ignored the request; and 31907's number now belongs
    // to nothing else, so it is forced. A third pid was reused by a new program.
    h.setList([APP, proc(31907, 30788, null, 'next-server', 700)]);
    h.advance(10_000);
    await h.sweeper.finishStops();
    expect(h.signals.filter(([, s]) => s === 'SIGKILL')).toEqual([[31907, 'SIGKILL']]);
  });

  it('never forces a pid that now belongs to a different program', async () => {
    const h = harness(night());
    await h.sweep(); h.advance(61_000); await h.sweep();
    h.setList([APP, proc(31907, 1, null, 'something new', 50, T0 + 65_000)]);
    h.advance(10_000);
    await h.sweeper.finishStops();
    expect(h.signals.filter(([, s]) => s === 'SIGKILL')).toEqual([]);
  });

  it('says what it stopped, in a sentence the Settings page shows', async () => {
    const h = harness(night());
    await h.sweep(); h.advance(61_000); await h.sweep();
    expect(h.sweeper.last).toMatchObject({ programs: 2, tasks: 1 });
    expect(Math.round(h.sweeper.last.mb)).toBe(800);
  });

  it('a list that cannot be read stops nothing and does not throw', async () => {
    const sweeper = new LeftoverSweeper({ list: async () => { throw new Error('ps failed'); }, kill: () => { throw new Error('no'); }, clock: () => T0 });
    await expect(sweeper.sweep('critical')).resolves.toBe(null);
  });
});

describe('the coordinator runs the sweep', () => {
  async function coordinator(level, { owner = true } = {}) {
    const dir = fs.mkdtempSync(path.join('/tmp', 'sweep-'));
    const calls = [];
    let now = T0;
    const server = new MemoryGateServer({
      socketPath: path.join(dir, 'g.sock'),
      readPressure: async () => ({ level, freePct: 40 }),
      sampleProcesses: async () => [],
      pollMs: 60_000,
      sweepEveryMs: 30_000,
      clock: () => now,
      sweeper: { sweep: async (p) => { calls.push(p); return null; }, last: null },
    });
    if (owner) await server.start(); else server.role = 'standby';
    return { server, calls, dir, advance: (ms) => { now += ms; }, done: async () => { await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
  }

  it('hands the sweep the pressure it read, at most every 30 seconds', async () => {
    const c = await coordinator(2);
    await c.server._poll();
    c.advance(10_000); await c.server._poll();
    c.advance(25_000); await c.server._poll();
    expect(c.calls).toEqual(['tight', 'tight']);
    await c.done();
  });

  it('only the app that owns the coordinator sweeps, so two apps never both do', async () => {
    const c = await coordinator(4, { owner: false });
    await c.server._poll();
    expect(c.calls).toEqual([]);
    await c.done();
  });
});

describe('what the Settings page says', () => {
  const config = { memoryGate: true, memoryGateSlots: null };
  const status = (cleared) => ({ role: 'owner', pressure: 'tight', running: [], waiting: [], cleared });

  it('what it stopped, for an hour', () => {
    const now = memoryGateSettings({ config, supervisor: { memoryGateStatus: () => status({ at: Date.now() - 5 * 60_000, programs: 40, tasks: 7 }) } }).now;
    expect(now).toBe('Memory is tight. Nothing heavy running. It stopped 40 programs that finished agents had left running.');
  });

  it('and nothing about it after that', () => {
    const now = memoryGateSettings({ config, supervisor: { memoryGateStatus: () => status({ at: Date.now() - 2 * HOUR, programs: 40, tasks: 7 }) } }).now;
    expect(now).toBe('Memory is tight. Nothing heavy running.');
  });
});

describe('the app wires it up', () => {
  it('the sweeper treats every task with a session in this app as live', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-sup-'));
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, memoryGate: true, memoryGateSocket: path.join(tmp, 'g.sock') }, store, root, tmp, tmp);
    await sup.setMemoryGate(true);
    sup.sessions.set('w-running', {});
    const sweeper = sup._memoryGate.sweeper;
    expect(sweeper.live('w-running')).toBe(true);
    expect(sweeper.live('w-finished')).toBe(false);
    await sup.stopMemoryGate();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
