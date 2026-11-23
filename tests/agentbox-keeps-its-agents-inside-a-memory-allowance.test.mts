// AGENTBOX KEEPS ITS AGENTS INSIDE A MEMORY ALLOWANCE.
//
// What broke: the app lagged within half an hour of starting, day after day.
// Measured on a 16 GB Mac's own minute log and freeze log, 17 to 23 November
// 2026 (6,318 minutes with a process listing, 1,101 of them short of memory):
//
//   - The Mac ran short by the sum of what Agentbox held (the app and its
//     agents' programs) and what the five biggest other programs held. Under
//     9 GB together it was short in 3 to 11% of minutes, at 10 to 11 GB in
//     57%, over 14 GB in 93%.
//   - The app froze where Agentbox itself was big. Short minutes with Agentbox
//     at 6 GB or more had a freeze of half a second or longer 41 to 44% of the
//     time, 4.8 to 6.3 s a minute. Short minutes where only other programs
//     were big (a backup at 4 GB) had one 9% of the time; normal minutes 3%.
//   - Every door acted on the kernel's word, which came after the fact. At
//     19:56 UTC on the 22nd the app held 4.0 GB and its agents 8.4 GB beside
//     4.0 GB of other programs, with 2 of 6 agents running, so the warning
//     held no new start; heavy commands had been let through earlier.
//
// So Agentbox has an allowance: nine sixteenths of the computer's memory less
// what the biggest other programs hold, never under two sixteenths. While the
// app and its agents are over it, and the agents hold enough to give some
// back, new agents and heavy commands wait, whatever the kernel says. Replayed
// over that week the rule holds in 735 minutes, 448 of them already short and
// 236 of the other 287 followed by a short minute within 15; before the 28
// stretches where the app froze it fired a median of 12 minutes ahead. A
// squeeze that is all other programs holds nothing here: at 18:18 UTC on the
// 23rd a backup held 4.0 GB, the agents 338 MB, and nothing of theirs waited.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { allowanceMb, gatePressure, overAllowance, standing } from '../main/memory-allowance.mts';
import { startDecision } from '../main/start-hold.mts';
import { MemoryLog } from '../main/memory-log.mts';
import { MemoryGateServer } from '../main/memory-gate-server.mts';
import { CommandHistory } from '../main/memory-gate-history.mts';
import { Supervisor } from '../main/supervisor.mts';

const GB = 1024;
const RAM = 16 * GB;
// The two measured minutes.
const AGENTS_BIG = { ramMb: RAM, appMb: 4014, tasksMb: 8352, othersMb: 4003 };
const BACKUP_BIG = { ramMb: RAM, appMb: 2349, tasksMb: 338, othersMb: 8114 };

describe('the allowance', () => {
  it('is what is left of nine sixteenths after the biggest other programs', () => {
    expect(allowanceMb(RAM, 4 * GB)).toBe(5 * GB);
    expect(allowanceMb(RAM, 0)).toBe(9 * GB);
    expect(allowanceMb(RAM, 4003)).toBe(5213);
  });

  it('never goes under two sixteenths, however much the others hold', () => {
    expect(allowanceMb(RAM, 7 * GB)).toBe(2 * GB);
    expect(allowanceMb(RAM, 8114)).toBe(2 * GB);
    expect(allowanceMb(RAM, 40 * GB)).toBe(2 * GB);
  });

  it('scales with the computer', () => {
    expect(allowanceMb(8 * GB, 2 * GB)).toBe(2.5 * GB);
    expect(allowanceMb(32 * GB, 4 * GB)).toBe(14 * GB);
  });
});

describe('where Agentbox stands', () => {
  it('is over on the minute the agents held 8.4 GB', () => {
    expect(standing(AGENTS_BIG)).toEqual({ allowanceMb: 5213, agentboxMb: 12366, over: true });
  });

  it('is not over on the minute a backup held the memory and the agents 338 MB', () => {
    expect(standing(BACKUP_BIG)).toEqual({ allowanceMb: 2048, agentboxMb: 2687, over: false });
  });

  it('turns over one megabyte past the allowance, and not at it', () => {
    const at = { ramMb: RAM, appMb: 2 * GB, tasksMb: 3 * GB, othersMb: 4 * GB };
    expect(standing(at)!.over).toBe(false);
    expect(standing({ ...at, tasksMb: 3 * GB + 1 })!.over).toBe(true);
  });

  it('needs the agents to hold a sixteenth, since less gives nothing back', () => {
    const squeezed = { ramMb: RAM, appMb: 3 * GB, othersMb: 8 * GB };
    expect(standing({ ...squeezed, tasksMb: GB - 1 })!.over).toBe(false);
    expect(standing({ ...squeezed, tasksMb: GB })!.over).toBe(true);
  });

  it('says nothing from figures it does not have', () => {
    expect(standing({ ...AGENTS_BIG, ramMb: 0 })).toBe(null);
    expect(standing({ ...AGENTS_BIG, othersMb: NaN })).toBe(null);
    expect(standing({ ...AGENTS_BIG, appMb: undefined as unknown as number })).toBe(null);
  });
});

describe('when the doors act on it', () => {
  const NOW = 1_800_000_000_000;
  const at = (over: boolean, age: number) => ({ allowanceMb: 5 * GB, agentboxMb: over ? 9 * GB : 3 * GB, over, at: NOW - age });

  it('on a reading taken this minute', () => {
    expect(overAllowance([at(true, 20_000)], NOW)).toBe(true);
    expect(overAllowance([at(false, 20_000)], NOW)).toBe(false);
  });

  it('not on one too old to trust, nor on none', () => {
    expect(overAllowance([at(true, 150_000)], NOW)).toBe(true);
    expect(overAllowance([at(true, 150_001)], NOW)).toBe(false);
    expect(overAllowance([], NOW)).toBe(false);
    expect(overAllowance(null, NOW)).toBe(false);
  });

  it('one reading back inside does not open them: three minutes inside does', () => {
    expect(overAllowance([at(true, 80_000), at(false, 20_000)], NOW)).toBe(true);
    expect(overAllowance([at(true, 180_000), at(false, 20_000)], NOW)).toBe(true);
    expect(overAllowance([at(true, 180_001), at(false, 120_000), at(false, 60_000), at(false, 0)], NOW)).toBe(false);
  });

  it('heavy commands wait as they do when memory is tight, and no more than that', () => {
    expect(gatePressure('normal', true)).toBe('tight');
    expect(gatePressure('normal', false)).toBe('normal');
    expect(gatePressure('tight', true)).toBe('tight');
    expect(gatePressure('critical', true)).toBe('critical');
    expect(gatePressure('critical', false)).toBe('critical');
  });
});

describe('a new agent', () => {
  const NOW = 1_800_000_000_000;
  const fine = { level: 1, freePct: 62, swapInMbps: 0, at: NOW };
  const base = { on: true, now: NOW, running: 2, reading: fine, lastStartAt: NOW - 60_000, heldSince: null, roomy: 4 };

  it('waits while Agentbox is over, with memory reading fine and only two running', () => {
    expect(startDecision({ ...base, over: true })).toEqual({ start: false, why: 'tight' });
  });

  it('starts as before while Agentbox is inside', () => {
    expect(startDecision({ ...base, over: false })).toEqual({ start: true, why: 'normal' });
    expect(startDecision(base)).toEqual({ start: true, why: 'normal' });
  });

  it('still starts when the person asked for it, or it is urgent', () => {
    expect(startDecision({ ...base, over: true, asked: true })).toEqual({ start: true, why: 'urgent' });
    expect(startDecision({ ...base, over: true, urgent: true })).toEqual({ start: true, why: 'urgent' });
  });

  it('still starts with nothing running, as a swap, after ten minutes held, and with the check off', () => {
    expect(startDecision({ ...base, over: true, running: 0 })).toEqual({ start: true, why: 'nothing-running' });
    expect(startDecision({ ...base, over: true, swap: true })).toEqual({ start: true, why: 'swap' });
    expect(startDecision({ ...base, over: true, heldSince: NOW - 10 * 60_000, lastStartAt: 0 })).toEqual({ start: true, why: 'overdue' });
    expect(startDecision({ ...base, over: true, on: false })).toEqual({ start: true, why: 'off' });
  });

  it('waits on the allowance even when the kernel gave no reading', () => {
    expect(startDecision({ ...base, over: true, reading: null })).toEqual({ start: false, why: 'tight' });
    expect(startDecision({ ...base, over: false, reading: null })).toEqual({ start: true, why: 'no-reading' });
  });

  it('a kernel that says very short still says so over the allowance', () => {
    expect(startDecision({ ...base, over: true, reading: { ...fine, level: 4 } })).toEqual({ start: false, why: 'critical' });
  });
});

describe('the minute log', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'allowance-')); dirs.push(d); return d; };
  const proc = (pid: number, ppid: number, exe: string, extra = {}) => ({ pid, ppid, mb: 1, start: null, exe, cmd: exe, item: null, product: null, keep: false, ...extra });
  // The app, one agent with a hidden browser, and two other programs.
  const procs = () => [
    proc(1, 0, '/sbin/launchd'),
    proc(100, 1, '/Apps/Agentbox.app/Contents/MacOS/Agentbox'),
    proc(200, 100, '/u/.local/bin/claude', { item: 'w-aaa', product: 'p' }),
    proc(201, 200, '/u/Library/Caches/ms-playwright/chrome-headless-shell'),
    proc(400, 1, '/Applications/Backblaze.app/Contents/MacOS/bztransmit'),
    proc(401, 1, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ];
  const sizes = (app: number, agent: number, browser: number, backup: number, chrome: number) => new Map([[1, 10], [100, app], [200, agent], [201, browser], [400, backup], [401, chrome]]);
  const read = (dir: string) => fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  function make(footprints: () => Map<number, number>, extra = {}) {
    const dir = tmp();
    let now = new Date(2026, 10, 22, 11, 56).getTime();
    const log = new MemoryLog({
      dir, appPid: 100, ramMb: RAM, list: async () => procs(), footprints: async () => footprints(),
      readPressure: async () => ({ level: 1, freePct: 60 }), now: () => now, facts: () => ({ running: 1, capacity: 6 }), ...extra,
    });
    return { dir, log, later: (ms: number) => { now += ms; } };
  }

  it('writes where Agentbox stands on each line with a listing, and answers the doors', async () => {
    const { dir, log } = make(() => sizes(4000, 300, 8000, 3000, 1000));
    expect(log.overAllowance()).toBe(false);
    await log.tick();
    const [line] = read(dir);
    // 9216 less the two other programs (and launchd's 10 MB); the app and its agent's 8300.
    expect(line.allowance).toEqual({ allowanceMb: 5206, agentboxMb: 12300, over: true });
    expect(log.overAllowance()).toBe(true);
  });

  it('stops answering over once the agents are back inside for three minutes', async () => {
    let browser = 8000;
    const { dir, log, later } = make(() => sizes(1500, 300, browser, 3000, 1000));
    await log.tick();
    expect(log.overAllowance()).toBe(true);
    browser = 400;
    for (let i = 0; i < 3; i++) { later(60_000); await log.tick(); }
    expect(read(dir).map((l) => l.allowance.over)).toEqual([true, false, false, false]);
    expect(log.overAllowance()).toBe(true);
    later(60_000);
    await log.tick();
    expect(log.overAllowance()).toBe(false);
  });

  it('a reading nobody has refreshed stops holding', async () => {
    const { log, later } = make(() => sizes(4000, 300, 8000, 3000, 1000));
    await log.tick();
    later(151_000);
    expect(log.overAllowance()).toBe(false);
  });

  it('judges only footprints: resident sizes run low exactly when the computer is short', async () => {
    const { dir, log } = make(() => new Map());
    await log.tick();
    expect(read(dir)[0].measure).toBe('rss');
    expect(read(dir)[0].allowance).toBeUndefined();
    expect(log.overAllowance()).toBe(false);
  });
});

describe('the command gate', () => {
  const servers: MemoryGateServer[] = [];
  const dirs: string[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) await s.stop();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function makeServer(over: () => boolean) {
    const dir = fs.mkdtempSync(path.join('/tmp', 'gate-allow-'));
    dirs.push(dir);
    const history = new CommandHistory();
    for (let i = 0; i < 3; i++) history.record('git status', { peakMb: 10, durationMs: 100 });
    history.record('npm test', { peakMb: 900, durationMs: 60_000 });
    const server = new MemoryGateServer({
      socketPath: path.join(dir, 'g.sock'), history, overAllowance: over,
      readPressure: async () => ({ level: 1, freePct: 60, swapInMbps: 0 }), sampleProcesses: async () => [],
      pollMs: 30, idlePollMs: 30, takeoverMs: 50, lockPort: 0, gate: { slots: 2 },
    });
    servers.push(server);
    await server.start();
    return path.join(dir, 'g.sock');
  }

  function ask(sock: string, id: string, command: string) {
    const body = JSON.stringify({ item: 'w-test', product: 'demo', score: 5, ppid: process.pid, hook: { tool_use_id: id, tool_input: { command }, duration_ms: 10 } });
    let answered = false;
    const done = new Promise<void>((resolve, reject) => {
      const req = http.request({ socketPath: sock, path: '/pre', method: 'POST' }, (res) => {
        res.on('data', () => {});
        res.on('end', () => { answered = true; resolve(); });
      });
      req.on('error', reject);
      req.end(body);
    });
    return { answered: () => answered, done };
  }

  it('holds a heavy command while Agentbox is over, with both slots free and memory reading fine', async () => {
    let over = true;
    const sock = await makeServer(() => over);
    await wait(80);
    const heavy = ask(sock, 'h1', 'npm test');
    const light = ask(sock, 'l1', 'git status');
    await light.done;
    await wait(150);
    expect(heavy.answered()).toBe(false);
    over = false;
    await heavy.done;
    expect(heavy.answered()).toBe(true);
  });

  it('lets a heavy command straight through while Agentbox is inside', async () => {
    const sock = await makeServer(() => false);
    await wait(80);
    await ask(sock, 'h1', 'npm test').done;
  });
});

describe('the fleet', () => {
  let dir: string;
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const task = (id: string) => ({ id, product: 'sample', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, createdAt: 1, updatedAt: 1 });

  function setup(over: boolean) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allowance-fleet-'));
    const sup = new Supervisor({
      home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'], agentsAuto: true, memoryGate: true,
    }, { listItems: () => [task('q-0')], listProducts: () => [], isDue: () => true, settleAnswer() {} }, dir);
    sup._machine = () => ({ memBytes: 16 * 1024 ** 3, cores: 10 });
    sup._memReading = { level: 1, freePct: 62, swapInMbps: 0, at: Date.now() };
    sup._memoryLog = { overAllowance: () => over };
    for (let n = 0; n < 2; n++) sup.sessions.set(`r-${n}`, { itemId: `r-${n}`, engine: 'claude', product: 'sample' });
    return sup;
  }

  it('holds the third agent while the first two are over the allowance', () => {
    const sup = setup(true);
    expect(sup._memoryLetsStart(task('q-0'))).toBe(false);
    expect(sup.startHoldStatus()).toMatchObject({ holding: true, pressure: 'tight' });
  });

  it('starts it while they are inside, and when the person asked for it by name', () => {
    expect(setup(false)._memoryLetsStart(task('q-0'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(setup(true)._memoryLetsStart(task('q-0'), { asked: true })).toBe(true);
  });

  it('asks nothing of the allowance with the memory check switched off', () => {
    const sup = setup(true);
    sup.config.memoryGate = false;
    expect(sup._overAllowance()).toBe(false);
    expect(sup._memoryLetsStart(task('q-0'))).toBe(true);
  });

  it('hands the same answer to the command gate', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/overAllowance: \(\) => this\._overAllowance\(\)/);
  });
});
