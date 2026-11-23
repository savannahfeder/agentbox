// FINISHED AGENTS SHARE ONE TIDY-UP.
//
// What broke (2026-11-15): with 18 agents running, every one that finished
// started its own full sweep of the project's task folders
// (`releaseWorkFolder` -> `parkClosedFolders`). One sweep on her Mac was 32 s of
// `listTaskFolders` over 50 folders before it parked or released a single one,
// and the sweeps stacked up on the one folder thread faster than they drained.
// New threads waited behind them for minutes ("Making this thread's own copy of
// the project is taking much longer than it should").
//
// So: while a sweep of a project is running, an agent finishing asks for ONE
// more after it, shared with every other agent that finishes meanwhile. Nothing
// is skipped (a folder freed mid-sweep is still looked at by the follow-up), and
// a project's sweep never waits on another project's.
import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

function aFake() {
  let calls = 0;
  const gates: Array<() => void> = [];
  const fake = {
    _sweepSoon: (Supervisor.prototype as any)._sweepSoon,
    productFolder: (p: { repoPath: string }) => p.repoPath,
    parkClosedFolders: () => {
      calls += 1;
      return new Promise<number>((resolve) => { gates.push(() => resolve(1)); });
    },
  };
  const sweep = (product: { repoPath: string }) => fake._sweepSoon(product);
  const openNext = async () => { await new Promise((r) => setImmediate(r)); gates.shift()?.(); await new Promise((r) => setImmediate(r)); };
  return { sweep, openNext, calls: () => calls, waiting: () => gates.length };
}

const repo = { repoPath: '/repo' };

describe('tidying up after agents finish', () => {
  it('runs one sweep and one follow-up when ten agents finish during a sweep', async () => {
    const f = aFake();
    const all = Array.from({ length: 10 }, () => f.sweep(repo));
    expect(f.calls()).toBe(1);
    await f.openNext();
    expect(f.calls()).toBe(2);
    await f.openNext();
    await Promise.all(all);
    expect(f.calls()).toBe(2);
  });

  it('still sweeps for an agent that finishes while a sweep is running', async () => {
    const f = aFake();
    const first = f.sweep(repo);
    const later = f.sweep(repo);
    await f.openNext();
    await first;
    // The follow-up has started, after the first one ended.
    expect(f.calls()).toBe(2);
    await f.openNext();
    await later;
  });

  it('starts a fresh sweep once the last one has finished', async () => {
    const f = aFake();
    const one = f.sweep(repo);
    await f.openNext();
    await one;
    const two = f.sweep(repo);
    expect(f.calls()).toBe(2);
    await f.openNext();
    await two;
  });

  it('does not make one project wait for another project’s sweep', () => {
    const f = aFake();
    f.sweep(repo);
    f.sweep({ repoPath: '/other' });
    expect(f.calls()).toBe(2);
  });

  it('a sweep that fails does not stop the next one', async () => {
    let calls = 0;
    const fake = {
      _sweepSoon: (Supervisor.prototype as any)._sweepSoon,
      productFolder: (p: { repoPath: string }) => p.repoPath,
      parkClosedFolders: () => { calls += 1; return calls === 1 ? Promise.reject(Error('git said no')) : Promise.resolve(0); },
    };
    const sweep = () => fake._sweepSoon(repo);
    await expect(sweep()).rejects.toThrow('git said no');
    await expect(sweep()).resolves.toBe(0);
    expect(calls).toBe(2);
  });
});
