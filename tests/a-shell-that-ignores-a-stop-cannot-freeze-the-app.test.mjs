// A SHELL THAT IGNORES A STOP CANNOT FREEZE THE APP.
//
// What broke (2026-10-16, 5:43pm): the app hung for 180 s and only a force quit
// closed it. The system's hang report showed the main thread inside a
// synchronous spawn, waiting on /bin/zsh: the login shell the app asks where
// Claude Code is (main/engine-bin.mjs) before starting an agent, at most once
// every 30 s. The shell ran past its 4 s limit, so Node sent it SIGTERM; zsh's
// handler ran an exit hook from the shell's own setup, which waited on a job
// that never ended, and a synchronous spawn waits for the child to EXIT, not
// for the signal to be sent. So the app waited with it.
//
// Now a shell that runs out of time is killed outright (SIGKILL), which no
// hook can delay. Measured below with a real shell that traps SIGTERM.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellRunner } from '../main/engine-bin.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

// A "shell" that ignores SIGTERM and never answers, the way hers behaved.
function stubbornShell() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stubborn-shell-'));
  dirs.push(dir);
  const file = path.join(dir, 'sh');
  fs.writeFileSync(file, '#!/bin/sh\ntrap "" TERM\nwhile :; do sleep 0.1; done\n');
  fs.chmodSync(file, 0o755);
  return file;
}

describe('a login shell that runs out of time', () => {
  it('is stopped for good, and the app gets its turn back', () => {
    const shell = stubbornShell();
    const started = Date.now();
    let error = null;
    try { shellRunner()(shell, ['-c', 'command -v claude'], 300); } catch (e) { error = e; }
    const took = Date.now() - started;
    expect(error).toBeTruthy();
    expect(error.signal).toBe('SIGKILL');
    expect(took).toBeLessThan(3000);
  });

  it('a shell that answers in time still answers', () => {
    expect(shellRunner()('/bin/sh', ['-c', 'echo /usr/local/bin/claude'], 3000).trim()).toBe('/usr/local/bin/claude');
  });

  it('the shell asked for the PATH at start is stopped the same way', () => {
    const src = fs.readFileSync(new URL('../main/shell-path.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/killSignal: 'SIGKILL'/);
  });
});
