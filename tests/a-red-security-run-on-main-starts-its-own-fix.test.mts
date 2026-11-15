// A RED SECURITY RUN ON MAIN STARTS ITS OWN FIX, THE WAY A RED TEST RUN DOES.
//
// Main's `security` run on GitHub went red at 6d9d4880 (2026-11-08 01:14 UTC),
// a semgrep finding in renderer/src/components/NeedCard.tsx, and stayed red for
// about thirty pushes with no thread filed. main/main-went-red.mts watched only
// the `tests` workflow (`--workflow tests`), so a red security run was never
// read by anything. Measured from GitHub's public run list: the last green
// security run on main was d22c75de, and every one after it failed.
//
// Now the same watch reads the security run for the commit it shipped, and a
// red one files one thread that starts on its own and names the findings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { FIX_TRIES, MAIN_RED_LABEL, MainTests, redOnMain, securityFindingsIn } from '../main/main-went-red.mts';

let root; let userDir; let dir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-red-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-red-user-'));
  dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDir, { recursive: true, force: true });
});

const storeFor = () => new Store({
  accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
}).init();
const product = () => ({ slug: 'myproduct', repoPath: root });
const rows = (store) => store.listItems().filter((i) => i.product === 'myproduct');

const run = (n, conclusion = 'failure', status = 'completed') => ({
  databaseId: n,
  headSha: `${String(n).padStart(7, '0')}${'b'.repeat(33)}`,
  status,
  conclusion,
  displayTitle: `commit ${n}`,
  url: `https://github.com/example/agentbox/actions/runs/${n}`,
});
const sha = (n) => run(n).headSha.slice(0, 7);
const stamp = (line) => `2026-11-08T03:37:30.1234567Z ${line}`;

// Semgrep 1.182.1's own text output for two files with two matches each.
const SEMGREP_LOG = [
  '│ 4 Code Findings │', '└─────────────────┘', '',
  '    main/a.js',
  '    ❯❱ javascript.express.security.audit.express-res-sendfile.express-res-sendfile',
  '          ❰❰ Blocking ❱❱',
  '          The application processes user-input, this is passed to res.sendFile which can allow an attacker to',
  '          Details: https://sg.run/7DJk', '',
  '            2┆ res.sendFile(req.query.p);',
  '            ⋮┆----------------------------------------',
  '            3┆ res.sendFile(req.query.q);', '',
  '    shared/b.js',
  '    ❯❱ javascript.express.security.audit.express-res-sendfile.express-res-sendfile',
  '          ❰❰ Blocking ❱❱',
  '          Details: https://sg.run/7DJk', '',
  '            2┆ res.sendFile(req.query.p);',
  '            3┆ res.sendFile(req.query.q,',
  '            4┆   other);', '',
  '##[error]Process completed with exit code 1.',
].map(stamp).join('\n');

// scripts/audit-packages.mjs's own lines when an advisory is high.
const AUDIT_LOG = [
  'root: 1 to fix (1 high in all)',
  '  high lodash <4.17.21: Prototype Pollution in lodash',
  '    https://github.com/advisories/GHSA-xxxx',
  '##[error]Process completed with exit code 1.',
].map(stamp).join('\n');

const SEMGREP_JOB = { id: 21, name: 'semgrep', conclusion: 'failure', labels: ['ubuntu-latest'] };
const AUDIT_JOB = { id: 22, name: 'audit', conclusion: 'success', labels: ['ubuntu-latest'] };

/** A gh with a run list per workflow, and the logs by job id. */
function fakeGh({ security = [], tests = [], jobs = [SEMGREP_JOB, AUDIT_JOB], logs = { 21: SEMGREP_LOG } } = {}) {
  const asked = [];
  const gh = async (args) => {
    asked.push(args.join(' '));
    if (args[0] === 'run') return { code: 0, out: JSON.stringify(args.includes('security') ? security : tests) };
    if (/\/jobs$/.test(args[1] ?? '')) return { code: 0, out: JSON.stringify({ jobs }) };
    const id = (args[1] ?? '').match(/jobs\/(\d+)\/logs/)?.[1];
    return { code: 0, out: logs[id] ?? '' };
  };
  gh.asked = asked;
  return gh;
}

const watcher = (store, gh, clock = { t: 0 }) => new MainTests({
  store, userDir, gh, now: () => clock.t, wait: async (ms) => { clock.t += ms; }, log: { info() {}, warn() {} },
});
const watchSecurity = (store, gh, shipped) => watcher(store, gh).watchSecurity({ product: product(), ...shipped });

describe('what a red security log says', () => {
  it('names each semgrep finding by file, first line and rule, once each', () => {
    expect(securityFindingsIn(SEMGREP_LOG)).toEqual([
      'main/a.js:2 javascript.express.security.audit.express-res-sendfile.express-res-sendfile',
      'main/a.js:3 javascript.express.security.audit.express-res-sendfile.express-res-sendfile',
      'shared/b.js:2 javascript.express.security.audit.express-res-sendfile.express-res-sendfile',
    ]);
  });

  it('names each advisory the audit refused', () => {
    expect(securityFindingsIn(AUDIT_LOG)).toEqual(['lodash <4.17.21: Prototype Pollution in lodash (high)']);
  });

  it('names nothing in a log with neither', () => {
    expect(securityFindingsIn(stamp('Run semgrep scan\n##[error]Process completed with exit code 2.'))).toEqual([]);
    expect(securityFindingsIn(stamp('  moderate pkg 1.0: a moderate advisory'))).toEqual([]);
  });
});

describe('a red security run on main', () => {
  it('files one thread that starts on its own and names the finding, the commit and the run', async () => {
    const store = await storeFor();
    await watchSecurity(store, fakeGh({ security: [run(1)] }), { sha: sha(1), item: { id: 'w-other' } });
    const [row] = rows(store);
    expect(rows(store)).toHaveLength(1);
    expect(row.labels).toContain(MAIN_RED_LABEL);
    expect(row.title).toBe("main's security run went red on GitHub: 3 findings");
    expect(row.body).toContain('main/a.js:2 javascript.express.security.audit.express-res-sendfile');
    expect(row.body).toContain(sha(1));
    expect(row.body).toContain(run(1).url);
    expect(row.body).toContain('nosemgrep');
    const { Supervisor } = await import('../main/supervisor.mts');
    const sup = new Supervisor({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }, store, root, path.join(root, 'data'), userDir);
    sup._saveState = () => {};
    expect(sup._isFreshWork(row)).toBe(true);
    sup.stop();
  });

  it('names a single finding in the title', async () => {
    const store = await storeFor();
    await watchSecurity(store, fakeGh({ security: [run(1)], jobs: [{ ...AUDIT_JOB, id: 22, conclusion: 'failure' }], logs: { 22: AUDIT_LOG } }), { sha: sha(1) });
    expect(rows(store)[0].title).toBe("main's security run went red on GitHub: lodash <4.17.21: Prototype Pollution in lodash (high)");
  });

  it('says so when its log names no finding', async () => {
    const store = await storeFor();
    await watchSecurity(store, fakeGh({ security: [run(1)], logs: {} }), { sha: sha(1) });
    expect(rows(store)[0].title).toBe("main's security run went red on GitHub, and its log names no finding");
  });

  it('files nothing more while main stays red, and says green on that thread when it comes back', async () => {
    const store = await storeFor();
    await watchSecurity(store, fakeGh({ security: [run(1)] }), { sha: sha(1) });
    await watchSecurity(store, fakeGh({ security: [run(2)] }), { sha: sha(2), item: { id: 'w-someone-else' } });
    expect(rows(store)).toHaveLength(1);
    await watchSecurity(store, fakeGh({ security: [run(3, 'success')] }), { sha: sha(3) });
    const [row] = rows(store);
    expect(store.readItem('myproduct', row.id).note).toContain(`main's security run is green again on GitHub, as of ${sha(3)}`);
    await watchSecurity(store, fakeGh({ security: [run(4)] }), { sha: sha(4) });
    expect(rows(store)).toHaveLength(2);
  });

  it('files a second try when the fix ships and main is still red, then waits for a person', async () => {
    const store = await storeFor();
    let fix = await watchSecurity(store, fakeGh({ security: [run(1)] }), { sha: sha(1) });
    for (let n = 2; n <= FIX_TRIES + 1; n += 1) {
      fix = await watchSecurity(store, fakeGh({ security: [run(n)] }), { sha: sha(n), item: { id: fix.id } });
    }
    const all = rows(store).sort((a, b) => a.createdAt - b.createdAt);
    expect(all).toHaveLength(FIX_TRIES + 1);
    expect(all[1].title).toMatch(/^main's security run is still red after a fix/);
    expect(all.at(-1).labels ?? []).not.toContain(MAIN_RED_LABEL);
    expect(all.at(-1).body).toContain('This needs you');
  });

  it('leaves the tests watch alone: its own red is still filed, and the push gate list is untouched', async () => {
    const store = await storeFor();
    await watchSecurity(store, fakeGh({ security: [run(1)] }), { sha: sha(1) });
    expect(redOnMain(userDir)).toEqual([]);
    const testsJob = { id: 31, name: 'vitest-linux', conclusion: 'failure', labels: ['ubuntu-latest'] };
    await watcher(store, fakeGh({ tests: [run(2)], jobs: [testsJob], logs: { 31: stamp('FAIL  tests/one.test.mjs > a > b') } }))
      .watch({ product: product(), sha: sha(2) });
    expect(rows(store).map((r) => r.title).sort()).toEqual([
      'main went red on GitHub: tests/one.test.mjs',
      "main's security run went red on GitHub: 3 findings",
    ]);
    expect(redOnMain(userDir)).toEqual(['tests/one.test.mjs']);
  });
});

describe('a security run that says nothing', () => {
  it('files nothing for a cancelled run, a run GitHub never made, or a machine without gh', async () => {
    const store = await storeFor();
    await watchSecurity(store, fakeGh({ security: [run(1, 'cancelled')] }), { sha: sha(1) });
    await watchSecurity(store, fakeGh({ security: [] }), { sha: sha(2) });
    await watchSecurity(store, async () => ({ code: 1, out: 'gh: command not found' }), { sha: sha(3) });
    expect(rows(store)).toEqual([]);
  });

  it('gives up on a run that never finishes, after half an hour', async () => {
    const store = await storeFor();
    const gh = fakeGh({ security: [run(1, null, 'in_progress')] });
    const clock = { t: 0 };
    await watcher(store, gh, clock).watchSecurity({ product: product(), sha: sha(1) });
    expect(clock.t).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(clock.t).toBeLessThan(32 * 60 * 1000);
    expect(rows(store)).toEqual([]);
  });

  it('asks GitHub for the security workflow by name', async () => {
    const store = await storeFor();
    const gh = fakeGh({ security: [run(1, 'success')] });
    await watchSecurity(store, gh, { sha: sha(1) });
    expect(gh.asked[0]).toContain('--workflow security');
  });
});

describe('the supervisor', () => {
  it('starts the security watch beside the tests watch after a ship', async () => {
    const { Supervisor } = await import('../main/supervisor.mts');
    const store = await storeFor();
    const sup = new Supervisor({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }, store, root, path.join(root, 'data'), userDir);
    sup._saveState = () => {};
    const watched = [];
    sup.mainTests = { watch: async () => { watched.push('tests'); }, watchSecurity: async () => { watched.push('security'); }, stop() {} };
    sup.watchMainsTests({ product: product(), sha: 'b1ee16f' });
    sup.watchMainsTests({ product: product(), sha: null });
    expect(watched).toEqual(['tests', 'security']);
    sup.stop();
  });
});
