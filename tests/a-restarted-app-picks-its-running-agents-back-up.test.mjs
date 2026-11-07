// A RESTARTED APP PICKS ITS RUNNING AGENTS BACK UP (w-2a5f57325e, 2026-11-01).
//
// On 2026-10-31 each restart killed every local worker and the restart sweep
// resumed it as a new process, so its helpers were gone and its runs were
// recorded as failed. Measured before this change on the real supervisor: a
// quit sent every worker a stop signal (Supervisor#killAll), and the next start
// spawned the thread again with --resume.
//
// Here the real supervisor runs the stand-in worker (scripts/lib/stub-claude-worker.mjs)
// through the run host, the app quits, and a second app starts on the same data.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mts';
import { readRuns, runLedgerPath } from '../main/run-ledger.mts';
import { setAppHome } from './app-home.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(repoRoot, 'scripts', 'lib', 'stub-claude-worker.mjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return null; await wait(50); }
}
const alive = (pid) => { try { process.kill(pid, 0); } catch { return false; } try { return !/^\d+ \(.*\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; } };
const hostPid = (sock) => new Promise((resolve) => {
  const s = net.connect(sock);
  s.once('error', () => resolve(null));
  s.once('connect', () => s.write(`${JSON.stringify({ op: 'hello' })}\n`));
  s.setEncoding('utf8');
  s.once('data', (d) => { s.destroy(); try { resolve(JSON.parse(d).pid); } catch { resolve(null); } });
});

let dir, apps = [];
afterEach(async () => {
  for (const a of apps) { try { a.supervisor.killAll(); a.supervisor.stop?.(); } catch { /* done */ } }
  const pid = dir ? await hostPid(path.join(dir, 'r.sock')) : null;
  if (pid) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  await wait(100);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null; apps = [];
});

function aCopy() {
  dir = fs.mkdtempSync(path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'ab-adopt-'));
  const storeRoot = path.join(dir, 'store');
  const account = path.join(storeRoot, 'accounts', 'acct-adopt', 'sandbox');
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
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'acct-adopt', claudeBin: bin, authProfiles: ['default'] }));
  setAppHome(storeRoot);
  return { receipts };
}

async function anApp({ hostRuns = true } = {}) {
  const booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
  booted.supervisor.hostRuns = hostRuns;
  booted.supervisor._runHostSock = path.join(dir, 'r.sock');
  apps.push(booted);
  return booted;
}
const spawns = (receipts, item) => { try { return fs.readFileSync(path.join(receipts, `${item.id}.spawns.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
const workerPid = (receipts, item) => until(() => spawns(receipts, item)[0]?.pid);
const ledgerFor = (app, item) => readRuns({ file: app.supervisor.runLedger ?? runLedgerPath() }).filter((r) => r.item === item.id);

describe('an app that quits while an agent works', () => {
  it('leaves the agent running, and the next app follows the same run to its end', async () => {
    const { receipts } = aCopy();
    const first = await anApp();
    const item = first.store.composeItem('sandbox', { title: 'Take a while [[stub:slow:2500]]' });
    first.supervisor.start();
    const rec = await until(() => first.supervisor._liveSessions?.[item.id]?.hosted);
    const pid = await workerPid(receipts, item);
    expect(pid).toBeTruthy();

    first.host.app.quit();
    await wait(300);
    expect(alive(pid)).toBe(true);
    expect(rec.runId).toBeTruthy();
    // Nothing was recorded for a run that has not ended.
    expect(ledgerFor(first, item)).toEqual([]);
    first.supervisor.stop?.();

    const second = await anApp();
    second.supervisor.start();
    expect(second.supervisor.sessions.has(item.id)).toBe(true);
    const answered = await until(() => /the stub worker ran/.test(second.store.readItem('sandbox', item.id)?.result ?? ''), 20_000);
    expect(answered).toBe(true);
    await until(() => !second.supervisor.sessions.has(item.id));
    // The same process, never a second one.
    expect(spawns(receipts, item)).toHaveLength(1);
    const runs = ledgerFor(second, item);
    expect(runs).toHaveLength(1);
    expect(runs[0].failed).toBe(false);
    expect(second.supervisor._heldStarts?.[`sandbox:${item.id}`] ?? null).toBe(null);
  }, 45_000);

  it('a run that ended while the app was away is read to its end, not started again', async () => {
    const { receipts } = aCopy();
    const first = await anApp();
    const item = first.store.composeItem('sandbox', { title: 'Quick [[stub:slow:600]]' });
    first.supervisor.start();
    await until(() => first.supervisor._liveSessions?.[item.id]?.hosted);
    const pid = await workerPid(receipts, item);
    first.host.app.quit();
    first.supervisor.stop?.();
    // With no app, the host closes its input at the end of its turn, and it ends.
    expect(await until(() => !alive(pid), 15_000)).toBe(true);

    const second = await anApp();
    second.supervisor.start();
    const answered = await until(() => /the stub worker ran/.test(second.store.readItem('sandbox', item.id)?.result ?? ''), 15_000);
    expect(answered).toBe(true);
    expect(spawns(receipts, item)).toHaveLength(1);
    expect(ledgerFor(second, item)[0]?.failed).toBe(false);
  }, 45_000);
});

describe('without the run host', () => {
  it('a quit still stops the worker, as it did before', async () => {
    const { receipts } = aCopy();
    const first = await anApp({ hostRuns: false });
    const item = first.store.composeItem('sandbox', { title: 'Take a while [[stub:slow:20000]]' });
    first.supervisor.start();
    await until(() => first.supervisor.sessions.get(item.id)?.sessionId);
    const pid = await workerPid(receipts, item);
    first.host.app.quit();
    expect(await until(() => !alive(pid), 10_000)).toBe(true);
    expect(first.supervisor._liveSessions?.[item.id]?.hosted).toBeUndefined();
  }, 30_000);
});
