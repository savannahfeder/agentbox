// CONTROL-C ON THE BROWSER COPY DOES NOT FAIL ITS AGENTS.
//
// Found 2026-10-12 by the pre-deploy check's live drive `ctrl-c-mid-run`
// (.claude/skills/verify-agentbox). The browser copy prints "Stop it with
// control-C." Doing that while a Claude task was running left the task reading
// "Claude Code stopped before it did anything, so this task has not been
// started. Agentbox keeps trying, and it will keep failing the same way until
// this is fixed", resting 15 minutes after the copy came back, while a Codex task
// stopped the same way was answered within seconds of the restart.
//
// Why. Control-C reaches the whole process group, so the worker died of the
// signal itself. The desktop app stops its own workers before it quits
// (main/main.mts, `before-quit` -> `supervisor.killAll()`), which marks each
// one as stopped by us, so its death is never charged to the task. The browser
// copy registered no such hook, so every worker it had looked like one that
// failed on its own. Measured on the copy: the worker's log ended `exited (143)`
// two seconds in, and the row's rest was set as for a failed run.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mts';
import { setAppHome } from './app-home.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let dir;
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = null; });

async function boot() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-copy-quit-'));
  const storeRoot = path.join(dir, 'store');
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'acct-quit-test' }));
  setAppHome(storeRoot);
  return bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
}

describe('stopping the browser copy', () => {
  it('stops its own workers first, as the desktop app does', async () => {
    const booted = await boot();
    let stopped = 0;
    const real = booted.supervisor.killAll.bind(booted.supervisor);
    booted.supervisor.killAll = () => { stopped += 1; return real(); };
    booted.host.app.quit();
    expect(stopped).toBe(1);
  });

  it('marks a running worker as stopped by the app, so its death is not charged to the task', async () => {
    const booted = await boot();
    const child = { kill() {}, killed: false };
    const session = { itemId: 'w-0a1b2c3d4e', product: 'sandbox', child };
    booted.supervisor.sessions.set('w-0a1b2c3d4e', session);
    booted.host.app.quit();
    expect(session.stoppedByUs).toBe(true);
  });

  it('does nothing to workers until it is actually quitting', async () => {
    const booted = await boot();
    const session = { itemId: 'w-0a1b2c3d4e', product: 'sandbox', child: { kill() {} } };
    booted.supervisor.sessions.set('w-0a1b2c3d4e', session);
    expect(session.stoppedByUs).toBeUndefined();
  });
});
