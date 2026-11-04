// A PHONE TESTER IN A SANDBOX STILL FINDS ITS PHONE (w-e4d49a1539).
//
// The first real Codex workday on 2026-11-02: the workday opened each
// tester's Chrome, then every `phone look` from inside Codex's sandbox said
// "The phone had closed" and failed to start another one. The sandbox forbids
// signalling a process outside it, so `process.kill(pid, 0)` threw EPERM, and
// the phone read that as Chrome being gone. Reproduced with
// `codex sandbox -P :workspace -- phone look`. EPERM means the process exists.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { isRunning } from '../.claude/skills/product-loop/scripts/phone.mjs';

const throwing = (code) => () => { throw Object.assign(new Error(code), { code }); };

describe('whether the phone\'s Chrome is still running', () => {
  it('yes when a sandbox forbids signalling it, as on 2026-11-02', () => {
    expect(isRunning(4242, throwing('EPERM'))).toBe(true);
  });

  it('yes for a process this one may not signal, for real (launchd, pid 1)', () => {
    expect(isRunning(1)).toBe(true);
  });

  it('yes for a process it may signal', () => {
    expect(isRunning(process.pid)).toBe(true);
  });

  it('no when the process is gone', () => {
    const gone = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
    expect(isRunning(Number(gone.stdout.trim()))).toBe(false);
    expect(isRunning(4242, throwing('ESRCH'))).toBe(false);
  });

  it('no when there is no pid to ask about', () => {
    expect(isRunning(undefined)).toBe(false);
    expect(isRunning(0)).toBe(false);
  });
});
