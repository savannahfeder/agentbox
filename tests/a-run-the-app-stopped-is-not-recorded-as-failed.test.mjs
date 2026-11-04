// A RUN THE APP STOPPED IS NOT RECORDED AS FAILED (w-2a5f57325e, 2026-11-01).
//
// On 2026-10-31 an update restarted the app under a thread's worker, and both
// of that thread's runs went into runs.jsonl as `failed: true`, after 122 s and
// 318 s. Measured on the real supervisor before this change: a worker cut off
// by the app's own quit was written with `failed: true`, because the exit is
// judged by its signal alone, though the hold rule already ignored it
// (`stoppedByUs`). The worker had not failed; the app had stopped it.
//
// Runs the real supervisor and the stand-in worker
// (scripts/lib/stub-claude-worker.mjs), the way
// tests/a-worker-stopped-with-the-app-is-not-a-failed-run does.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mts';
import { QUIT_GRACE_MS } from '../main/supervisor.mts';
import { readRuns, runLedgerPath } from '../main/run-ledger.mts';
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

async function aRunningWorker() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-run-stopped-'));
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
  // The agent has begun once the session has an id: only such a run is in the ledger.
  await until(() => booted.supervisor.sessions.get(item.id)?.sessionId != null);
  return { item, pid };
}
const ledgerFor = (item) => readRuns({ file: booted.supervisor.runLedger ?? runLedgerPath() }).filter((r) => r.item === item.id);
const held = (item) => booted.supervisor._heldStarts?.[`sandbox:${item.id}`] ?? null;
const deadStarts = (item) => booted.supervisor._deadStarts?.[`sandbox:${item.id}`] ?? [];

describe('a run cut off by the app quitting', () => {
  it('is in the ledger, and not as failed', async () => {
    const { item, pid } = await aRunningWorker();
    expect(pid).toBeTruthy();
    booted.host.app.quit();
    const runs = await until(() => { const r = ledgerFor(item); return r.length ? r : null; });
    expect(runs).toHaveLength(1);
    expect(runs[0].failed).toBe(false);
  }, 30_000);

  it('does not count towards holding the thread', async () => {
    const { item } = await aRunningWorker();
    booted.host.app.quit();
    await until(() => ledgerFor(item).length);
    expect(held(item)).toBe(null);
    expect(deadStarts(item)).toEqual([]);
  }, 30_000);
});

describe('a run killed by someone else while the app keeps running', () => {
  it('is still a failed run', async () => {
    const { item, pid } = await aRunningWorker();
    process.kill(pid, 'SIGTERM');
    await wait(QUIT_GRACE_MS + 200);
    const runs = await until(() => { const r = ledgerFor(item); return r.length ? r : null; });
    expect(runs?.[0]?.failed).toBe(true);
  }, 30_000);
});
