// THE THREAD HOLDING THE MOST MEMORY IS ASKED TO GIVE SOME BACK.
//
// What broke: holding new agents and heavy commands while Agentbox is over
// its allowance (main/memory-allowance.mts) keeps it from growing, and does
// nothing to bring it back inside. Measured on a 16 GB Mac's minute log, 17 to
// 23 November 2026, over the 735 minutes Agentbox was over:
//
//   - In 648 the one biggest thread held more than all the room left for
//     agents, and in 329 the other threads together held under 1 GB. It was
//     one or two heavy threads, not many agents: 352 minutes had one thread at
//     half a gigabyte or more, 327 had two, 55 had three or four.
//   - Those threads started inside the allowance and grew: 3 to 5 GB each in 30
//     to 75 programs, test browsers at 0.4 to 1.4 GB apiece beside a build at
//     2 GB. Threads that started while Agentbox was already over held 31% of
//     the agents' memory in the 448 short minutes; the other 69% no door saw.
//   - Runs that had already ended held about 0.4 GB of a mean 4.1 GB, so
//     sweeping leftovers sooner would have brought 11 of the 735 back inside.
//
// Only the agent holding the memory can give it back, and it was never told.
// So while Agentbox is over, the thread holding the most (a sixteenth of the
// computer or more) has its next command answered with what it holds, tree by
// tree with the pid to stop, and is asked to stop what it no longer needs and
// run the command again. Once: its later commands queue as they did, and it is
// asked again only after fifteen minutes and only if it holds more.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { heaviestOver } from '../main/memory-allowance.mts';
import { ASK_AGAIN_MS, ASK_FORGOTTEN_MS, askedByANestedAgent, commandTrees, giveBackAsk, mayAskAgain } from '../main/memory-give-back.mts';
import { MemoryLog } from '../main/memory-log.mts';
import { MemoryGateServer } from '../main/memory-gate-server.mts';
import { CommandHistory } from '../main/memory-gate-history.mts';
import { summariseGrants } from '../scripts/read-memory-gate-log.mjs';
import { Supervisor } from '../main/supervisor.mts';

const GB = 1024;
const RAM = 16 * GB;
const NOW = 1_800_000_000_000;
const proc = (pid: number, ppid: number, exe: string, mb: number, extra: Record<string, unknown> = {}) => ({
  pid, ppid, mb, start: NOW / 1000 - 600, exe, cmd: exe, item: 'w-aaa', product: 'p', keep: false, ...extra,
});

// One Claude thread as `ps` shows it: the agent, the tool server it started,
// the shell of the command it is running, a browser an earlier command left
// behind (its script is gone, so launchd has it), and a dev server.
const THREAD = [
  proc(200, 100, '/u/.local/share/claude/versions/2.1.330', 300),
  proc(201, 200, '/usr/local/bin/node', 90, { cmd: 'node /app/mcp/stdio.mts' }),
  proc(202, 201, '/usr/local/bin/node', 20, { cmd: 'node /app/mcp/helper.mjs' }),
  proc(210, 200, '/bin/zsh', 2, { cmd: '/bin/zsh -c npm run test:changed' }),
  proc(211, 210, '/usr/local/bin/node', 700, { cmd: 'node scripts/test-what-changed.mjs', start: NOW / 1000 - 120 }),
  proc(212, 211, '/usr/local/bin/node', 300, { cmd: 'node (vitest 1)' }),
  proc(300, 1, '/u/Library/Caches/ms-playwright/chromium/Google Chrome for Testing', 400, { start: NOW / 1000 - 52 * 60 }),
  proc(301, 300, '/u/Library/Caches/ms-playwright/chromium/Google Chrome for Testing Helper (Renderer)', 900),
  proc(302, 300, '/u/Library/Caches/ms-playwright/chromium/Google Chrome for Testing Helper (GPU)', 600),
  proc(400, 1, '/usr/local/bin/node', 2100, { cmd: 'node /repo/node_modules/.bin/vite', start: NOW / 1000 - 2 * 3600 }),
];

describe('what a thread\'s commands left running', () => {
  it('is each program a command started, with everything under it, biggest first', () => {
    expect(commandTrees(THREAD)).toEqual([
      { pid: 400, name: 'node vite', mb: 2100, procs: 1, startedAt: NOW - 2 * 3600_000 },
      { pid: 300, name: 'Google Chrome for Testing', mb: 1900, procs: 3, startedAt: NOW - 52 * 60_000 },
      { pid: 211, name: 'node test-what-changed.mjs', mb: 1000, procs: 2, startedAt: NOW - 120_000 },
    ]);
  });

  it('never the agent, nor a tool server the agent started itself, nor what is under one', () => {
    const pids = commandTrees(THREAD).map((t) => t.pid);
    for (const own of [200, 201, 202]) expect(pids).not.toContain(own);
  });

  it('the agent under every name it is installed as', () => {
    // Its own installer, Homebrew, npm's packaged binary (claude.exe on Linux too), and node running the package.
    const AGENTS: [string, string?][] = [
      ['/u/.local/bin/claude'], ['/opt/homebrew/bin/codex'],
      ['/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'],
      ['/usr/local/bin/node', 'node /usr/local/lib/node_modules/@openai/codex/bin/codex.js app-server'],
      ['/usr/local/bin/node', 'node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js -p'],
    ];
    for (const [exe, cmd] of AGENTS) {
      const trees = commandTrees([proc(200, 100, exe, 300, cmd ? { cmd } : {}), proc(201, 200, '/usr/local/bin/node', 90, { cmd: 'node stdio.mts' })]);
      expect(trees, exe + (cmd ?? '')).toEqual([]);
    }
    // A script that only has the word in its name is a command like any other.
    expect(commandTrees([proc(500, 1, '/usr/local/bin/node', 300, { cmd: 'node scripts/codex-check.mjs' })]).map((t) => t.pid)).toEqual([500]);
  });

  it('and whoever is asking, under any name at all: it and what it runs under are the agent', () => {
    // An agent this file has never heard of, hosted by another program of the thread's.
    const odd = [
      proc(190, 1, '/Apps/Agentbox.app/Contents/MacOS/Agentbox Helper', 70, { cmd: 'Agentbox Helper run-host.mts' }),
      proc(200, 190, '/opt/next-harness/bin/agent', 300),
      proc(201, 200, '/usr/local/bin/node', 90, { cmd: 'node stdio.mts' }),
      proc(210, 200, '/bin/zsh', 2),
      proc(211, 210, '/usr/local/bin/node', 700, { cmd: 'node scripts/test-what-changed.mjs' }),
    ];
    // Unnamed, it would read as one program holding everything under it.
    expect(commandTrees(odd).map((t) => t.pid)).toEqual([190]);
    expect(commandTrees(odd, [200])).toEqual([{ pid: 211, name: 'node test-what-changed.mjs', mb: 700, procs: 1, startedAt: NOW - 600_000 }]);
    // On Linux the hook's parent is a launcher under the agent, and the pids above it are given too.
    expect(commandTrees(odd, [9999, 200, 190]).map((t) => t.pid)).toEqual([211]);
  });

  it('nor the shell a command runs in, which is the command itself', () => {
    expect(commandTrees(THREAD).map((t) => t.pid)).not.toContain(210);
    // A shell further down is part of what it runs under.
    const nested = [proc(500, 1, '/usr/local/bin/node', 200, { cmd: 'node watch.mjs' }), proc(501, 500, '/bin/sh', 5, { cmd: 'sh -c esbuild' }), proc(502, 501, '/repo/esbuild', 100)];
    expect(commandTrees(nested)).toEqual([{ pid: 500, name: 'node watch.mjs', mb: 305, procs: 3, startedAt: NOW - 600_000 }]);
  });

  it('nor anything marked to keep, which the person may be looking at', () => {
    const kept = [proc(600, 1, '/usr/local/bin/node', 800, { cmd: 'node server.js', keep: true }), proc(601, 600, '/usr/local/bin/node', 100, { cmd: 'node worker.js', keep: true })];
    expect(commandTrees(kept)).toEqual([]);
  });

  it('a Codex thread has no agent of its own in the list: its commands stand under their shells', () => {
    // One app-server serves every Codex thread, so only what a command started carries the thread.
    const codex = [
      proc(700, 90, '/bin/bash', 3, { cmd: 'bash -lc npm run dev' }),
      proc(701, 700, '/usr/local/bin/node', 1400, { cmd: 'node /repo/node_modules/.bin/next dev' }),
    ];
    expect(commandTrees(codex)).toEqual([{ pid: 701, name: 'node next', mb: 1400, procs: 1, startedAt: NOW - 600_000 }]);
  });

  it('a program whose start could not be read says so rather than guessing', () => {
    expect(commandTrees([proc(800, 1, '/repo/server', 500, { start: null })])[0].startedAt).toBe(null);
  });
});

describe('which thread is asked', () => {
  const over = { allowanceMb: 5 * GB, agentboxMb: 9 * GB, over: true };
  const inside = { allowanceMb: 5 * GB, agentboxMb: 3 * GB, over: false };
  const tasks = [{ item: 'w-small', mb: 900 }, { item: 'w-big', mb: 3400 }, { item: 'w-mid', mb: 2100 }];

  it('the one holding the most, while Agentbox is over', () => {
    expect(heaviestOver(tasks, over, RAM)).toEqual({ item: 'w-big', mb: 3400 });
  });

  it('nobody while Agentbox is inside, or with no standing at all', () => {
    expect(heaviestOver(tasks, inside, RAM)).toBe(null);
    expect(heaviestOver(tasks, null, RAM)).toBe(null);
    expect(heaviestOver([], over, RAM)).toBe(null);
  });

  it('nobody when even the biggest holds under a sixteenth, which gives nothing back', () => {
    expect(heaviestOver([{ item: 'w-a', mb: GB - 1 }, { item: 'w-b', mb: 600 }], over, RAM)).toBe(null);
    expect(heaviestOver([{ item: 'w-a', mb: GB }, { item: 'w-b', mb: 600 }], over, RAM)).toEqual({ item: 'w-a', mb: GB });
  });
});

describe('who may be asked on a thread\'s behalf', () => {
  // A thread whose worker (200) runs two testers, each an agent of its own
  // started by one of the worker's commands, as a tester loop does.
  const LOOP = [
    proc(200, 100, '/u/.local/bin/claude', 300),
    proc(210, 200, '/bin/zsh', 2),
    proc(499, 210, '/usr/local/bin/node', 60, { cmd: 'node /usr/local/lib/node_modules/@openai/codex/bin/codex.js exec' }),
    proc(500, 499, '/usr/local/lib/node_modules/@openai/codex/vendor/codex', 250),
    proc(510, 500, '/bin/bash', 2),
    proc(511, 510, '/u/Library/Caches/ms-playwright/chromium/Google Chrome for Testing', 1900),
  ];
  const holding = { item: 'w-aaa', mb: 2500, programs: LOOP, at: NOW };

  it('the thread\'s own worker, which is the pid above its hook on a Mac', () => {
    expect(askedByANestedAgent(holding, [200], [200])).toBe(false);
  });

  it('not an agent one of its commands started: that is one of the things it left running', () => {
    expect(askedByANestedAgent(holding, [500], [200])).toBe(true);
    // On Linux the hook's parent is a launcher, with the pids above it nearest first.
    expect(askedByANestedAgent(holding, [9001, 500, 499, 210, 200], [200])).toBe(true);
    expect(askedByANestedAgent(holding, [9002, 200, 100], [200])).toBe(false);
  });

  it('only on a positive finding: a pid the listing does not have is not a nested agent', () => {
    // A Codex thread asks from the one app-server every thread shares, which carries no thread.
    expect(askedByANestedAgent(holding, [90], [])).toBe(false);
    // A launcher too short-lived to have been listed.
    expect(askedByANestedAgent(holding, [9003], [200])).toBe(false);
    expect(askedByANestedAgent(holding, [], [200])).toBe(false);
  });

  it('the worker is still told of what its testers started, and never to stop a tester itself', () => {
    const said = giveBackAsk(holding, NOW, { asker: [200] })!;
    expect(said).toContain('pid 511: Google Chrome for Testing, 1.9 GB');
    for (const agent of [200, 499, 500]) expect(said).not.toContain(`pid ${agent}:`);
  });
});

describe('what it is told', () => {
  const holding = { item: 'w-aaa', mb: 6412, programs: THREAD, at: NOW };
  const said = giveBackAsk(holding, NOW)!;

  it('how much this thread holds, and that the command has not run', () => {
    expect(said).toMatch(/^Not run yet\./);
    expect(said).toContain('6.3 GB');
  });

  it('each tree with the pid to stop, its size and how long it has been up', () => {
    expect(said).toContain('pid 400: node vite, 2.1 GB, started 2 hours ago');
    expect(said).toContain('pid 300: Google Chrome for Testing, 1.9 GB in 3 programs, started 52 minutes ago');
    expect(said).toContain('pid 211: node test-what-changed.mjs, 1.0 GB in 2 programs, started 2 minutes ago');
  });

  it('to stop by pid and never by name, nothing that is not listed, and to run the command again', () => {
    expect(said).toMatch(/by pid/);
    expect(said).toMatch(/never by name/);
    expect(said).toMatch(/nothing that is not listed/);
    expect(said).toMatch(/run this command again/);
    // The way out for a thread that needs everything it has.
    expect(said).toMatch(/still need all of them/);
  });

  it('never lists the agent it is talking to, nor its tool server', () => {
    for (const own of [200, 201, 202, 210]) expect(said).not.toContain(`pid ${own}:`);
    // Nor an agent only known by its asking.
    const odd = [proc(200, 1, '/opt/next-harness/bin/agent', 900), proc(300, 1, '/repo/server', 500)];
    expect(giveBackAsk({ item: 'w-aaa', mb: 1400, programs: odd, at: NOW }, NOW, { asker: [200] })).not.toContain('pid 200:');
  });

  it('leaves out what has ended since the listing, which can be a minute old', () => {
    const text = giveBackAsk(holding, NOW, { running: (pid) => pid !== 211 })!;
    expect(text).toContain('pid 400:');
    expect(text).toContain('pid 300:');
    expect(text).not.toContain('pid 211:');
  });

  it('and asks nothing at all when nothing it could name is still running', () => {
    expect(giveBackAsk(holding, NOW, { running: () => false })).toBe(null);
    // Nor of a thread whose memory is all the agent's own.
    expect(giveBackAsk({ item: 'w-aaa', mb: 3000, programs: THREAD.slice(0, 3), at: NOW }, NOW)).toBe(null);
    expect(giveBackAsk({ item: 'w-aaa', mb: 3000, programs: [], at: NOW }, NOW)).toBe(null);
  });

  it('lists the six biggest and nothing under 50 MB', () => {
    const many = Array.from({ length: 9 }, (_, i) => proc(900 + i, 1, '/usr/local/bin/node', 900 - i * 100, { cmd: `node s${i}.mjs` }));
    const text = giveBackAsk({ item: 'w-aaa', mb: 4000, programs: [...many, proc(999, 1, '/usr/bin/curl', 49)], at: NOW }, NOW)!;
    expect(text.match(/pid \d+:/g)).toHaveLength(6);
    expect(text).toContain('pid 905:');
    expect(text).not.toContain('pid 906:');
    expect(text).not.toContain('pid 999:');
  });

  it('says under a minute for a program that has only just started', () => {
    const fresh = [proc(810, 1, '/repo/server', 500, { start: NOW / 1000 - 20 }), proc(811, 1, '/repo/worker', 400, { start: NOW / 1000 - 60 })];
    const text = giveBackAsk({ item: 'w-aaa', mb: 3000, programs: fresh, at: NOW }, NOW)!;
    expect(text).toContain('pid 810: server, 0.5 GB, started under a minute ago');
    expect(text).toContain('pid 811: worker, 0.4 GB, started 1 minute ago');
  });

  it('a start it could not read is left out of the line, not made up', () => {
    const text = giveBackAsk({ item: 'w-aaa', mb: 3000, programs: [proc(800, 1, '/repo/server', 500, { start: null })], at: NOW }, NOW)!;
    expect(text).toContain('pid 800: server, 0.5 GB\n');
  });
});

describe('how often', () => {
  const holding = { item: 'w-aaa', mb: 3400, programs: [], at: NOW };

  it('once: a thread never asked is asked', () => {
    expect(mayAskAgain(undefined, holding, NOW)).toBe(true);
  });

  it('not again inside fifteen minutes, whatever it holds', () => {
    expect(ASK_AGAIN_MS).toBe(15 * 60_000);
    expect(mayAskAgain({ at: NOW - ASK_AGAIN_MS + 1, mb: 1000 }, holding, NOW)).toBe(false);
  });

  it('after fifteen minutes only if it holds more than when it was asked', () => {
    expect(mayAskAgain({ at: NOW - ASK_AGAIN_MS, mb: 3399 }, holding, NOW)).toBe(true);
    expect(mayAskAgain({ at: NOW - ASK_AGAIN_MS, mb: 3400 }, holding, NOW)).toBe(false);
    expect(mayAskAgain({ at: NOW - 3 * ASK_AGAIN_MS, mb: 5000 }, holding, NOW)).toBe(false);
  });

  it('two hours on, an ask is forgotten: a thread runs for days, and its next run never heard the last one', () => {
    expect(ASK_FORGOTTEN_MS).toBe(2 * 60 * 60_000);
    expect(mayAskAgain({ at: NOW - ASK_FORGOTTEN_MS + 1, mb: 5000 }, holding, NOW)).toBe(false);
    expect(mayAskAgain({ at: NOW - ASK_FORGOTTEN_MS, mb: 5000 }, holding, NOW)).toBe(true);
  });
});

describe('the minute log', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const plain = (pid: number, ppid: number, exe: string, extra = {}) => ({ pid, ppid, mb: 1, start: 1_795_000_000, exe, cmd: exe, item: null, product: null, keep: false, ...extra });
  const procs = () => [
    plain(1, 0, '/sbin/launchd'),
    plain(100, 1, '/Apps/Agentbox.app/Contents/MacOS/Agentbox'),
    plain(200, 100, '/u/.local/bin/claude', { item: 'w-aaa', product: 'p' }),
    plain(201, 1, '/u/Library/Caches/ms-playwright/chrome-headless-shell', { item: 'w-aaa', product: 'p' }),
    plain(250, 100, '/u/.local/bin/claude', { item: 'w-bbb', product: 'p' }),
    plain(251, 1, '/usr/local/bin/node', { item: 'w-bbb', product: 'p', cmd: 'node server.js' }),
    plain(400, 1, '/Applications/Backblaze.app/Contents/MacOS/bztransmit'),
  ];

  function make(sizes: () => Map<number, number>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'give-back-'));
    dirs.push(dir);
    let now = new Date(2026, 10, 22, 11, 56).getTime();
    const log = new MemoryLog({
      dir, appPid: 100, ramMb: RAM, list: async () => procs(), footprints: async () => sizes(),
      readPressure: async () => ({ level: 1, freePct: 60 }), now: () => now, facts: () => ({ running: 2, capacity: 6 }),
    });
    return { dir, log, later: (ms: number) => { now += ms; } };
  }
  const sizes = (browser: number, server: number) => new Map([[1, 10], [100, 2000], [200, 300], [201, browser], [250, 300], [251, server], [400, 3000]]);

  it('names the thread holding the most on a listing that is over, with its programs', async () => {
    const { log } = make(() => sizes(5000, 1500));
    expect(log.heaviest()).toBe(null);
    await log.tick();
    const most = log.heaviest()!;
    expect(most).toMatchObject({ item: 'w-aaa', mb: 5300 });
    expect(most.programs.map((p) => p.pid)).toEqual([200, 201]);
    expect(commandTrees(most.programs)).toMatchObject([{ pid: 201, name: 'chrome-headless-shell', mb: 5000, procs: 1 }]);
  });

  it('names nobody once a listing is back inside, without waiting for the doors to settle', async () => {
    let browser = 5000;
    const { log, later } = make(() => sizes(browser, 1500));
    await log.tick();
    browser = 300;
    later(60_000);
    await log.tick();
    expect(log.overAllowance()).toBe(true);
    expect(log.heaviest()).toBe(null);
  });

  it('nor on a listing too old to trust', async () => {
    const { log, later } = make(() => sizes(5000, 1500));
    await log.tick();
    later(150_000);
    expect(log.heaviest()).not.toBe(null);
    later(1);
    expect(log.heaviest()).toBe(null);
  });

  it('keeps the programs out of the log line, which stays the size it was', async () => {
    const { dir, log } = make(() => sizes(5000, 1500));
    await log.tick();
    const line = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8').trim());
    expect(JSON.stringify(line)).not.toMatch(/programs|"pid"/);
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
  const browser = () => {
    const start = Math.round(Date.now() / 1000) - 52 * 60;
    const chrome = '/u/Library/Caches/ms-playwright/chromium/Google Chrome for Testing';
    return [proc(300, 1, chrome, 400, { start }), proc(301, 300, `${chrome} Helper (Renderer)`, 900, { start }), proc(302, 300, `${chrome} Helper (GPU)`, 600, { start })];
  };
  const holding = (item: string, mb = 3400, programs = browser()) => ({ item, mb, programs, at: Date.now() });

  async function makeServer({ heaviest, urgent = () => false, clock, running = () => true, agentPids }: { heaviest: () => unknown; urgent?: (item: string | null) => boolean; clock?: () => number; running?: (pid: number) => boolean; agentPids?: (item: string) => number[] }) {
    const dir = fs.mkdtempSync(path.join('/tmp', 'gate-back-'));
    dirs.push(dir);
    const history = new CommandHistory();
    for (let i = 0; i < 3; i++) history.record('git status', { peakMb: 10, durationMs: 100 });
    history.record('npm test', { peakMb: 900, durationMs: 60_000 });
    const grantLogFile = path.join(dir, 'grants.jsonl');
    const server = new MemoryGateServer({
      socketPath: path.join(dir, 'g.sock'), history, grantLogFile,
      heaviest: heaviest as never, running, ...(agentPids ? { agentPids } : {}), urgentFor: (_p, item) => urgent(item),
      readPressure: async () => ({ level: 1, freePct: 60, swapInMbps: 0 }), sampleProcesses: async () => [],
      pollMs: 30, idlePollMs: 30, takeoverMs: 50, lockPort: 0, gate: { slots: 2 }, ...(clock ? { clock } : {}),
    });
    servers.push(server);
    await server.start();
    return { sock: path.join(dir, 'g.sock'), server, grants: () => fs.readFileSync(grantLogFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
  }

  function ask(sock: string, id: string, command: string, item = 'w-big'): Promise<string> {
    const body = JSON.stringify({ item, product: 'demo', score: 5, ppid: process.pid, hook: { tool_use_id: id, tool_input: { command }, duration_ms: 10 } });
    return new Promise<string>((resolve, reject) => {
      const req = http.request({ socketPath: sock, path: '/pre', method: 'POST' }, (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => resolve(out));
      });
      req.on('error', reject);
      req.end(body);
    });
  }
  const reason = (answer: string) => JSON.parse(answer).hookSpecificOutput.permissionDecisionReason as string;

  it('answers the heaviest thread\'s next command with what it holds, whatever the command', async () => {
    const { sock, server } = await makeServer({ heaviest: () => holding('w-big') });
    const answer = await ask(sock, 'c1', 'git status');
    expect(JSON.parse(answer).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(reason(answer)).toContain('3.3 GB');
    expect(reason(answer)).toContain('pid 300: Google Chrome for Testing, 1.9 GB in 3 programs');
    expect(server.status().counts).toMatchObject({ askedBack: 1, refused: 0 });
  });

  it('never lists the agent that is asking, whatever it is called', async () => {
    // The hook's parent is the agent: here, this test's own process.
    const asking = [proc(process.pid, 1, '/opt/next-harness/bin/agent', 900), proc(77001, process.pid, '/usr/local/bin/node', 90, { cmd: 'node stdio.mts' }), ...browser()];
    const { sock } = await makeServer({ heaviest: () => holding('w-big', 3400, asking) });
    const said = reason(await ask(sock, 'c1', 'git status'));
    expect(said).toContain('pid 300:');
    expect(said).not.toContain(`pid ${process.pid}:`);
    expect(said).not.toContain('pid 77001:');
  });

  it('nor the worker the app itself started for that thread, when the hook\'s parent is only a launcher', async () => {
    // On a Mac nothing reads a parent's parent, so the app says which pid its worker is.
    const worker = [proc(55001, 1, '/opt/next-harness/bin/agent', 900), proc(55002, 55001, '/usr/local/bin/node', 90, { cmd: 'node stdio.mts' }), ...browser()];
    const { sock } = await makeServer({ heaviest: () => holding('w-big', 3400, worker), agentPids: (item) => (item === 'w-big' ? [55001] : []) });
    const said = reason(await ask(sock, 'c1', 'git status'));
    expect(said).toContain('pid 300:');
    expect(said).not.toContain('pid 55001:');
    expect(said).not.toContain('pid 55002:');
  });

  it('does not ask a tester the thread is running, and keeps its one ask for the thread\'s own worker', async () => {
    // The command comes from this test's own process, listed as a Codex agent a worker's command started.
    let worker = 55001;
    const loop = [
      proc(55001, 1, '/u/.local/bin/claude', 300), proc(55010, 55001, '/bin/zsh', 2),
      proc(process.pid, 55010, '/usr/local/lib/node_modules/@openai/codex/vendor/codex', 250), ...browser(),
    ];
    const { sock, server } = await makeServer({ heaviest: () => holding('w-big', 3400, loop), agentPids: () => [worker] });
    expect(await ask(sock, 'c1', 'git status')).toBe('');
    expect(server.status().counts.askedBack).toBe(0);
    // The same pid as the thread's worker is asked.
    worker = process.pid;
    expect(reason(await ask(sock, 'c2', 'git status'))).toContain('pid 300:');
  });

  it('asks nothing when what the listing named has since ended, and does not count that as its one ask', async () => {
    let up = false;
    const { sock, server } = await makeServer({ heaviest: () => holding('w-big'), running: () => up });
    expect(await ask(sock, 'c1', 'git status')).toBe('');
    expect(server.status().counts.askedBack).toBe(0);
    up = true;
    expect(await ask(sock, 'c2', 'git status')).not.toBe('');
  });

  it('checks the real process list unless told otherwise: a pid nobody has is not running', async () => {
    const dir = fs.mkdtempSync(path.join('/tmp', 'gate-real-'));
    dirs.push(dir);
    const server = new MemoryGateServer({
      socketPath: path.join(dir, 'g.sock'), history: new CommandHistory(), heaviest: () => holding('w-big', 3400, [proc(2 ** 30, 1, '/repo/server', 900)]) as never,
      readPressure: async () => ({ level: 1, freePct: 60, swapInMbps: 0 }), sampleProcesses: async () => [], pollMs: 30, idlePollMs: 30, takeoverMs: 50, lockPort: 0,
    });
    servers.push(server);
    await server.start();
    expect(server.running(2 ** 30)).toBe(false);
    expect(server.running(process.pid)).toBe(true);
    expect(await ask(path.join(dir, 'g.sock'), 'c1', 'git status')).toBe('');
  });

  it('once: the same command run again goes through, and so does its next', async () => {
    const { sock } = await makeServer({ heaviest: () => holding('w-big') });
    await ask(sock, 'c1', 'git status');
    expect(await ask(sock, 'c2', 'git status')).toBe('');
    expect(await ask(sock, 'c3', 'git status')).toBe('');
  });

  it('asks no other thread, and nobody while no thread is named', async () => {
    const { sock } = await makeServer({ heaviest: () => holding('w-big') });
    expect(await ask(sock, 'c1', 'git status', 'w-other')).toBe('');
    const none = await makeServer({ heaviest: () => null });
    expect(await ask(none.sock, 'c1', 'git status')).toBe('');
  });

  it('never an urgent thread, whose commands run whatever memory says', async () => {
    const { sock } = await makeServer({ heaviest: () => holding('w-big'), urgent: (item) => item === 'w-big' });
    expect(await ask(sock, 'c1', 'git status')).toBe('');
  });

  it('a question that throws lets the command run', async () => {
    const { sock } = await makeServer({ heaviest: () => { throw new Error('mid-write'); } });
    expect(await ask(sock, 'c1', 'git status')).toBe('');
  });

  it('asks again after fifteen minutes only if the thread holds more', async () => {
    let now = Date.now();
    let mb = 3400;
    const { sock } = await makeServer({ heaviest: () => ({ ...holding('w-big', mb), at: now }), clock: () => now });
    expect(await ask(sock, 'c1', 'git status')).not.toBe('');
    now += ASK_AGAIN_MS;
    expect(await ask(sock, 'c2', 'git status')).toBe('');
    mb = 4800;
    expect(reason(await ask(sock, 'c3', 'git status'))).toContain('4.7 GB');
    now += ASK_AGAIN_MS - 1;
    mb = 6000;
    expect(await ask(sock, 'c4', 'git status')).toBe('');
  });

  it('never holds the command that gives the memory back: kill is the shell\'s own and starts nothing', async () => {
    // A command never seen before waits while memory is tight, and a kill of these pids has never been seen.
    expect(new CommandHistory().classify('kill 39150 39366')).toBe('light');
    expect(new CommandHistory().classify('kill -9 39150')).toBe('light');
    expect(new CommandHistory().classify('kill 39150 && some-new-tool build')).toBe('unknown');
    const dir = fs.mkdtempSync(path.join('/tmp', 'gate-kill-'));
    dirs.push(dir);
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 900, durationMs: 60_000 });
    const server = new MemoryGateServer({
      socketPath: path.join(dir, 'g.sock'), history, overAllowance: () => true,
      readPressure: async () => ({ level: 1, freePct: 60, swapInMbps: 0 }), sampleProcesses: async () => [], pollMs: 30, idlePollMs: 30, takeoverMs: 50, lockPort: 0,
    });
    servers.push(server);
    await server.start();
    await wait(80);
    let heavyAnswered = false;
    void ask(path.join(dir, 'g.sock'), 'h1', 'npm test').then(() => { heavyAnswered = true; });
    expect(await ask(path.join(dir, 'g.sock'), 'k1', 'kill 39150 39366')).toBe('');
    await wait(100);
    expect(heavyAnswered).toBe(false);
  });

  it('writes the ask down apart from a refusal, so the log still says how many were turned away', async () => {
    const { sock, grants } = await makeServer({ heaviest: () => holding('w-big') });
    await ask(sock, 'c1', 'npm test');
    await wait(20);
    expect(grants()).toEqual([expect.objectContaining({ askedBack: true, cmd: 'npm test', cls: 'heavy' })]);
    expect(grants()[0].refused).toBeUndefined();
    const read = summariseGrants(grants());
    expect(read.askedBack).toBe(1);
    expect(read.refusals.total).toBe(0);
    // It neither held a slot nor ran, so it is no evidence about either.
    expect(read.peaks.neverMeasured).toBe(0);
  });
});

describe('the fleet', () => {
  let dir: string;
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function setup() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'give-back-fleet-'));
    const sup = new Supervisor({ home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'], memoryGate: true }, { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {} }, dir);
    sup._memoryLog = { overAllowance: () => true, heaviest: () => ({ item: 'w-big', mb: 3400, programs: [], at: Date.now() }) };
    return sup;
  }

  it('hands the gate the thread the minute log names', () => {
    const sup = setup();
    expect(sup._heaviestOver()).toMatchObject({ item: 'w-big', mb: 3400 });
    const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/heaviest: \(\) => this\._heaviestOver\(\)/);
    expect(src).toMatch(/agentPids: \(item\) => this\._workerPids\(item\)/);
  });

  it('and the pids of the workers it started for a thread, so none is ever named', () => {
    const sup = setup();
    sup.sessions.set('a', { itemId: 'w-big', engine: 'claude', product: 'sample', child: { pid: 4101 } });
    sup.sessions.set('b', { itemId: 'w-big', engine: 'claude', product: 'sample', child: { pid: 4102 } });
    sup.sessions.set('c', { itemId: 'w-other', engine: 'claude', product: 'sample', child: { pid: 4103 } });
    // A run whose worker has not said its pid yet.
    sup.sessions.set('d', { itemId: 'w-big', engine: 'claude', product: 'sample', child: {} });
    expect(sup._workerPids('w-big')).toEqual([4101, 4102]);
    expect(sup._workerPids('w-none')).toEqual([]);
  });

  it('names nobody with the memory check switched off', () => {
    const sup = setup();
    sup.config.memoryGate = false;
    expect(sup._heaviestOver()).toBe(null);
  });
});
