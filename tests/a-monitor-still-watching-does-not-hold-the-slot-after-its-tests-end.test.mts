// A MONITOR STILL WATCHING DOES NOT HOLD THE SLOT AFTER ITS TESTS END — w-428224e9f3.
//
// What broke: on a Linux machine with one heavy slot and memory normal, a
// worker started 18 test batches as a background Bash command, then a Claude
// Code Monitor (`tail -f summary.txt | grep`) to follow them. After ALL DONE
// its next command waited over a minute, until "Hold heavy work" was switched
// off and on.
//
// Measured: Claude Code 2.1.330 sends a Monitor's command through the Bash
// PreToolUse hook under its own tool_use_id, with the same payload as an
// ordinary call, and never sends PostToolUse or PostToolUseFailure for it
// (a hook logging every event, `claude -p` asked to start one Monitor). So the
// Monitor's grant is never reported back. The gate measured it as every process
// that started under the agent after it, and that included each later batch's
// vitest workers, under the background shell that started before the Monitor
// did. Its peak read heavy, and the `tail -f`, still alive, kept it from ever
// reading empty. The grant log shows it: a read asked 4 s after the Monitor
// waited 6.06 s, the never-seen window, and the command after ALL DONE has no
// line, because the switch let it through.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGateServer } from '../main/memory-gate-server.mts';
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
const hookChain = (at: number): Proc[] => [
  { pid: at, ppid: CLAUDE.pid, mb: 1, args: `/bin/sh -c '/app/scripts/memory-gate-hook.sh' pre` },
  { pid: at + 1, ppid: at, mb: 1, args: '/bin/sh /app/scripts/memory-gate-hook.sh pre' },
  { pid: at + 2, ppid: at + 1, mb: 5, args: 'curl -s -f --unix-socket /tmp/agentbox-memory-gate.sock --max-time 1700 http://agentbox/pre' },
];

const BATCHES = 'bash scripts/scratch/run-batches.sh affected.txt evidence 50 2';
const WATCH = 'cd /w && touch evidence/summary.txt 2>/dev/null; tail -n +1 -f evidence/summary.txt | grep --line-buffered -E "exit=|PAUSED|ALL DONE"';
const RERUN = 'cd /w && T=$(mktemp -d) && TMPDIR=$T npx vitest run --maxWorkers=2 tests/a.test.mts tests/b.test.mts; rm -rf $T';
const READ = 'cd /w/evidence && cat summary.txt | grep exit= | awk \'{print $2}\'; grep -E "^ FAIL" batches/log-17.txt';

// The background shell the batches run in. It starts before the Monitor asks.
const batchShell = (startedAt: number): Proc => ({ pid: 400, ppid: CLAUDE.pid, mb: 4, args: `/bin/bash -c ${BATCHES}`, startedAt });
// One batch's vitest, started after the Monitor, under that older shell.
const batch = (n: number): Proc[] => [
  { pid: 410 + n * 3, ppid: 400, mb: 120, args: 'npm exec vitest run' },
  { pid: 411 + n * 3, ppid: 410 + n * 3, mb: 650, args: 'node vitest/dist/workers/forks.js' },
  { pid: 412 + n * 3, ppid: 410 + n * 3, mb: 600, args: 'node vitest/dist/workers/forks.js' },
];
// The Monitor's own shell, as Claude Code starts it: alive until it expires.
const watching: Proc[] = [
  { pid: 500, ppid: CLAUDE.pid, mb: 4, args: `/bin/bash -c ${WATCH}` },
  { pid: 501, ppid: 500, mb: 2, args: 'tail -n +1 -f evidence/summary.txt' },
  { pid: 502, ppid: 500, mb: 3, args: 'grep --line-buffered -E exit=|PAUSED|ALL DONE' },
];

function harness({ history = new CommandHistory(), slots = 1 }: { history?: CommandHistory; slots?: number } = {}) {
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-monitor-'));
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
  const ask = (id: string, command: string, ppid: number, background = false) => {
    const res = { end: (body?: string) => { answers.set(id, body); }, on: () => {} };
    server._pre({ ppid, score: 5, item: 'w-1', hook: { tool_use_id: id, tool_input: { command, run_in_background: background } } }, {} as never, res as never);
  };
  const report = (id: string, ms: number) => server._post({ hook: { tool_use_id: id, duration_ms: ms } });
  const running = () => server.status().running.map((r) => r.id).sort();
  const waiting = () => server.status().waiting.map((w) => w.id);
  const pollFor = async (ms: number) => {
    for (let t = 0; t < ms; t += 2_000) { now += 2_000; await server._poll(); }
  };
  return { server, ask, report, answers, running, waiting, setProcs, pollFor, setFree: (pct: number) => { freePct = pct; } };
}

// The batches go to the background, and their launch is reported at once.
// The Monitor asks next, and the batches then run beside it.
async function batchesUnderAMonitor(h: ReturnType<typeof harness>) {
  const shellStarted = Date.now() - 20_000;
  h.setProcs([CLAUDE, MCP, ...hookChain(300)]);
  h.ask('batches', BATCHES, 300, true);
  expect(h.answers.get('batches')).toBe('');
  h.setProcs([CLAUDE, MCP, batchShell(shellStarted), ...batch(1).map((p) => ({ ...p, startedAt: shellStarted }))]);
  h.report('batches', 609);
  h.setProcs([CLAUDE, MCP, batchShell(shellStarted), ...hookChain(310)]);
  h.ask('watch', WATCH, 310);
  expect(h.answers.get('watch')).toBe('');
  for (let n = 2; n <= 4; n++) {
    h.setProcs([CLAUDE, MCP, batchShell(shellStarted), ...batch(n), ...watching]);
    await h.pollFor(20_000);
  }
  return shellStarted;
}

describe('a Monitor still watching after its tests end', () => {
  it('the command after ALL DONE runs, and so does the read after it, with the check on (the reported case)', async () => {
    const h = harness();
    await batchesUnderAMonitor(h);
    // ALL DONE: the batches and their shell are gone, the Monitor still tails.
    h.setProcs([CLAUDE, MCP, ...watching, ...hookChain(320)]);
    h.ask('rerun', RERUN, 320);
    await h.pollFor(4_000);
    expect(h.waiting()).toEqual([]);
    expect(h.answers.get('rerun')).toBe('');
    // The re-run measures heavy beside the Monitor, then reports.
    h.setProcs([CLAUDE, MCP, ...watching,
      { pid: 600, ppid: CLAUDE.pid, mb: 4, args: `/bin/bash -c ${RERUN}` },
      { pid: 601, ppid: 600, mb: 900, args: 'node vitest/dist/workers/forks.js' }]);
    await h.pollFor(6_000);
    h.report('rerun', 6_000);
    h.setProcs([CLAUDE, MCP, ...watching, ...hookChain(330)]);
    h.ask('read', READ, 330);
    await h.pollFor(4_000);
    expect(h.waiting()).toEqual([]);
    expect(h.answers.get('read')).toBe('');
  });

  it('a test run still going keeps the slot with the Monitor beside it, and gives it up when it reports', async () => {
    const h = harness();
    await batchesUnderAMonitor(h);
    h.setProcs([CLAUDE, MCP, ...watching, ...hookChain(320)]);
    h.ask('rerun', RERUN, 320);
    await h.pollFor(2_000);
    const rerun: Proc[] = [
      { pid: 600, ppid: CLAUDE.pid, mb: 4, args: `/bin/bash -c ${RERUN}` },
      { pid: 601, ppid: 600, mb: 900, args: 'node vitest/dist/workers/forks.js' }];
    h.setProcs([CLAUDE, MCP, ...watching, ...rerun]);
    await h.pollFor(4_000);
    h.setProcs([CLAUDE, MCP, ...watching, ...rerun, ...hookChain(330)]);
    h.ask('read', READ, 330);
    await h.pollFor(5 * 60_000);
    expect(h.waiting()).toEqual(['read']);
    h.report('rerun', 300_000);
    h.setProcs([CLAUDE, MCP, ...watching, ...hookChain(330)]);
    await h.pollFor(2_000);
    expect(h.answers.get('read')).toBe('');
  });

  it('a Monitor that is itself running a heavy command keeps the slot', async () => {
    const h = harness();
    h.setProcs([CLAUDE, MCP, ...hookChain(310)]);
    h.ask('watch', 'npm test 2>&1 | grep --line-buffered FAIL', 310);
    h.setProcs([CLAUDE, MCP,
      { pid: 500, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test 2>&1 | grep --line-buffered FAIL' },
      { pid: 501, ppid: 500, mb: 900, args: 'node vitest' }, ...hookChain(320)]);
    h.ask('read', READ, 320);
    await h.pollFor(10 * 60_000);
    expect(h.running()).toEqual(['watch']);
    expect(h.waiting()).toEqual(['read']);
  });

  it('a heavy command keeps its slot after a quick command measured beside it reports', async () => {
    const h = harness({ slots: 2 });
    h.setProcs([CLAUDE, MCP, ...hookChain(310)]);
    h.ask('test', 'npm test', 310);
    const test: Proc[] = [
      { pid: 500, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test' },
      { pid: 501, ppid: 500, mb: 900, args: 'node vitest' }];
    h.setProcs([CLAUDE, MCP, ...test]);
    await h.pollFor(20_000);
    h.setProcs([CLAUDE, MCP, ...test, ...hookChain(320)]);
    h.ask('quick', READ, 320);
    h.setProcs([CLAUDE, MCP, ...test, { pid: 520, ppid: CLAUDE.pid, mb: 3, args: `/bin/bash -c ${READ}` }]);
    await h.pollFor(2_000);
    h.report('quick', 900);
    h.setProcs([CLAUDE, MCP, ...test]);
    await h.pollFor(5 * 60_000);
    expect(h.server.status().running).toMatchObject([{ id: 'test', holdsSlot: true }]);
  });

  it('a long test that peaked on its own keeps its slot when it runs low and a quick command beside it reports', async () => {
    const h = harness({ slots: 2 });
    h.setProcs([CLAUDE, MCP, ...hookChain(310)]);
    h.ask('test', 'npm test', 310);
    const shell: Proc = { pid: 500, ppid: CLAUDE.pid, mb: 4, args: '/bin/bash -c npm test' };
    h.setProcs([CLAUDE, MCP, shell, { pid: 501, ppid: 500, mb: 900, args: 'node vitest' }]);
    await h.pollFor(20_000);
    const low: Proc[] = [shell, { pid: 501, ppid: 500, mb: 50, args: 'node vitest' }];
    h.setProcs([CLAUDE, MCP, ...low, ...hookChain(320)]);
    h.ask('quick', READ, 320);
    h.setProcs([CLAUDE, MCP, ...low, { pid: 520, ppid: CLAUDE.pid, mb: 3, args: `/bin/bash -c ${READ}` }]);
    await h.pollFor(2_000);
    h.report('quick', 900);
    h.setProcs([CLAUDE, MCP, ...low]);
    await h.pollFor(5 * 60_000);
    expect(h.server.status().running).toMatchObject([{ id: 'test', holdsSlot: true }]);
  });

  it('with memory short, the slot it gives back starts nothing heavy until memory returns', async () => {
    const h = harness();
    await batchesUnderAMonitor(h);
    h.setFree(8);
    await h.pollFor(2_000);
    h.setProcs([CLAUDE, MCP, ...watching, ...hookChain(320)]);
    h.ask('rerun', RERUN, 320);
    await h.pollFor(60_000);
    expect(h.waiting()).toEqual(['rerun']);
    h.setFree(50);
    await h.pollFor(2_000);
    expect(h.answers.get('rerun')).toBe('');
  });

  it('a program the agent started before the command was allowed is not the command\'s, nor is what it starts later', async () => {
    const h = harness();
    h.setProcs([CLAUDE, MCP, ...hookChain(310)]);
    h.ask('watch', WATCH, 310);
    h.setProcs([CLAUDE, MCP, ...watching, { pid: 700, ppid: MCP.pid, mb: 800, args: 'chromium --headless' }]);
    await h.pollFor(20_000);
    expect(h.server.status().running.find((r) => r.id === 'watch')?.peakMb).toBe(9);
  });

  it('under Codex, whose process tree was never measured, a program under an older child still counts', async () => {
    const h = harness();
    const CODEX: Proc = { pid: 200, ppid: 1, mb: 300, args: '/usr/local/bin/codex app-server', startedAt: HOUR_AGO };
    const HELPER: Proc = { pid: 201, ppid: 200, mb: 40, args: 'codex-code-mode', startedAt: HOUR_AGO };
    h.setProcs([CODEX, HELPER]);
    h.ask('test', 'npm test', CODEX.pid);
    h.setProcs([CODEX, HELPER, { pid: 210, ppid: HELPER.pid, mb: 900, args: 'node vitest' }]);
    await h.pollFor(20_000);
    expect(h.server.status().running).toMatchObject([{ id: 'test', peakMb: 900, holdsSlot: true }]);
  });
});
