// A WORKER STOPPED WITH THE APP IS NOT A FAILED RUN.
//
// Found 2026-10-12 by the pre-deploy check's live drive `ctrl-c-mid-run`
// (.claude/skills/verify-agentbox). Control-C in the terminal running the
// browser copy reaches the whole process group. The worker, which exits as soon
// as it is signalled, died before the app's own handler ran, so the app judged
// that death at once as a run that failed on its own: the row read "Claude Code
// stopped before it did anything … it will keep failing the same way until this
// is fixed" (written at the same millisecond as the worker's `exited (143)`),
// and it rested 15 minutes after the copy came back. Stopping its workers on
// quit (tests/control-c-on-the-browser-copy-does-not-fail-its-agents) was not
// enough on its own, because the signal reached the worker first.
//
// This runs the real supervisor and the real stand-in worker
// (scripts/lib/stub-claude-worker.mjs) and signals the worker the way a
// terminal does.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mts';
import { diedOfAStopSignal, QUIT_GRACE_MS } from '../main/supervisor.mts';
import { setAppHome } from './app-home.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(repoRoot, 'scripts', 'lib', 'stub-claude-worker.mjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return null; await wait(50); }
}

let dir, booted;
afterEach(async () => {
  try { booted?.supervisor.killAll(); booted?.supervisor.stop?.(); } catch { /* done */ }
  await wait(100);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null; booted = null;
});

/** A copy with one project and the stand-in as Claude Code, a task sent, and its worker running. */
async function aRunningWorker() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-stop-signal-'));
  const storeRoot = path.join(dir, 'store');
  const account = path.join(storeRoot, 'accounts', 'acct-stop', 'sandbox');
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(account, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  for (const a of [['init', '-q', '-b', 'main'], ['add', '-A'], ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 's']]) execFileSync('git', a, { cwd: repo });
  fs.writeFileSync(path.join(account, 'project.json'), JSON.stringify({ schemaVersion: 2, id: 'sandbox', name: 'Sandbox', repoPath: repo }));
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${STUB}" "$@"\n`, { mode: 0o755 });
  const receipts = path.join(dir, 'receipts');
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ receipts }));
  process.env.STUB_CLAUDE_PLAN = path.join(dir, 'plan.json');
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'acct-stop', claudeBin: bin, authProfiles: ['default'] }));
  setAppHome(storeRoot);
  booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
  const item = booted.store.composeItem('sandbox', { title: 'Take a while [[stub:slow:20000]]' });
  booted.supervisor.start();
  const pid = await until(() => {
    try { return JSON.parse(fs.readFileSync(path.join(receipts, `${item.id}.spawns.jsonl`), 'utf8').trim().split('\n')[0]).pid; } catch { return null; }
  });
  return { item, pid };
}
const fruitless = (item) => booted.supervisor._fruitless?.[`sandbox:${item.id}`] ?? null;
const said = (item) => String(booted.store.readItem('sandbox', item.id)?.result ?? '');

describe('a worker that dies of a stop signal', () => {
  it('Control-C reaches the worker first and the app quits a moment later: not a failed run', async () => {
    const { item, pid } = await aRunningWorker();
    expect(pid).toBeTruthy();
    process.kill(pid, 'SIGINT');
    await wait(60);
    booted.host.app.quit();
    await wait(QUIT_GRACE_MS + 400);
    expect(fruitless(item)).toBe(null);
    expect(said(item)).not.toMatch(/stopped before it did anything|keep failing/);
  }, 30_000);

  it('killed by someone else while the app keeps running: still a failed run, once the grace has passed', async () => {
    const { item, pid } = await aRunningWorker();
    process.kill(pid, 'SIGTERM');
    const noted = await until(() => fruitless(item), 10_000);
    expect(noted?.runs).toBe(1);
  }, 30_000);
});

describe('which deaths wait for the grace', () => {
  it('the stop signals and the codes the CLI exits with for them', () => {
    for (const [code, signal] of [[null, 'SIGINT'], [null, 'SIGTERM'], [null, 'SIGHUP'], [130, null], [143, null], [129, null]]) {
      expect(diedOfAStopSignal(code, signal), `${code} ${signal}`).toBe(true);
    }
  });
  it('not an ordinary exit, a crash or a kill -9', () => {
    for (const [code, signal] of [[0, null], [1, null], [127, null], [null, 'SIGKILL'], [137, null]]) {
      expect(diedOfAStopSignal(code, signal), `${code} ${signal}`).toBe(false);
    }
  });
});
