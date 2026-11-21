// THE IDLE APP STARTED CLAUDE CODE EVERY FEW SECONDS TO LOOK FOR AGENTS.
//
// Every snapshot the window asks for (every 10 s, and on every change) reads
// the Claude Code sessions running outside the app: one `ps` and one
// `claude agents --json`, which is a whole Claude Code launch. Measured on a
// fresh home with nothing running, under strace for ten minutes: the app
// started `claude agents --json` 12 times in the first six minutes, and the
// programs it started and threw away cost 2.1% of a core on top of the app's
// own 1.7%. One launch took 0.17 s of CPU and 130 MB on that machine; the Mac
// this was written on measured 215 ms in August.
//
// No session can be named without a Claude Code process in `ps` (both sources
// go through `stillTheSame`), so with none there is nothing to ask. With some,
// the CLI is asked again when that set of processes changes, when the last
// answer is a minute old, or when a reply needs a fresh one.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const calls = { ps: 0, claude: 0 };
let psOut = '';
let cliOut = '[]';

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const answer = (file: string): Promise<{ stdout: string; stderr: string }> => {
    if (file === '/bin/ps') { calls.ps += 1; return Promise.resolve({ stdout: psOut, stderr: '' }); }
    calls.claude += 1;
    return Promise.resolve({ stdout: cliOut, stderr: '' });
  };
  const execFile = Object.assign(
    (file: string, _args: string[], _opts: unknown, cb?: (e: Error | null, out?: string) => void) => {
      answer(file).then((r) => cb?.(null, r.stdout), (e) => cb?.(e));
    },
    { [promisify.custom]: (file: string) => answer(file) },
  );
  return { ...real, default: { ...real, execFile }, execFile };
});

const STARTED = 'Sun Nov 15 10:00:00 2026';
const row = (pid: number, command: string) => `${pid} 1 ${STARTED} ${command}`;
const SHELL = row(100, '/bin/zsh -l');
const TERMINAL = 4242;
const HEADLESS = 5151;
const CLAUDE = (pid: number) => row(pid, '/Users/x/.local/bin/claude --resume');

let home: string;
let realHome: string | undefined;
let now: number;
const opts = { claudeBin: '/fake/claude' };

beforeEach(() => {
  realHome = process.env.HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-idle-'));
  process.env.HOME = home;
  fs.mkdirSync(path.join(home, '.claude', 'sessions'), { recursive: true });
  calls.ps = 0;
  calls.claude = 0;
  psOut = '';
  cliOut = '[]';
  now = Date.UTC(2026, 10, 21, 12);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.HOME = realHome;
  fs.rmSync(home, { recursive: true, force: true });
});

const load = () => import('../main/agents.mts');
const stateFile = (pid: number, rec: object) => fs.writeFileSync(path.join(home, '.claude', 'sessions', `${pid}.json`), JSON.stringify({ pid, cwd: '/tmp', ...rec }));
const pids = (list: { pid: number }[]) => list.map((a) => a.pid).sort();

describe('looking for agents outside the app', () => {
  it('does not start Claude Code when no Claude Code process is running', async () => {
    const agents = await load();
    psOut = `${SHELL}\n${row(101, '/usr/bin/git status')}\n`;
    expect(await agents.refresh(opts)).toEqual([]);
    now += 60_000;
    expect(await agents.refresh(opts)).toEqual([]);
    expect(calls).toEqual({ ps: 2, claude: 0 });
  });

  it('asks once while the same Claude Code processes run, and still lists what it said', async () => {
    const agents = await load();
    psOut = `${SHELL}\n${CLAUDE(HEADLESS)}\n`;
    cliOut = JSON.stringify([{ pid: HEADLESS, cwd: '/tmp', name: 'only the CLI sees me', status: 'busy' }]);
    expect(pids(await agents.refresh(opts))).toEqual([HEADLESS]);
    now += 10_000;
    expect(pids(await agents.refresh(opts))).toEqual([HEADLESS]);
    now += 10_000;
    expect(pids(await agents.refresh(opts))).toEqual([HEADLESS]);
    expect(calls.claude).toBe(1);
    expect(calls.ps).toBe(3);
  });

  it('asks again when a Claude Code process starts or ends', async () => {
    const agents = await load();
    psOut = `${CLAUDE(HEADLESS)}\n`;
    cliOut = JSON.stringify([{ pid: HEADLESS, cwd: '/tmp' }]);
    await agents.refresh(opts);
    psOut = `${CLAUDE(HEADLESS)}\n${CLAUDE(TERMINAL)}\n`;
    cliOut = JSON.stringify([{ pid: HEADLESS, cwd: '/tmp' }, { pid: TERMINAL, cwd: '/tmp' }]);
    now += 5_000;
    expect(pids(await agents.refresh(opts))).toEqual([TERMINAL, HEADLESS]);
    expect(calls.claude).toBe(2);
    psOut = `${CLAUDE(TERMINAL)}\n`;
    cliOut = JSON.stringify([{ pid: TERMINAL, cwd: '/tmp' }]);
    now += 5_000;
    expect(pids(await agents.refresh(opts))).toEqual([TERMINAL]);
    expect(calls.claude).toBe(3);
  });

  it('counts a pid reused by a new Claude Code as a change', async () => {
    const agents = await load();
    psOut = `${CLAUDE(HEADLESS)}\n`;
    await agents.refresh(opts);
    psOut = `${HEADLESS} 1 Sun Nov 15 11:00:00 2026 /Users/x/.local/bin/claude -p\n`;
    now += 5_000;
    await agents.refresh(opts);
    expect(calls.claude).toBe(2);
  });

  it('asks again once the last answer is a minute old, and not a moment sooner', async () => {
    const agents = await load();
    psOut = `${CLAUDE(HEADLESS)}\n`;
    await agents.refresh(opts);
    now += 59_999;
    await agents.refresh(opts);
    expect(calls.claude).toBe(1);
    now += 1;
    await agents.refresh(opts);
    expect(calls.claude).toBe(2);
  });

  it('reads the state files fresh while the CLI answer is kept', async () => {
    const agents = await load();
    psOut = `${CLAUDE(TERMINAL)}\n${CLAUDE(HEADLESS)}\n`;
    cliOut = JSON.stringify([{ pid: HEADLESS, cwd: '/tmp', status: 'busy' }]);
    stateFile(TERMINAL, { status: 'busy', statusUpdatedAt: 1 });
    await agents.refresh(opts);
    stateFile(TERMINAL, { status: 'idle', statusUpdatedAt: 2 });
    now += 10_000;
    const read = await agents.refresh(opts);
    expect(read.find((a) => a.pid === TERMINAL)?.status).toBe('idle');
    expect(read.find((a) => a.pid === HEADLESS)?.status).toBe('busy');
    expect(calls.claude).toBe(1);
  });

  it('asks afresh for a reply, so the reply sees the session as it is now', async () => {
    const agents = await load();
    psOut = `${CLAUDE(HEADLESS)}\n`;
    cliOut = JSON.stringify([{ pid: HEADLESS, cwd: '/tmp', waitingFor: null }]);
    await agents.refresh(opts);
    cliOut = JSON.stringify([{ pid: HEADLESS, cwd: '/tmp', waitingFor: 'permission prompt' }]);
    now += 5_000;
    const sent = await agents.reply(HEADLESS, 'hello');
    expect(calls.claude).toBe(2);
    expect(sent.ok).toBe(false);
    expect(sent.reason).toMatch(/permission/);
  });
});
