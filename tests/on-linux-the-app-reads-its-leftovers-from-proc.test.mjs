// ON LINUX THE APP COULD NOT LIST ITS LEFTOVER WORKERS, ON EVERY START — w-bd1806285e.
//
// `listProcesses` read the environment with `/bin/ps -E -ww -axo ...`. `-E` is
// BSD only; Linux's procps answers "error: unsupported SysV option" and exits
// 1, so every start of every app copy on the Linux cloud logged "zero:
// leftovers: could not list processes" and no worker left by an earlier run
// was ever found. The power test's watcher (w-811757c0b5) saw it in all four
// copies of both runs.
//
// Linux has the same facts in /proc: the parent and start time in `stat`, the
// resident size in `status`, the environment in `environ` and the real
// executable behind `exe`, which also makes lsof unnecessary for a program
// that renamed itself. The tree these tests read is a fake one, so the shape
// is checked on any machine; the last test reads this machine's own.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLinuxProcesses, listProcesses } from '../main/leftovers.mjs';

const BOOT = 1_791_000_000;
const HZ = 100;

/** A /proc the way Linux writes one: `${pid}/stat`, `status`, `cmdline`, `environ`, `exe`. */
function fakeProc(procs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
  fs.writeFileSync(path.join(root, 'stat'), `cpu  1 2 3\nbtime ${BOOT}\nprocesses 900\n`);
  for (const p of procs) {
    const dir = path.join(root, String(p.pid));
    fs.mkdirSync(dir);
    const ticks = (p.startedAfterBoot ?? 0) * HZ;
    const padding = Array(50).fill('0');
    const fields = [p.state ?? 'S', String(p.ppid), ...padding];
    fields[19] = String(ticks); // field 22 of `stat` counted from the state
    fs.writeFileSync(path.join(dir, 'stat'), `${p.pid} (${p.comm}) ${fields.join(' ')}\n`);
    if (p.rssKb !== null) fs.writeFileSync(path.join(dir, 'status'), `Name:\t${p.comm}\nPPid:\t${p.ppid}\nVmRSS:\t${p.rssKb} kB\nThreads:\t1\n`);
    fs.writeFileSync(path.join(dir, 'cmdline'), p.argv.length ? `${p.argv.join('\0')}\0` : '');
    if (p.env) fs.writeFileSync(path.join(dir, 'environ'), `${p.env.join('\0')}\0`);
    if (p.exe) fs.symlinkSync(p.exe, path.join(dir, 'exe'));
  }
  // Things in /proc that are not processes, which the reader has to step over.
  fs.mkdirSync(path.join(root, 'sys'));
  fs.writeFileSync(path.join(root, 'uptime'), '1000.00 2000.00\n');
  return root;
}

const read = (root) => Object.fromEntries(readLinuxProcesses({ root, hz: HZ }).map((p) => [p.pid, p]));

describe('reading Linux processes', () => {
  const root = fakeProc([
    {
      pid: 30788, ppid: 1, comm: 'node', rssKb: 90_000, startedAfterBoot: 300,
      exe: '/usr/local/bin/node', argv: ['node', 'next', 'dev', '-p', '3011'],
      env: ['PATH=/usr/bin', 'ZERO_PRODUCT=demo', 'ZERO_ITEM=w-aaaa1111', 'HOME=/home/x'],
    },
    {
      pid: 31907, ppid: 30788, comm: 'next-server', rssKb: 700_000, startedAfterBoot: 300,
      exe: '/usr/local/bin/node', argv: ['next-server (v16.3.6)'], env: null,
    },
    {
      pid: 40000, ppid: 1, comm: 'node', rssKb: 10_000, startedAfterBoot: 300,
      exe: '/usr/local/bin/node', argv: ['node', 'tool.mjs', 'ZERO_ITEM=w-fromargv'],
      env: ['PATH=/usr/bin'],
    },
    {
      pid: 50000, ppid: 1, comm: 'node', rssKb: 10_000, startedAfterBoot: 300,
      exe: '/usr/local/bin/node', argv: ['node', 'other.mjs'],
      env: ['NOT_ZERO_ITEM=w-bbbb2222', 'ZERO_ITEMS=w-cccc3333', 'AGENTBOX_KEEP=10'],
    },
    {
      pid: 60000, ppid: 1, comm: 'ffmpeg', rssKb: 20_000, startedAfterBoot: 600,
      exe: '/usr/bin/ffmpeg', argv: ['ffmpeg', '-i', 'in.mov'],
      env: ['ZERO_ITEM=w-dddd4444', 'AGENTBOX_KEEP=1'],
    },
    {
      pid: 2, ppid: 0, comm: 'kthreadd', rssKb: null, startedAfterBoot: 0, exe: null, argv: [], env: null,
    },
  ]);
  const by = read(root);

  it('takes the task id from the environment, never from the command\'s own words', () => {
    expect(by[30788].item).toBe('w-aaaa1111');
    expect(by[30788].product).toBe('demo');
    expect(by[40000].item).toBe(null);
  });

  it('reads nothing from a name that only starts or ends like the tag', () => {
    expect(by[50000].item).toBe(null);
    expect(by[50000].keep).toBe(false);
  });

  it('reads AGENTBOX_KEEP=1, which is what keeps a program running', () => {
    expect(by[60000].keep).toBe(true);
    expect(by[60000].item).toBe('w-dddd4444');
  });

  it('a program that hides its environment carries no tag of its own', () => {
    expect(by[31907].item).toBe(null);
    expect(by[31907].keep).toBe(false);
  });

  it('keeps start time to the second, the parent, memory, and the command', () => {
    expect(by[30788].start).toBe(BOOT + 300);
    expect(by[60000].start).toBe(BOOT + 600);
    expect(by[31907].ppid).toBe(30788);
    expect(Math.round(by[31907].mb)).toBe(684);
    expect(by[30788].cmd).toBe('node next dev -p 3011');
  });

  it('names the real executable behind a program that renamed itself, without lsof', () => {
    expect(by[31907].exe).toBe('/usr/local/bin/node');
  });

  it('keeps a process whose executable and memory it cannot read', () => {
    expect(by[2].exe).toBe('');
    expect(by[2].mb).toBe(0);
    expect(by[2].cmd).toBe('[kthreadd]');
  });

  it('steps over what is in /proc and is not a process', () => {
    expect(Object.keys(by).map(Number).sort((a, b) => a - b)).toEqual([2, 30788, 31907, 40000, 50000, 60000]);
  });
});

describe('a process that ends while the list is being read', () => {
  it('is left out, and the rest of the list still arrives', () => {
    const root = fakeProc([
      { pid: 100, ppid: 1, comm: 'node', rssKb: 1000, startedAfterBoot: 10, exe: '/usr/bin/node', argv: ['node', 'a.mjs'], env: ['ZERO_ITEM=w-aaaa1111'] },
      { pid: 200, ppid: 1, comm: 'node', rssKb: 1000, startedAfterBoot: 10, exe: '/usr/bin/node', argv: ['node', 'b.mjs'], env: ['ZERO_ITEM=w-bbbb2222'] },
    ]);
    fs.rmSync(path.join(root, '200', 'stat'));
    const by = read(root);
    expect(Object.keys(by)).toEqual(['100']);
    expect(by[100].item).toBe('w-aaaa1111');
  });
});

describe('listing this machine\'s processes', () => {
  it('finds this test among them, without an error of any kind', async () => {
    const procs = await listProcesses();
    const me = procs.find((p) => p.pid === process.pid);
    expect(me, 'this process is in the list').toBeTruthy();
    expect(me.ppid).toBe(process.ppid);
    expect(me.start).toBeGreaterThan(0);
    expect(me.start * 1000).toBeLessThanOrEqual(Date.now());
    expect(me.cmd).toMatch(/node/);
  });

  it('on Linux names the executable in full, which `ps comm=` there does not', async () => {
    if (process.platform === 'darwin') return;
    const me = (await listProcesses()).find((p) => p.pid === process.pid);
    expect(me.exe).toBe(fs.realpathSync(process.execPath));
  });
});
