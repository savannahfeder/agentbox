// A PS CUT OFF UNDER LOAD KEEPS THE LAST AGENTS READING.
//
// The 2026-11-15 desktop test day ran with the Mac's load average at 170 to
// 370. Both test copies logged `/bin/ps` failing about 200 times between them,
// each with no stderr: the deadline killing it. `processTable()` in
// main/agents.mts caught that and handed back an empty table, so every Claude
// Code session failed `stillTheSame` and the reading came back as "no agents".
// The list emptied, pushed a fresh screen, then filled again on the next
// reading, and a reply in between was told "That agent is no longer running".
// `refresh` already meant to keep the last good reading when ps fails; the
// empty table never reached that branch. Measured before the fix: the second
// reading below returned [] instead of the one live agent.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Answer = { stdout: string } | { timedOut: true } | { fails: string };
const answers: Record<string, Answer[]> = { ps: [], claude: [] };

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const answer = (file: string): Promise<{ stdout: string; stderr: string }> => {
    const which = file === '/bin/ps' ? 'ps' : 'claude';
    const next = answers[which].shift() ?? { fails: 'no answer queued' };
    if ('stdout' in next) return Promise.resolve({ stdout: next.stdout, stderr: '' });
    const err = Object.assign(new Error(`Command failed: ${file}`), 'timedOut' in next
      ? { killed: true, signal: 'SIGTERM', code: null }
      : { killed: false, signal: null, code: 1, message: next.fails });
    return Promise.reject(err);
  };
  const execFile = Object.assign(
    (file: string, _args: string[], _opts: unknown, cb?: (e: Error | null, out?: string) => void) => {
      answer(file).then((r) => cb?.(null, r.stdout), (e) => cb?.(e));
    },
    { [promisify.custom]: (file: string) => answer(file) },
  );
  return { ...real, default: { ...real, execFile }, execFile };
});

const PID = 424242;
const psLine = (pid: number) => `${pid} 1 Sun Nov 15 10:00:00 2026 /Users/x/.local/bin/claude --resume\n`;

let home: string;
let realHome: string | undefined;

beforeEach(() => {
  realHome = process.env.HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-load-'));
  process.env.HOME = home;
  fs.mkdirSync(path.join(home, '.claude', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'sessions', `${PID}.json`), JSON.stringify({ pid: PID, cwd: '/tmp', name: 'busy one' }));
  answers.ps = [];
  answers.claude = [];
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = realHome;
  fs.rmSync(home, { recursive: true, force: true });
});

const load = () => import('../main/agents.mts');

describe('the agents reading under load', () => {
  it('keeps the agent when ps is cut off at its deadline', async () => {
    const agents = await load();
    answers.ps.push({ stdout: psLine(PID) }, { timedOut: true });
    expect((await agents.refresh({})).map((a) => a.pid)).toEqual([PID]);
    expect((await agents.refresh({})).map((a) => a.pid)).toEqual([PID]);
  });

  it('keeps the agent when ps fails outright', async () => {
    const agents = await load();
    answers.ps.push({ stdout: psLine(PID) }, { fails: 'ps: fork failed' });
    await agents.refresh({});
    expect((await agents.refresh({})).map((a) => a.pid)).toEqual([PID]);
  });

  it('still drops an agent ps answered without', async () => {
    const agents = await load();
    answers.ps.push({ stdout: psLine(PID) }, { stdout: psLine(PID + 1) });
    await agents.refresh({});
    expect(await agents.refresh({})).toEqual([]);
  });

  it('keeps the agent when `claude agents --json` is cut off at its deadline', async () => {
    const agents = await load();
    fs.rmSync(path.join(home, '.claude', 'sessions', `${PID}.json`));
    const cli = JSON.stringify([{ pid: PID, cwd: '/tmp', name: 'only the CLI sees me' }]);
    answers.ps.push({ stdout: psLine(PID) }, { stdout: psLine(PID) });
    answers.claude.push({ stdout: cli }, { timedOut: true });
    expect((await agents.refresh({ claudeBin: '/fake/claude' })).map((a) => a.pid)).toEqual([PID]);
    expect((await agents.refresh({ claudeBin: '/fake/claude' })).map((a) => a.pid)).toEqual([PID]);
  });

  it('reads no CLI sessions, and carries on, when `claude agents` is not a command this Claude Code has', async () => {
    const agents = await load();
    answers.ps.push({ stdout: psLine(PID) });
    answers.claude.push({ fails: 'error: unknown command agents' });
    expect((await agents.refresh({ claudeBin: '/fake/claude' })).map((a) => a.pid)).toEqual([PID]);
  });

  it('answers null for the app of an agent while ps is cut off, without throwing', async () => {
    const agents = await load();
    answers.ps.push({ timedOut: true });
    expect(await agents.owningApp(PID)).toBeNull();
  });
});
