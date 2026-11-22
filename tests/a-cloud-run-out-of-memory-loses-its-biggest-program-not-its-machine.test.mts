// A CLOUD RUN THAT RUNS OUT OF MEMORY LOSES ITS BIGGEST PROGRAM, NOT ITS MACHINE.
//
// From 2026-11-08 to 2026-11-10 one thread rendering Blender scenes lost its
// cloud machine 18 times, 9 minutes to 5 hours into each run, and every time
// the run's commits, files and conversation went with it and the thread
// started over. The runs of that thread that did finish peaked at 7.47 to
// 7.59 GB of the machine's 8 GB (~/.agentbox/cloud-usage.jsonl); the ones that
// died report nothing. A machine that close to its ceiling thrashes until its
// server stops answering, and the server is the machine's first process.
//
// So the server watches free memory while a run goes, and below a floor it
// stops the biggest program the agent started (the renderer, a build), says so
// on the run, and leaves the agent and itself alone. The agent sees its
// command killed and can carry on; the run's work still comes home.
// Measured with a fake /proc and cgroup tree.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { memoryGuard, availableMemory } from '../cloud/sandbox/memory-guard.mjs';

const MB = 2 ** 20;
let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memguard-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (rel: string, text: string) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const meminfo = (availMb: number) => write('proc/meminfo', `MemTotal:       ${8192 * 1024} kB\nMemFree:  100 kB\nMemAvailable:   ${availMb * 1024} kB\n`);
const proc = (pid: number, { name, ppid, uid, rssMb }: { name: string; ppid: number; uid: number; rssMb: number }) =>
  write(`proc/${pid}/status`, `Name:\t${name}\nPPid:\t${ppid}\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nVmRSS:\t${rssMb * 1024} kB\n`);

// The machine as it was: the server (root), the agent CLI it started, the
// agent's shell and renderer, and a root process nobody started for the run.
function machine({ availMb }: { availMb: number }) {
  meminfo(availMb);
  proc(1, { name: 'node', ppid: 0, uid: 0, rssMb: 300 });
  proc(40, { name: 'claude', ppid: 1, uid: 1000, rssMb: 900 });
  proc(41, { name: 'bash', ppid: 40, uid: 1000, rssMb: 5 });
  proc(42, { name: 'blender', ppid: 41, uid: 1000, rssMb: 6200 });
  proc(43, { name: 'python3', ppid: 41, uid: 1000, rssMb: 120 });
  proc(90, { name: 'sshd', ppid: 1, uid: 0, rssMb: 7000 });
  write('proc/self/status', 'Name:\tnode\n');
}

function guard(over: Partial<Parameters<typeof memoryGuard>[0]> = {}) {
  const killed: number[] = [];
  const said: { name: string; pid: number; rssBytes: number; availableBytes: number }[] = [];
  let t = 1_000_000;
  const g = memoryGuard({
    proc: path.join(tmp, 'proc'), cgroup: path.join(tmp, 'nocg'),
    floorBytes: 512 * MB, everyMs: 0, agentPid: 40, ownerUid: 1000, keep: [1],
    kill: (pid: number) => { killed.push(pid); }, onStop: (s) => said.push(s), now: () => t,
    ...over,
  });
  return { g, killed, said, later: (ms: number) => { t += ms; } };
}

describe('the cloud machine\'s memory guard', () => {
  it('stops the agent\'s biggest program when free memory falls under the floor, and says which', () => {
    machine({ availMb: 300 });
    const { g, killed, said } = guard();
    g.check();
    expect(killed).toEqual([42]);
    expect(said).toEqual([{ pid: 42, name: 'blender', rssBytes: 6200 * MB, availableBytes: 300 * MB }]);
  });

  it('does nothing just above the floor, and stops at it', () => {
    machine({ availMb: 513 });
    const above = guard();
    above.g.check();
    expect(above.killed).toEqual([]);
    machine({ availMb: 511 });
    const below = guard();
    below.g.check();
    expect(below.killed).toEqual([42]);
  });

  it('never stops the agent itself, the server, or a program the run did not start', () => {
    machine({ availMb: 100 });
    // Only the agent and programs that are not the run's are left big.
    proc(42, { name: 'blender', ppid: 41, uid: 1000, rssMb: 1 });
    proc(43, { name: 'python3', ppid: 41, uid: 1000, rssMb: 1 });
    const { g, killed } = guard();
    g.check();
    expect(killed).toEqual([41]);
    expect(killed).not.toContain(40);
    expect(killed).not.toContain(1);
    expect(killed).not.toContain(90);
  });

  it('with no owner to go by, takes only what the agent started, however deep', () => {
    machine({ availMb: 100 });
    proc(44, { name: 'node', ppid: 1, uid: 1000, rssMb: 7000 });
    const { g, killed } = guard({ ownerUid: null });
    g.check();
    expect(killed).toEqual([42]);
  });

  it('with an owner, also takes a program the agent left running on its own', () => {
    machine({ availMb: 100 });
    // A background job the agent started with nohup or setsid: its parent is gone.
    proc(44, { name: 'chrome', ppid: 1, uid: 1000, rssMb: 7000 });
    const { g, killed } = guard();
    g.check();
    expect(killed).toEqual([44]);
  });

  it('gives the memory a moment to come back before it stops a second program', () => {
    machine({ availMb: 200 });
    const { g, killed, later } = guard();
    g.check();
    g.check();
    expect(killed).toEqual([42]);
    later(10_000);
    g.check();
    expect(killed).toEqual([42, 42]);
  });

  it('does nothing on a machine whose memory it cannot read', () => {
    proc(42, { name: 'blender', ppid: 40, uid: 1000, rssMb: 6200 });
    const { g, killed } = guard();
    g.check();
    expect(killed).toEqual([]);
  });

  it('reads a container\'s own limit when it has one, counting cache it can drop as free', () => {
    meminfo(6000);
    write('cg/memory.max', String(4096 * MB));
    write('cg/memory.current', String(3900 * MB));
    write('cg/memory.stat', `anon ${3700 * MB}\ninactive_file ${100 * MB}\nactive_file ${100 * MB}\n`);
    // 4096 - (3900 - 100) = 296 MB: the container's own room, not the VM's.
    expect(availableMemory({ proc: path.join(tmp, 'proc'), cgroup: path.join(tmp, 'cg') })).toBe(296 * MB);
    write('cg/memory.max', 'max\n');
    expect(availableMemory({ proc: path.join(tmp, 'proc'), cgroup: path.join(tmp, 'cg') })).toBe(6000 * MB);
  });
});

describe('the sandbox server', () => {
  const server = fs.readFileSync(path.join(import.meta.dirname, '..', 'cloud', 'sandbox', 'server.mjs'), 'utf8');
  const setup = fs.readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'cloud-setup.mjs'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(import.meta.dirname, '..', 'cloud', 'sandbox', 'Dockerfile'), 'utf8');

  it('guards every run on the real machine, and the guard is in the image', () => {
    expect(server).toMatch(/memoryFloorBytes: \d/);
    expect(setup).toMatch(/IMAGE_FILES = \[[^\]]*'memory-guard\.mjs'/);
    expect(dockerfile).toMatch(/COPY [^\n]*memory-guard\.mjs[^\n]*\/opt\/agentbox\//);
  });
});
