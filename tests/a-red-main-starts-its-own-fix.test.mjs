// A RED MAIN STARTS ITS OWN FIX, AND COMES TO YOU ONLY WHEN TWO FIXES FAIL.
//
// main/main-went-red.mjs filed one task when GitHub's full run went red on
// main, but it filed it as a proposal, so it sat in the inbox until someone
// read it and said "it's broken, fix it". Meanwhile every other ship bounced
// on the same red tests (5614801f and ce30416b on 2026-10-24 say so). Measured
// here by asking the supervisor's own `_isFreshWork` whether the filed row
// would start a run: it answered false.
//
// Now the row starts a run on its own and the fix ships without review. A fix
// whose ship leaves main red files a second try; when that one fails too, the
// next row is an ordinary proposal and waits for a person.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { FIX_TRIES, MAIN_RED_LABEL, MainTests, redOnMain } from '../main/main-went-red.mjs';

let root; let userDir; let dir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'main-fix-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-fix-user-'));
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

const run = (n, conclusion = 'failure') => ({
  databaseId: n,
  headSha: `${String(n).padStart(7, '0')}${'a'.repeat(33)}`,
  status: 'completed',
  conclusion,
  displayTitle: `commit ${n}`,
  url: `https://github.com/example/agentbox/actions/runs/${n}`,
});
const sha = (n) => run(n).headSha.slice(0, 7);
const JOBS = { jobs: [{ id: 11, name: 'vitest-linux', conclusion: 'failure', labels: ['ubuntu-latest'] }] };
const logFor = (...names) => names.map((n) => `2026-10-29T10:00:00.0000000Z FAIL  ${n} > a suite > a case`).join('\n');

function fakeGh({ runs, log = '' }) {
  return async (args) => {
    if (args[0] === 'run') return { code: 0, out: JSON.stringify(runs) };
    if (/\/jobs$/.test(args[1] ?? '')) return { code: 0, out: JSON.stringify(JOBS) };
    return { code: 0, out: log };
  };
}

const watch = (store, gh, shipped) => new MainTests({
  store, userDir, gh, wait: async () => {}, log: { info() {}, warn() {} },
}).watch({ product: product(), ...shipped });

const rows = (store) => store.listItems().filter((i) => i.product === 'myproduct');

async function supervisorOver(store) {
  const { Supervisor } = await import('../main/supervisor.mjs');
  const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' };
  const sup = new Supervisor(config, store, root, path.join(root, 'data'), userDir);
  sup._saveState = () => {};
  return sup;
}

describe('the row a red main files', () => {
  it('starts a run on its own, without anyone approving it', async () => {
    const store = await storeFor();
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs') }), { sha: sha(1), item: { id: 'w-other' } });
    const [row] = rows(store);
    expect(row.labels).toContain(MAIN_RED_LABEL);
    const sup = await supervisorOver(store);
    expect(sup._isFreshWork(row)).toBe(true);
    sup.stop();
  });

  it('tells the agent to fix it, to undo the commit if it cannot, and that the fix ships without review', async () => {
    const store = await storeFor();
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs') }), { sha: sha(1) });
    const [row] = rows(store);
    expect(row.body).toContain('tests/one.test.mjs');
    expect(row.body).toMatch(/git revert/);
    expect(row.body).toMatch(/ships without waiting for approval/);
    expect(row.body).toMatch(/`ship` label/);
  });

  it('records which tests are red on main, for the ship gate to read', async () => {
    const store = await storeFor();
    expect(redOnMain(userDir)).toEqual([]);
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs', 'tests/two.test.mjs') }), { sha: sha(1) });
    expect(redOnMain(userDir)).toEqual(['tests/one.test.mjs', 'tests/two.test.mjs']);
  });

  it('keeps that list current while main stays red, and keeps it when a log cannot be read', async () => {
    const store = await storeFor();
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs') }), { sha: sha(1) });
    await watch(store, fakeGh({ runs: [run(2)], log: logFor('tests/two.test.mjs') }), { sha: sha(2), item: { id: 'w-other' } });
    expect(redOnMain(userDir)).toEqual(['tests/two.test.mjs']);
    await watch(store, fakeGh({ runs: [run(3)], log: '' }), { sha: sha(3), item: { id: 'w-other' } });
    expect(redOnMain(userDir)).toEqual(['tests/two.test.mjs']);
    expect(rows(store)).toHaveLength(1);
  });

  it('forgets the list once main is green again', async () => {
    const store = await storeFor();
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs') }), { sha: sha(1) });
    await watch(store, fakeGh({ runs: [run(2, 'success')] }), { sha: sha(2) });
    expect(redOnMain(userDir)).toEqual([]);
  });
});

describe('a fix that leaves main red', () => {
  it('is tried once more, by a new run that starts on its own', async () => {
    const store = await storeFor();
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs') }), { sha: sha(1) });
    const [first] = rows(store);
    await watch(store, fakeGh({ runs: [run(2)], log: logFor('tests/one.test.mjs') }), { sha: sha(2), item: { id: first.id } });

    const second = rows(store).find((r) => r.id !== first.id);
    expect(second).toBeTruthy();
    expect(second.title).toMatch(/still red after a fix/);
    expect(second.body).toContain(first.id);
    const sup = await supervisorOver(store);
    expect(sup._isFreshWork(second)).toBe(true);
    sup.stop();
  });

  it(`comes to you once ${FIX_TRIES} fixes have failed, as a row nothing starts`, async () => {
    const store = await storeFor();
    let n = 1;
    await watch(store, fakeGh({ runs: [run(n)], log: logFor('tests/one.test.mjs') }), { sha: sha(n) });
    for (let i = 0; i < FIX_TRIES; i++) {
      const latest = JSON.parse(fs.readFileSync(path.join(userDir, 'main-tests.json'), 'utf8')).red.id;
      n += 1;
      await watch(store, fakeGh({ runs: [run(n)], log: logFor('tests/one.test.mjs') }), { sha: sha(n), item: { id: latest } });
    }
    expect(rows(store)).toHaveLength(FIX_TRIES + 1);
    const last = rows(store).find((r) => !(r.labels ?? []).includes(MAIN_RED_LABEL));
    expect(last).toBeTruthy();
    expect(last.body).toMatch(/needs you/i);
    const sup = await supervisorOver(store);
    expect(sup._isFreshWork(last)).toBe(false);
    sup.stop();
  });

  it('is not counted when somebody else\'s ship is the one still red', async () => {
    const store = await storeFor();
    await watch(store, fakeGh({ runs: [run(1)], log: logFor('tests/one.test.mjs') }), { sha: sha(1) });
    await watch(store, fakeGh({ runs: [run(2)], log: logFor('tests/one.test.mjs') }), { sha: sha(2), item: { id: 'w-somebody-else' } });
    await watch(store, fakeGh({ runs: [run(3)], log: logFor('tests/one.test.mjs') }), { sha: sha(3) });
    expect(rows(store)).toHaveLength(1);
  });
});

describe('the run on GitHub that all of this reads', () => {
  it('is never cancelled on main, so every commit there gets a verdict', () => {
    const yml = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.github/workflows/tests.yml'), 'utf8');
    const block = yml.match(/^concurrency:\n((?:\s+.+\n)+)/m)?.[1] ?? '';
    // Each commit on main is its own group, and only other branches cancel.
    expect(block).toMatch(/group: .*refs\/heads\/main.*github\.sha/);
    expect(block).toMatch(/cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/);
  });
});
