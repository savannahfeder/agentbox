// A TASK FOLDER HELD BY A DEAD APP IS TAKEN BACK (w-f702d60afe, round seven, 2026-11-20).
//
// Testers in rounds three, five and seven hit tasks that never started: "its
// folder is held by pid 116342". That pid, read on the test machine, was
// `[node] <defunct>`: the app that held the folder had exited, and nothing had
// collected its exit, so the kernel kept the pid as a zombie. The folder check
// asks "does the pid exist" (signal 0), which a zombie answers yes, so the
// folder stayed held for as long as the zombie lasted (an hour, measured).
//
// On Linux a zombie says so in /proc/<pid>/stat; a holder in that state is
// gone. A Mac has no /proc and keeps its answer.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { alive } from '../main/process-alive.mts';

const zombie = (): Promise<{ pid: number; stop: () => void }> => new Promise((resolve) => {
  // `sleep 0` exits at once, and the `sleep 5` that replaces the shell never waits for it.
  const p = spawn('sh', ['-c', 'sleep 0 & echo $!; exec sleep 5'], { stdio: ['ignore', 'pipe', 'ignore'] });
  p.stdout.once('data', (d) => setTimeout(() => resolve({ pid: Number(String(d).trim()), stop: () => p.kill('SIGKILL') }), 300));
});

describe.runIf(process.platform === 'linux')('whether a folder\'s holder is alive, on Linux', () => {
  it('a zombie is not', async () => {
    const z = await zombie();
    try { expect(alive(z.pid)).toBe(false); } finally { z.stop(); }
  });
  it('a running process is', () => {
    expect(alive(process.pid)).toBe(true);
  });
});

describe('whether a folder\'s holder is alive, anywhere', () => {
  it('no pid, or a pid that is gone, is not', () => {
    expect(alive(null)).toBe(false);
    expect(alive(2 ** 22 + 12345)).toBe(false);
  });
});
