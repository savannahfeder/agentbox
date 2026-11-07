// A PICTURE LEFT IN ITS THREAD'S CHECKOUT STILL DRAWS IN FILES.
//
// onboarding-b-v2-built-v2.png and a page shot drew as a blank tile with the word
// PICTURE. Measured: `opened` comes back null when an agent names a picture by a
// path inside its own checkout (<repo>/.claude/worktrees/<thread>/shots/x.png),
// because the lookup, which rightly will not guess across other tasks' checkouts,
// skips every dot folder. Here the thread is known, so its own checkout is no guess.
//
// What must NOT happen: another thread's checkout answering for this thread's name.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mjs';
import { resolveArtifact } from '../main/artifact-path.mjs';
import { canWrite, readDoc } from '../main/doc-file.mts';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

async function aMac() {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-checkout-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  const repo = path.join(storeRoot, 'repo');
  fs.mkdirSync(path.join(accountRoot, 'app'), { recursive: true });
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(accountRoot, 'app', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App', repoPath: repo }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const place = appFilesPlace({ store, accountRoot, storeRoot });
  const dir = path.join(accountRoot, 'app');
  const thread = async (title, note) => {
    const t = store.composeItem('app', { title, body: 'x' });
    await disk.updateWorkItem(dir, t.id, { note }, { source: 'agent' });
    return t;
  };
  const inCheckout = (id, rel) => {
    const f = path.join(repo, '.claude', 'worktrees', id, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, PNG);
    return f;
  };
  return { place, thread, inCheckout, dir, store, accountRoot, storeRoot };
}
const named = (list, name) => list.files.find((f) => f.name === name);

describe('the one finder every window asks', () => {
  const ask = (m, src, more = {}) => resolveArtifact({ src, product: 'app', products: m.store.listProducts(), accountRoot: m.accountRoot, storeRoot: m.storeRoot, fresh: true, ...more });

  it('finds what a thread names in that thread\'s checkout, a script\'s output included', async () => {
    const m = await aMac();
    const a = await m.thread('A', 'I made `chart.png` and [one-pager.html](one-pager.html) and `hello.py`.');
    for (const name of ['chart.png', 'one-pager.html', 'hello.py']) {
      const file = m.inCheckout(a.id, name);
      const found = await ask(m, name);
      expect(found.ok).toBe(true);
      expect(fs.realpathSync(found.path)).toBe(fs.realpathSync(file));
    }
  });

  it('asked from one thread, answers with that thread\'s file when two made the same name', async () => {
    const m = await aMac();
    const a = await m.thread('A', '`chart.png`');
    const b = await m.thread('B', '`chart.png`');
    const fileA = m.inCheckout(a.id, 'chart.png');
    m.inCheckout(b.id, 'chart.png');
    expect(fs.realpathSync((await ask(m, 'chart.png', { thread: a.id })).path)).toBe(fs.realpathSync(fileA));
  });

  it('does not answer from a checkout whose thread never named the file', async () => {
    const m = await aMac();
    const a = await m.thread('A', 'nothing');
    m.inCheckout(a.id, 'chart.png');
    expect((await ask(m, 'chart.png')).ok).toBe(false);
  });

  it('does not let a thread id climb out of the checkouts', async () => {
    const m = await aMac();
    expect((await ask(m, 'chart.png', { thread: '../../..' })).ok).toBe(false);
  });
});

describe('a file that is no picture, film, PDF or document', () => {
  it('reaches Files once it is really on disk', async () => {
    const m = await aMac();
    const a = await m.thread('A', 'See [one-pager.html](one-pager.html) and `hello.py`, unlike `never-written.py`.');
    m.inCheckout(a.id, 'one-pager.html');
    m.inCheckout(a.id, 'hello.py');
    const list = await m.place.list();
    expect(named(list, 'one-pager.html')).toMatchObject({ kind: 'page' });
    expect(named(list, 'hello.py')).toMatchObject({ kind: 'code' });
    expect(named(list, 'never-written.py')).toBeUndefined();
  });

  it('can be read in the pane and never written from it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-py-'));
    const file = path.join(dir, 'hello.py');
    fs.writeFileSync(file, 'print("hi")\n');
    expect(readDoc({ file })).toMatchObject({ ok: true, text: 'print("hi")\n' });
    expect(canWrite({ file, product: { dir } }).ok).toBe(false);
    expect(readDoc({ file: path.join(dir, 'a.bin') }).ok).toBe(false);
  });

  it('is not a word in a sentence', async () => {
    const m = await aMac();
    await m.thread('A', 'We use node.js and example.com for this.');
    expect((await m.place.list()).files).toEqual([]);
  });
});

describe('a picture named from inside a checkout', () => {
  it('opens from its own thread\'s checkout', async () => {
    const m = await aMac();
    const a = await m.thread('A', '[built.png](shots/built.png)');
    const file = m.inCheckout(a.id, 'shots/built.png');
    expect(fs.realpathSync(named(await m.place.list(), 'built.png').opened)).toBe(fs.realpathSync(file));
  });

  it('does not open from another thread\'s checkout', async () => {
    const m = await aMac();
    await m.thread('A', '[shot.png](shots/shot.png)');
    const b = await m.thread('B', 'nothing here');
    m.inCheckout(b.id, 'shots/shot.png');
    expect(named(await m.place.list(), 'shot.png')?.opened ?? null).toBeNull();
  });

  it('shows the version that is here, and counts no version whose bytes are nowhere', async () => {
    const m = await aMac();
    const a = await m.thread('A', '[plan.png](shots/plan.png)');
    const older = m.inCheckout(a.id, 'shots/plan.png');
    await disk.updateWorkItem(m.dir, a.id, { note: '[plan-v2.png](shots/plan-v2.png)' }, { source: 'agent' });
    const row = named(await m.place.list(), 'plan.png');
    expect(row.versions).toBe(1);
    expect(fs.realpathSync(row.opened)).toBe(fs.realpathSync(older));
  });
});
