// A PICK TAKEN BACK WITH Z IS NOT REPORTED AS A DEAD RUN (w-4465054f04).
//
// In the cloud power test a tester picked option 1 on a thread, and 16 s later
// pressed Z, which took the pick back and stopped the run it had started
// (exit 143 at 00:12:29). The next pass over stranded rows read that run's
// trace as a death and wrote "Claude Code stopped partway through ... tries it
// again on its own" over the agent's question at 00:12:42. The options went
// with it, so her second pick of 1 did nothing, and the promised retry ran at
// 00:15:19 and asked the question again. Reproduced on a throwaway copy: pick,
// Z, and ten seconds later the row carried the dead-run sentence.
//
// A run stopped at the person's request (Stop, Z, close, put off) now says so
// on its exit line, and the pass does not report it.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { readDeadRunTrace, traceShowsASilentDeath, STOPPED_ON_REQUEST } from '../shared/dead-run-trace.mjs';
import { Name } from '../shared/product-name.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { setAppHome, clearAppHome } from './app-home.mjs';

const RAN = '# t\n# w-1 · spawned 2026-10-20T17:00:00.000Z · continuation (the founder answered)\n\n17:01:02  Writing the pagination.\n17:01:03  [Bash] ls\n';
const exited = (code, mark = '') => `${RAN}\n# exited (${code}) 2026-10-20T17:05:00.000Z${mark}\n`;

describe('the trace', () => {
  it('of a run stopped on request is not a death', () => {
    const t = readDeadRunTrace(exited(143, STOPPED_ON_REQUEST));
    expect(t.exitCode).toBe(143);
    expect(t.stoppedOnRequest).toBe(true);
    expect(traceShowsASilentDeath(t)).toBe(false);
  });

  it('of a run killed by a signal nobody asked for still is', () => {
    expect(traceShowsASilentDeath(readDeadRunTrace(exited(143)))).toBe(true);
  });

  it('of a run that failed on its own still is', () => {
    expect(traceShowsASilentDeath(readDeadRunTrace(exited(1)))).toBe(true);
  });
});

describe('the pass over stranded rows', () => {
  const ASKED = new Date(2026, 9, 20, 16, 50).getTime();
  const FIRST_RUN_ENDED = ASKED + 1000;
  const LATER = FIRST_RUN_ENDED + 21 * 60_000;
  const QUESTION = '**Merge the pagination into main?**\n\n1. Merge it\n2. Leave it';
  let home, docs, items, sup;
  const layDown = (text) => {
    const dir = machineryPath(docs, path.join('sessions', 'w-1'), home);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '1792454700000.log'), text);
  };
  const boot = (answer) => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-takeback-home-'));
    docs = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-takeback-docs-'));
    setAppHome(home);
    items = [{
      id: 'w-1', product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'], title: 't', result: QUESTION, answer,
      wrote: { body: { ts: 1000, source: 'founder' }, result: { ts: ASKED, source: 'agent' } },
    }];
    const store = {
      listItems: () => items,
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: docs }],
      isDue: () => true,
      recordSessionResult(product, id, patch) { items[0].result = patch.result; items[0].wrote.result = { ts: LATER, source: 'agent' }; },
    };
    sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3, driveEnabled: true }, store, home);
    // The run that asked the question left the row open with no answer.
    sup._fruitless['agentbox:w-1'] = { runs: 1, endedAt: FIRST_RUN_ENDED, founderAt: 0 };
  };
  afterEach(() => { clearAppHome(); });

  it('leaves the agent\'s question and its options when her pick was taken back', () => {
    boot('(withdrawn)');
    layDown(exited(143, STOPPED_ON_REQUEST));
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(items[0].result).toBe(QUESTION);
    expect(sup._strandedNews(LATER)).toBeNull();
  });

  it('still speaks for a taken-back pick whose run then died on its own', () => {
    boot('(withdrawn)');
    layDown(exited(1));
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(items[0].result).toMatch(/partway through/);
  });

  it('leaves a row with a live answer alone, as before', () => {
    boot('Merge it');
    layDown(exited(143, STOPPED_ON_REQUEST));
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(items[0].result).toBe(QUESTION);
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
    clearAppHome();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null; booted = null;
  });

  it('a run she stops says so on its exit line', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-takeback-e2e-'));
    const storeRoot = path.join(dir, 'store');
    const account = path.join(storeRoot, 'accounts', 'acct-t', 'sandbox');
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
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'acct-t', claudeBin: bin, authProfiles: ['default'] }));
    setAppHome(storeRoot);
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    const row = booted.store.composeItem('sandbox', { title: 'Paginate the list [[stub:hang]]' });
    booted.supervisor.start();

    let end = Date.now() + 15_000;
    while (!booted.supervisor.sessions.has(row.id) && Date.now() < end) await wait(50);
    expect(booted.supervisor.stopSession(row.id)).toBe(true);

    const product = booted.store.listProducts().find((p) => p.slug === 'sandbox');
    const logs = () => {
      const d = machineryPath(product.dir, path.join('sessions', row.id));
      return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.log')).map((f) => fs.readFileSync(path.join(d, f), 'utf8')) : [];
    };
    end = Date.now() + 15_000;
    while (!logs().some((l) => /^# exited/m.test(l)) && Date.now() < end) await wait(50);
    const log = logs().find((l) => /^# exited/m.test(l));
    expect(readDeadRunTrace(log).stoppedOnRequest).toBe(true);
    expect(traceShowsASilentDeath(readDeadRunTrace(log))).toBe(false);
  }, 30_000);
});
