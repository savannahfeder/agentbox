// A RED SECURITY SCAN LANDS IN NEEDS YOU.
//
// The `security` workflow (Semgrep and the package audit) went red on main on
// 2026-11-02 and nobody was told: main/main-went-red.mts watches only the
// `tests` workflow. Measured by reading that file's one WORKFLOW constant and
// the 410 security runs on GitHub, none of which ever filed a row.
//
// After each ship the app now waits for that commit's security run too, and
// files ONE row, a proposal so it sits in Needs you, when it goes red. Not a
// row per red commit while it stays red, nothing for a cancelled run, nothing
// at all on a machine without `gh`, and the green again lands on that same row.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { CONTEXT_WORDS, wordsIn } from '../shared/thread-cards.mts';
import { SecurityScan, securityRow } from '../main/the-security-scan-went-red.mts';
import { GIVE_UP_MS } from '../main/main-went-red.mts';

let root; let userDir; let dir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-red-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-red-user-'));
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

const RED = {
  databaseId: 39000000001,
  headSha: 'c0ffee1d2a4ebc65bc2cd432916b017dd512dee',
  status: 'completed',
  conclusion: 'failure',
  displayTitle: 'Files no longer sits blank',
  url: 'https://github.com/example/agentbox/actions/runs/39000000001',
};
const RED_LATER = { ...RED, databaseId: 39000000002, headSha: 'deadbeefd2a4ebc65bc2cd432916b017dd512dee', displayTitle: 'Something else' };
const GREEN = { ...RED, databaseId: 39000000003, headSha: 'abcdef0d2a4ebc65bc2cd432916b017dd512dee', conclusion: 'success', displayTitle: 'Fixed the advisory' };
const JOBS = { jobs: [
  { id: 1, name: 'semgrep', conclusion: 'success' },
  { id: 2, name: 'audit', conclusion: 'failure' },
] };

function fakeGh({ runs = [RED], jobs = JOBS, fails = false } = {}) {
  const asked = [];
  const gh = async (args) => {
    asked.push(args.join(' '));
    if (fails) return { code: 1, out: 'gh: command not found' };
    if (args[0] === 'run') return { code: 0, out: JSON.stringify(runs) };
    return { code: 0, out: JSON.stringify(jobs) };
  };
  gh.asked = asked;
  return gh;
}

function watcher(store, gh, clock = { t: 0 }) {
  return new SecurityScan({
    store, userDir, gh, now: () => clock.t, wait: async (ms) => { clock.t += ms; }, log: { info() {}, warn() {} },
  });
}

describe('a red security run', () => {
  it('files one row that waits for you, naming the check that failed and the commit', async () => {
    const store = await storeFor();
    const gh = fakeGh();
    await watcher(store, gh).watch({ product: product(), sha: 'c0ffee1' });

    expect(gh.asked[0]).toContain('--workflow security');
    const all = rows(store);
    expect(all).toHaveLength(1);
    const [row] = all;
    // Filed as a proposal, not started on its own: it waits in Needs you.
    expect(row.labels ?? []).not.toContain('founder');
    expect(row.title).toMatch(/security/i);
    expect(row.body).toContain('c0ffee1');
    expect(row.body).toContain(RED.url);
    expect(row.body).toContain('audit');
    expect(row.body).not.toMatch(/- semgrep/);
    expect(row.body).toContain('docs/security-checks.md');
    expect(wordsIn(row.problem)).toBeLessThanOrEqual(CONTEXT_WORDS);
  });

  it('files nothing more while main stays red', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh()).watch({ product: product(), sha: 'c0ffee1' });
    await watcher(store, fakeGh({ runs: [RED_LATER, RED] })).watch({ product: product(), sha: 'deadbee' });
    expect(rows(store)).toHaveLength(1);
  });

  it('says green again on that same row, and a later red files a new one', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh()).watch({ product: product(), sha: 'c0ffee1' });
    const [first] = rows(store);
    await watcher(store, fakeGh({ runs: [GREEN, RED] })).watch({ product: product(), sha: 'abcdef0' });
    expect(rows(store)).toHaveLength(1);
    expect(JSON.stringify(store.readItem('myproduct', first.id))).toMatch(/green again/);

    await watcher(store, fakeGh({ runs: [RED_LATER, GREEN] })).watch({ product: product(), sha: 'deadbee' });
    expect(rows(store)).toHaveLength(2);
  });

  it('names both checks when both failed', () => {
    const row = securityRow({ sha: RED.headSha, subject: RED.displayTitle, url: RED.url, failed: ['semgrep', 'audit'] });
    expect(row.body).toContain('- semgrep');
    expect(row.body).toContain('- audit');
  });
});

describe('what files nothing', () => {
  it('a green run, with no red before it', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ runs: [GREEN] })).watch({ product: product(), sha: 'abcdef0' });
    expect(rows(store)).toHaveLength(0);
  });

  it('a cancelled run, which a newer push cancelled', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ runs: [{ ...RED, conclusion: 'cancelled' }] })).watch({ product: product(), sha: 'c0ffee1' });
    expect(rows(store)).toHaveLength(0);
  });

  it('a machine without gh, or signed out of it', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ fails: true })).watch({ product: product(), sha: 'c0ffee1' });
    expect(rows(store)).toHaveLength(0);
  });

  it('a run that never finishes: the watch gives up', async () => {
    const store = await storeFor();
    const clock = { t: 0 };
    await watcher(store, fakeGh({ runs: [{ ...RED, status: 'in_progress', conclusion: null }] }), clock).watch({ product: product(), sha: 'c0ffee1' });
    expect(rows(store)).toHaveLength(0);
    expect(clock.t).toBeGreaterThanOrEqual(GIVE_UP_MS);
  });
});

describe('the app starts this watch after every ship', () => {
  it('beside the tests watch', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'supervisor.mts'), 'utf8');
    expect(src).toMatch(/new SecurityScan\(/);
    expect(src).toMatch(/this\.securityScan\.watch\(/);
    expect(src).toMatch(/this\.securityScan\?\.stop\(\)/);
  });
});
