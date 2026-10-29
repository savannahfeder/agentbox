// A RUN THAT WORKED AND THEN DIED IS NOT CALLED UNSTARTED.
//
// A thread showed the agent narrating, running commands and reading files, and
// under it the result "Claude Code stopped before it did anything, so this task
// has not been started. Agentbox keeps trying, and it will keep failing the
// same way until this is fixed." The run had died before its closing answer,
// and `sayTheRunDied` wrote the dead-run sentence for any run with no answer,
// however much it had done first. The row was also counted among the tasks
// "nothing has started on".
//
// Measured with the stand-in worker's [[stub:work-then-die]], which runs a tool
// and exits 1 with no result: before the fix the row read "stopped before it
// did anything".
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { deadRunSentence, deadRunCause } from '../shared/spawn-trouble.mjs';
import { readDeadRunTrace } from '../shared/dead-run-trace.mjs';
import { Name } from '../shared/product-name.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { setAppHome, clearAppHome } from './app-home.mjs';

const UNSTARTED = /stopped before it did anything|has not been started|nothing has been done|keep failing/;
const firstSentence = (s) => s.slice(0, s.indexOf('.') + 1);

describe('the sentence', () => {
  it('says a run that worked stopped partway through, not that it never started', () => {
    const s = deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', worked: true });
    expect(s).toMatch(/partway through/);
    expect(s).not.toMatch(UNSTARTED);
    expect(s).toMatch(new RegExp(`${Name} tries it again on its own`));
  });

  it('keeps the cause it knows, with its fix, when the run worked first', () => {
    const s = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', worked: true, resetsAt: '4pm' });
    expect(s).toMatch(/usage limit partway through/);
    expect(s).toMatch(/starts again on its own at 4pm/);
    expect(s).not.toMatch(UNSTARTED);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out', worked: true }))
      .toMatch(/signed out partway through.*Sign that account back in/);
  });

  it('reads a start-only cause on a run that worked as the plain partway sentence', () => {
    // A folder refusal or an old CLI stops a run before its first tool, so on
    // a run that used one the diagnosis is a misreading and its fix is wrong.
    for (const cause of ['workspace', 'too-old', 'api-key', 'codex-config', 'model-not-on-plan']) {
      expect(deadRunSentence({ engineWord: 'Claude Code', cause, worked: true }))
        .toBe(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', worked: true }));
    }
  });

  it('still says a run that did nothing never started', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown' })).toMatch(/stopped before it did anything/);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', worked: false })).toMatch(/stopped before it did anything/);
  });

  it('keeps every partway first sentence inside the inbox row', () => {
    for (const cause of ['unknown', 'at-limit', 'signed-out', 'org-blocked', 'subscription-ended', 'interrupted', 'network']) {
      const s = deadRunSentence({ engineWord: 'Claude Code', cause, worked: true });
      expect(firstSentence(s).length, s).toBeLessThan(112);
    }
  });

  it('is not read back as a row nothing has started on', () => {
    for (const cause of ['unknown', 'at-limit', 'signed-out']) {
      expect(deadRunCause(deadRunSentence({ engineWord: 'Claude Code', cause, worked: true }))).toBeNull();
    }
    expect(deadRunCause(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown' }))).toBe('unknown');
  });
});

describe('the trace', () => {
  const trace = (body) => `# t\n# w-1 · spawned 2026-10-20T17:00:00.000Z\n\n${body}\n# exited (1) 2026-10-20T17:05:00.000Z\n`;

  it('a tool line means the run worked', () => {
    expect(readDeadRunTrace(trace('17:01:02  Now looking at keys.\n17:01:03  [Bash] ls\n')).worked).toBe(true);
    expect(readDeadRunTrace(trace('17:01:03  [mcp__agentbox__claim_work_item] w-1\n')).worked).toBe(true);
  });

  it('text alone does not, because the CLI types its refusals as the agent', () => {
    expect(readDeadRunTrace(trace('17:01:02  Failed to authenticate: OAuth session expired\n')).worked).toBe(false);
    expect(readDeadRunTrace(trace('17:01:02  [error] the model is not available\n')).worked).toBe(false);
    expect(readDeadRunTrace(trace('stderr: boom\n')).worked).toBe(false);
  });
});

describe('the supervisor', () => {
  function makeSupervisor(item) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-worked-'));
    const store = {
      listItems: () => [item],
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }],
      isDue: () => true,
      written: [],
      recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
    };
    return { sup: new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root), store };
  }
  const item = { id: 'w-1', product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'], title: 't' };

  it('does not count a run that worked among the tasks nothing has started on', () => {
    const { sup, store } = makeSupervisor(item);
    sup._fruitless['agentbox:w-1'] = { runs: 1, endedAt: Date.now() };
    sup.sayTheRunDied(item, { engine: 'claude', tail: [], result: null, usedATool: true });
    expect(store.written[0].result).toMatch(/partway through/);
    expect(sup._fruitless['agentbox:w-1'].saidWhy).toBeUndefined();
  });

  it('still counts a run that did nothing', () => {
    const { sup, store } = makeSupervisor(item);
    sup._fruitless['agentbox:w-1'] = { runs: 1, endedAt: Date.now() };
    sup.sayTheRunDied(item, { engine: 'claude', tail: [], result: null });
    expect(store.written[0].result).toMatch(/stopped before it did anything/);
    expect(sup._fruitless['agentbox:w-1'].saidWhy).toBe('unknown');
  });
});

describe('the pass that reads old traces after a restart', () => {
  const DIED = new Date(2026, 9, 20, 17, 5).getTime();
  const LATER = DIED + 21 * 60_000;
  let home, docs, items, sup;
  const layDown = (text) => {
    const dir = machineryPath(docs, path.join('sessions', 'w-1'), home);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '1792454700000.log'), text);
  };
  const boot = () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-worked-home-'));
    docs = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-worked-docs-'));
    setAppHome(home);
    items = [{ id: 'w-1', product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'], title: 't', wrote: { body: { ts: 1000, source: 'founder' } } }];
    const store = {
      listItems: () => items,
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: docs }],
      isDue: () => true,
      recordSessionResult(product, id, patch) { items[0].result = patch.result; items[0].wrote.result = { ts: DIED + 1, source: 'agent' }; },
    };
    sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3, driveEnabled: true }, store, home);
    sup._fruitless['agentbox:w-1'] = { runs: 1, endedAt: DIED, founderAt: 0 };
  };
  afterEach(() => { clearAppHome(); });

  it('says partway through and does not count the row', () => {
    boot();
    layDown('# t\n# w-1 · spawned 2026-10-20T17:00:00.000Z\n\n17:01:02  Now looking at keys.\n17:01:03  [Bash] ls\n\n# exited (1) 2026-10-20T17:05:00.000Z\n');
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(items[0].result).toMatch(/partway through/);
    expect(sup._strandedNews(LATER)).toBeNull();
  });

  it('still counts a trace that never used a tool', () => {
    boot();
    layDown('# t\n# w-1 · spawned 2026-10-20T17:00:00.000Z\n\nstderr: boom\n\n# exited (1) 2026-10-20T17:05:00.000Z\n');
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(items[0].result).toMatch(/stopped before it did anything/);
    expect(sup._strandedNews(LATER)?.count).toBe(1);
  });
});

describe('end to end, with the stand-in worker', () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const STUB = path.join(repoRoot, 'scripts', 'lib', 'stub-claude-worker.mjs');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let dir, booted;
  afterEach(async () => {
    try { booted?.supervisor.killAll(); booted?.supervisor.stop?.(); } catch { /* done */ }
    await wait(100);
    // The killed worker can still be writing under `dir` when this walks it,
    // which on macOS ends the rmdir in ENOTEMPTY; a retry sees it empty.
    if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    dir = null; booted = null;
  });

  it('a worker that runs a tool and dies is told it stopped partway', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-worked-e2e-'));
    const storeRoot = path.join(dir, 'store');
    const account = path.join(storeRoot, 'accounts', 'acct-w', 'sandbox');
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(account, { recursive: true });
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
    for (const a of [['init', '-q', '-b', 'main'], ['add', '-A'], ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 's']]) execFileSync('git', a, { cwd: repo });
    fs.writeFileSync(path.join(account, 'project.json'), JSON.stringify({ schemaVersion: 2, id: 'sandbox', name: 'Sandbox', repoPath: repo }));
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${STUB}" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ receipts: path.join(dir, 'receipts') }));
    process.env.STUB_CLAUDE_PLAN = path.join(dir, 'plan.json');
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'acct-w', claudeBin: bin, authProfiles: ['default'] }));
    setAppHome(storeRoot);
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    const it = booted.store.composeItem('sandbox', { title: 'Look at the keys [[stub:work-then-die]]' });
    booted.supervisor.start();

    const said = () => String(booted.store.readItem('sandbox', it.id)?.result ?? '');
    const end = Date.now() + 15_000;
    while (!said() && Date.now() < end) await wait(50);

    expect(said()).toMatch(/partway through/);
    expect(said()).not.toMatch(UNSTARTED);
  }, 20_000);
});
