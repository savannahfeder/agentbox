// AN INTERRUPTED COMMAND GIVES BACK ITS MEMORY SLOT — w-c32e4c8aa0.
//
// What broke: on a Linux machine with one heavy slot, a worker's foreground
// wait loop was interrupted three times in one morning ("User rejected tool
// use" in its transcript, Claude Code 2.1.325). An interrupted Bash call gets
// neither PostToolUse nor PostToolUseFailure, and none of the three has a line
// in the grant log; ordinary failures (exit 1) do. Each time the next
// read-only command waited until someone switched "Hold heavy work" off and on.
//
// Measured: the backstop for a lost report never ran. Claude Code starts the
// hook as `/bin/sh -c '<hook>' pre`, and dash keeps that launcher as its own
// process, so the hook's parent is a shell that ends with the hook. 153 of 153
// grant lines had no memory reading. With no agent found, a never-measured
// command holds its slot for three hours. And once the agent is found, the
// waiting command's own hook (sh, hook, curl) runs under it, started after the
// lost grant, and counted as that grant's work.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGateServer, readParentPid } from '../main/memory-gate-server.mts';
import type { ProcessSample } from '../main/memory-gate-server.mts';
import { CommandHistory } from '../main/memory-gate-history.mts';

const dirs: string[] = [];
const servers: MemoryGateServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

type Proc = Omit<ProcessSample, 'startedAt'> & { startedAt?: number };

const HOUR_AGO = Date.now() - 3_600_000;
const CLAUDE: Proc = { pid: 100, ppid: 1, mb: 300, args: '/usr/local/bin/claude -p --output-format stream-json', startedAt: HOUR_AGO };
const MCP: Proc = { pid: 101, ppid: 100, mb: 80, args: 'node store-server.mjs', startedAt: HOUR_AGO };
const hookChain = (at: number, mode = 'pre'): Proc[] => [
  { pid: at, ppid: CLAUDE.pid, mb: 1, args: `/bin/sh -c '/app/scripts/memory-gate-hook.sh' ${mode}` },
  { pid: at + 1, ppid: at, mb: 1, args: `/bin/sh /app/scripts/memory-gate-hook.sh ${mode}` },
  { pid: at + 2, ppid: at + 1, mb: 5, args: 'curl -s -f --unix-socket /tmp/agentbox-memory-gate.sock --max-time 1700 http://agentbox/pre' },
];
const LOOP = 'end=$(( $(date +%s) + 570 )); while [ "$(wc -l < ledger.jsonl)" -lt 20 ]; do sleep 20; done';
const DF = 'df -k / | tail -1; wc -l < ledger.jsonl';

function harness({ history = new CommandHistory(), slots = 1, sharedGrantMs }: { history?: CommandHistory; slots?: number; sharedGrantMs?: number } = {}) {
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-interrupted-'));
  dirs.push(dir);
  let procs: ProcessSample[] = [];
  let parents = new Map<number, number>();
  let freePct = 50;
  let now = 0;
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    history,
    readPressure: async () => ({ level: 1, freePct }),
    sampleProcesses: async () => procs,
    parentOf: (pid: number) => parents.get(pid) ?? null,
    pollMs: 60_000,
    idleReleaseMs: 30_000,
    sharedGrantMs,
    clock: () => now,
    gate: { slots },
  });
  servers.push(server);
  // Anything without a start time started just after the moment it appears.
  const setProcs = (list: Proc[]) => {
    procs = list.map((p) => ({ ...p, startedAt: p.startedAt ?? Date.now() + 1_000 }));
    parents = new Map(procs.map((p) => [p.pid, p.ppid]));
  };
  const answers = new Map<string, string | undefined>();
  const ask = (id: string, command: string, ppid: number) => {
    const res = { end: (body?: string) => { answers.set(id, body); }, on: () => {} };
    server._pre({ ppid, score: 5, item: 'w-1', hook: { tool_use_id: id, tool_input: { command } } }, {} as never, res as never);
  };
  const running = () => server.status().running.map((r) => r.id);
  const waiting = () => server.status().waiting.map((w) => w.id);
  const pollFor = async (ms: number) => {
    for (let t = 0; t < ms; t += 2_000) { now += 2_000; await server._poll(); }
  };
  return {
    server, ask, answers, running, waiting, setProcs, pollFor,
    setFree: (pct: number) => { freePct = pct; },
    poll: () => server._poll(),
  };
}

const learnedHeavy = () => {
  const history = new CommandHistory();
  history.record('npm test', { peakMb: 900 });
  return history;
};

// The hook asks from a launcher shell, as on Linux; the command then runs
// under the agent and the launcher is gone before the coordinator's next look.
async function grantTheLoop(h: ReturnType<typeof harness>, command = LOOP) {
  h.setProcs([CLAUDE, MCP, ...hookChain(500)]);
  h.ask('loop', command, 500);
  expect(h.answers.get('loop')).toBe('');
  h.setProcs([CLAUDE, MCP, { pid: 600, ppid: CLAUDE.pid, mb: 4, args: `/bin/bash -c ${command}` }]);
  await h.pollFor(10_000);
}

describe('a command interrupted mid-run, whose "after" report never comes', () => {
  it('a never-seen wait loop is measured, so the check behind it runs, and its grant goes (the reported case)', async () => {
    const h = harness();
    await grantTheLoop(h);
    expect(h.running()).toEqual(['loop']);
    // Interrupted: the loop is gone, no report. A read-only check asks next,
    // its own hook chain alive under the agent while it asks.
    h.setProcs([CLAUDE, MCP, ...hookChain(700)]);
    h.ask('df', DF, 700);
    await h.pollFor(2_000);
    expect(h.answers.get('df')).toBe('');
    h.setProcs([CLAUDE, MCP, { pid: 710, ppid: CLAUDE.pid, mb: 3, args: `/bin/bash -c ${DF}` }]);
    await h.pollFor(2_000);
    h.server._post({ hook: { tool_use_id: 'df', duration_ms: 900 } });
    h.setProcs([CLAUDE, MCP]);
    await h.pollFor(32_000);
    expect(h.running()).toEqual([]);
  });

  it('a heavy command gives its slot to the one waiting behind it once nothing of it runs', async () => {
    const h = harness({ history: learnedHeavy() });
    await grantTheLoop(h, 'npm test');
    h.setProcs([CLAUDE, MCP, ...hookChain(700)]);
    h.ask('df', DF, 700);
    expect(h.waiting()).toEqual(['df']);
    await h.pollFor(28_000);
    expect(h.running()).toEqual(['loop']);
    await h.pollFor(6_000);
    expect(h.running()).toEqual(['df']);
    expect(h.answers.get('df')).toBe('');
  });

  it('the waiting command\'s own hook is not counted as the lost command\'s work, wherever the hook asks from', async () => {
    const h = harness({ history: learnedHeavy() });
    // The hook's parent is the agent itself here.
    h.setProcs([CLAUDE, MCP]);
    await h.poll();
    h.ask('loop', 'npm test', CLAUDE.pid);
    h.setProcs([CLAUDE, MCP, { pid: 600, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test' }]);
    await h.pollFor(10_000);
    h.setProcs([CLAUDE, MCP, ...hookChain(700)]);
    h.ask('df', DF, CLAUDE.pid);
    await h.pollFor(34_000);
    expect(h.running()).toEqual(['df']);
  });

  it('a command still running keeps its slot however long the next one waits', async () => {
    const h = harness({ history: learnedHeavy() });
    await grantTheLoop(h, 'npm test');
    h.setProcs([CLAUDE, MCP,
      { pid: 600, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test' },
      { pid: 601, ppid: 600, mb: 900, args: 'node vitest' },
      ...hookChain(700)]);
    h.ask('df', DF, 700);
    await h.pollFor(10 * 60_000);
    expect(h.running()).toEqual(['loop']);
    expect(h.waiting()).toEqual(['df']);
  });

  it('a running command that only names the hook\'s file, or uses curl, is still its own work', async () => {
    for (const procs of [
      [{ pid: 600, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c cat /app/scripts/memory-gate-hook.sh; npm test' },
        { pid: 601, ppid: 600, mb: 900, args: 'node vitest' }],
      [{ pid: 600, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test' },
        { pid: 601, ppid: 600, mb: 900, args: 'node check.mjs /app/scripts/memory-gate-hook.sh pre' }],
      [{ pid: 600, ppid: CLAUDE.pid, mb: 4, args: '/bin/sh -c /app/scripts/memory-gate-hook.sh pre; npm test' },
        { pid: 601, ppid: 600, mb: 900, args: 'node vitest' }],
      [{ pid: 600, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test' },
        { pid: 601, ppid: 600, mb: 900, args: 'curl -s -o big.tar https://example.test/big.tar' }],
    ]) {
      const h = harness({ history: learnedHeavy() });
      await grantTheLoop(h, 'npm test');
      h.setProcs([CLAUDE, MCP, ...procs, ...hookChain(700)]);
      h.ask('df', DF, 700);
      await h.pollFor(2 * 60_000);
      expect(h.running()).toEqual(['loop']);
      expect(h.waiting()).toEqual(['df']);
    }
  });

  it('a sibling command still running on the same agent keeps it, and it goes once the sibling is done', async () => {
    const h = harness({ slots: 2 });
    await grantTheLoop(h);
    // A second command runs beside it, then the loop is interrupted.
    h.setProcs([CLAUDE, MCP, ...hookChain(510)]);
    h.ask('build', 'npm run build', 510);
    const build: Proc[] = [{ pid: 610, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm run build' }, { pid: 611, ppid: 610, mb: 700, args: 'node vite build' }];
    h.setProcs([CLAUDE, MCP, ...build]);
    await h.pollFor(60_000);
    expect(h.running().sort()).toEqual(['build', 'loop']);
    // The build ends and reports; nothing of either runs now.
    h.server._post({ hook: { tool_use_id: 'build', duration_ms: 70_000 } });
    h.setProcs([CLAUDE, MCP]);
    await h.pollFor(28_000);
    expect(h.running()).toEqual(['loop']);
    await h.pollFor(6_000);
    expect(h.running()).toEqual([]);
  });

  it('a detached child it left behind, alive or a zombie, is not its work', async () => {
    const h = harness({ history: learnedHeavy() });
    await grantTheLoop(h, 'npm test');
    h.setProcs([CLAUDE, MCP,
      { pid: 650, ppid: 1, mb: 500, args: 'node scripts/scratch/gate.mjs' },
      { pid: 651, ppid: 1, mb: 0, args: '[node] <defunct>' },
      { pid: 652, ppid: CLAUDE.pid, mb: 0, args: '[bash] <defunct>' },
      ...hookChain(700)]);
    h.ask('df', DF, 700);
    await h.pollFor(34_000);
    expect(h.running()).toEqual(['df']);
  });

  it('a recorded pid now held by a different program is never taken for its agent', async () => {
    for (const reused of [
      { ...CLAUDE, args: '/usr/bin/python3 other.py' },
      { ...CLAUDE, startedAt: Date.now() + 60_000 },
    ]) {
      const h = harness();
      h.setProcs([CLAUDE, MCP, ...hookChain(500)]);
      h.ask('loop', LOOP, 500);
      // Before the first look, the agent is gone and its pid belongs to another.
      h.setProcs([reused, { pid: 652, ppid: reused.pid, mb: 0, args: '[bash] <defunct>' }]);
      await h.pollFor(60_000);
      // Not measured against a stranger: held, as any grant with no agent is.
      expect(h.running()).toEqual(['loop']);
      expect(h.server.grants.get('loop')?.anchor).toBe(null);
    }
  });

  it('giving the slot back starts nothing heavy while memory is actually short', async () => {
    const h = harness({ history: learnedHeavy() });
    await grantTheLoop(h, 'npm test');
    h.setFree(8);
    h.setProcs([CLAUDE, MCP, ...hookChain(700)]);
    h.ask('df', DF, 700);
    await h.pollFor(34_000);
    expect(h.running()).toEqual([]);
    expect(h.waiting()).toEqual(['df']);
    h.setFree(50);
    await h.pollFor(2_000);
    expect(h.running()).toEqual(['df']);
  });
});

describe('reading a process\'s parent', () => {
  it.skipIf(!fs.existsSync('/proc/self/stat'))('reads this process\'s own parent, and nothing for a pid that is not there', () => {
    expect(readParentPid(process.pid)).toBe(process.ppid);
    expect(readParentPid(2 ** 22 + 7)).toBe(null);
  });
});
