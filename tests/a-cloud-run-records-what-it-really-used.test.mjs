// A CLOUD RUN RECORDS WHAT IT REALLY USED, SO THE PLAN LIMITS COME FROM HER
// OWN WORK RATHER THAN A GUESS.
//
// The plans are sold as "+N agent slots" with a monthly agent-hour limit
// behind them (docs/cloud/PLAN.md, "Plans"), and on 2026-10-13 nobody knew
// what an agent-hour costs: somewhere between 6¢ and 17¢ from AWS's price
// list, a range that triples what $40 can include. The founder's answer was
// to run most of her own work in the cloud for a few days and measure. So:
//   - the sandbox measures the whole machine, which is what AWS bills: CPU
//     time from cgroup v2's cpu.stat (else /proc/stat), and memory's high
//     water mark from memory.peak (else sampled memory.current, else
//     /proc/meminfo); a machine with none of them still reports its time;
//   - done.json carries it home, and the proxy appends one line per run to
//     ~/.agentbox/cloud-usage.jsonl on the Mac;
//   - a summary turns those lines into agent-hours and an estimated cost at
//     AgentCore's published rates.
// Measured with a fake /sys/fs/cgroup and /proc, and one real proxy run.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { usageMeter } from '../cloud/sandbox/usage.mjs';
import { appendCloudUsage, readCloudUsage, summarizeCloudUsage, cloudUsagePath, AGENTCORE_RATES } from '../main/cloud/usage.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudusage-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

describe('the sandbox\'s usage meter', () => {
  it('reads CPU time and peak memory from cgroup v2, for the whole machine', () => {
    write('cg/cpu.stat', 'usage_usec 1000000\nuser_usec 800000\n');
    write('cg/memory.current', '500000000\n');
    let t = 1_000_000;
    const meter = usageMeter({ root: path.join(tmp, 'cg'), proc: path.join(tmp, 'noproc'), now: () => t, intervalMs: 0 });
    write('cg/cpu.stat', 'usage_usec 4500000\n');
    write('cg/memory.peak', '2147483648\n');
    t += 90_000;
    expect(meter.stop()).toEqual({ wallSeconds: 90, cpuSeconds: 3.5, peakMemoryBytes: 2147483648, source: 'cgroup' });
  });

  it('falls back to /proc on a machine without cgroup v2', () => {
    // cpu  user nice system idle iowait ... in 1/100 s
    write('proc/stat', 'cpu  100 0 100 5000 0 0 0 0 0 0\ncpu0 1 1 1 1\n');
    write('proc/meminfo', 'MemTotal:       8000000 kB\nMemAvailable:   7000000 kB\n');
    let t = 0;
    const meter = usageMeter({ root: path.join(tmp, 'nocg'), proc: path.join(tmp, 'proc'), now: () => t, intervalMs: 0 });
    write('proc/stat', 'cpu  400 0 200 9000 50 0 0 0 0 0\n');
    write('proc/meminfo', 'MemTotal:       8000000 kB\nMemAvailable:   5000000 kB\n');
    meter.sample();
    write('proc/meminfo', 'MemTotal:       8000000 kB\nMemAvailable:   7500000 kB\n');
    t = 60_000;
    const u = meter.stop();
    expect(u.wallSeconds).toBe(60);
    // (400+200) - (100+100) = 400 jiffies of work = 4 s; idle and iowait are not work.
    expect(u.cpuSeconds).toBe(4);
    // The highest it was seen at: 3,000,000 kB in use.
    expect(u.peakMemoryBytes).toBe(3_000_000 * 1024);
    expect(u.source).toBe('proc');
  });

  it('still reports its time when it can read nothing else', () => {
    let t = 0;
    const meter = usageMeter({ root: path.join(tmp, 'x'), proc: path.join(tmp, 'y'), now: () => t, intervalMs: 0 });
    t = 30_000;
    expect(meter.stop()).toEqual({ wallSeconds: 30, cpuSeconds: null, peakMemoryBytes: null, source: null });
  });
});

describe('the record on the Mac', () => {
  it('keeps one line per run beside the cloud setup, and reads them back', () => {
    const home = path.join(tmp, 'home');
    appendCloudUsage({ runId: 'r1', item: 'w-1', engine: 'claude', exitCode: 0, usage: { wallSeconds: 3600, cpuSeconds: 900, peakMemoryBytes: 2 * 1024 ** 3, source: 'cgroup' } }, { home, now: () => Date.parse('2026-10-14T10:00:00Z') });
    appendCloudUsage({ runId: 'r2', item: 'w-2', engine: 'codex', exitCode: 1, usage: null }, { home, now: () => Date.parse('2026-10-14T11:00:00Z') });
    expect(cloudUsagePath({ home })).toBe(path.join(home, '.agentbox', 'cloud-usage.jsonl'));
    const lines = readCloudUsage({ home });
    expect(lines.map((l) => l.runId)).toEqual(['r1', 'r2']);
    expect(lines[0]).toMatchObject({ at: '2026-10-14T10:00:00.000Z', item: 'w-1', engine: 'claude', wallSeconds: 3600, cpuSeconds: 900 });
    // A run that could not measure itself is kept, with nothing invented.
    expect(lines[1]).toMatchObject({ runId: 'r2', wallSeconds: null, cpuSeconds: null, peakMemoryBytes: null });
  });

  it('keeps one line per run however many times its homecoming is tried', () => {
    const home = path.join(tmp, 'home');
    const run = { runId: 'r1', item: 'w-1', engine: 'claude', exitCode: 0, usage: { wallSeconds: 60, cpuSeconds: 1, peakMemoryBytes: 1, source: 'cgroup' } };
    expect(appendCloudUsage(run, { home })).not.toBe(null);
    expect(appendCloudUsage(run, { home })).toBe(null);
    expect(readCloudUsage({ home })).toHaveLength(1);
  });

  it('skips a broken line instead of losing the rest', () => {
    const home = path.join(tmp, 'home');
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    fs.writeFileSync(cloudUsagePath({ home }), '{"runId":"a","wallSeconds":60}\nnot json\n{"runId":"b","wallSeconds":120}\n');
    expect(readCloudUsage({ home }).map((l) => l.runId)).toEqual(['a', 'b']);
    expect(readCloudUsage({ home: path.join(tmp, 'nobody') })).toEqual([]);
  });
});

describe('the summary', () => {
  it('turns runs into agent-hours and a cost at AgentCore\'s published rates', () => {
    const lines = [
      // One hour, 15 CPU-minutes, 2 GB peak.
      { at: '2026-10-14T10:00:00Z', wallSeconds: 3600, cpuSeconds: 900, peakMemoryBytes: 2 * 1024 ** 3 },
      // Half an hour, no measurements: counted in hours, left out of cost.
      { at: '2026-10-14T12:00:00Z', wallSeconds: 1800, cpuSeconds: null, peakMemoryBytes: null },
      // Last month: outside the window.
      { at: '2026-09-30T23:00:00Z', wallSeconds: 3600, cpuSeconds: 3600, peakMemoryBytes: 8 * 1024 ** 3 },
    ];
    const s = summarizeCloudUsage(lines, { since: Date.parse('2026-10-01T00:00:00Z') });
    expect(s.runs).toBe(2);
    expect(s.agentHours).toBe(1.5);
    expect(s.measuredHours).toBe(1);
    const expected = 0.25 * AGENTCORE_RATES.vcpuHour + 2 * 1 * AGENTCORE_RATES.gbHour;
    expect(s.estimatedCost).toBeCloseTo(expected, 6);
    expect(s.costPerAgentHour).toBeCloseTo(expected, 6);
  });

  it('says nothing about cost with nothing measured', () => {
    expect(summarizeCloudUsage([], { since: 0 })).toEqual({ runs: 0, agentHours: 0, measuredHours: 0, estimatedCost: 0, costPerAgentHour: null });
  });
});
