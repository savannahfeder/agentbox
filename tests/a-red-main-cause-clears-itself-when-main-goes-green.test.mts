// A thread whose ship is refused because main is red waits behind a cause
// row (`wait_on_cause`), and a cause row waits for the person's reply. The
// app already watches main's tests on GitHub (main/main-went-red.mts) and
// hears the green again, but it said so only on its own red row. Measured on
// the store, 2026-11-25: four of the last eight causes were "Main is red...";
// the newest (w-31126b94f4) still held two ships about 40 hours after main's
// whole-suite run had gone green, and an earlier one was closed by hand.
//
// Now the green again closes every open cause about main being red, and the
// threads behind it carry on through the wait every row already has. A cause
// about anything else is left alone.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { MainTests } from '../main/main-went-red.mts';
import { aboutRedMain, CAUSE_KIND, CAUSE_LABEL } from '../shared/causes.mts';

let root: string; let userDir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-cause-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'red-cause-user-'));
  fs.mkdirSync(path.join(root, 'kestrel'), { recursive: true });
  fs.writeFileSync(path.join(root, 'kestrel', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'Kestrel' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDir, { recursive: true, force: true });
});

const GREEN = { databaseId: 7, headSha: '053ec65fad44c32ea48b34689ba3d1aec663500c', status: 'completed', conclusion: 'success', displayTitle: 'Resize from any corner', url: 'https://example.com/runs/7' };
const gh = async (args: string[]) => (args[0] === 'run' ? { code: 0, out: JSON.stringify([GREEN]) } : { code: 0, out: '' });
const watcher = (store: Store) => new MainTests({ store, userDir, gh, now: () => 0, wait: async () => {}, log: { info() {}, warn() {} } });

const setUp = async () => {
  const store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody' }).init();
  const cause = (title: string) => {
    // Filed by the app, as `wait_on_cause` files one.
    const made = store.fileItem('kestrel', { title, body: 'x', labels: ['founder', CAUSE_LABEL] });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('kestrel'), made.id, { kind: CAUSE_KIND, status: 'blocked' }, { source: 'system' });
    return made;
  };
  return { store, cause };
};
const statusOf = (store: Store, id: string) => store.readItem('kestrel', id)?.status;

describe('a red-main cause clears itself when main goes green', () => {
  it("closes an open cause about main being red once main's tests pass, saying so", async () => {
    const { store, cause } = await setUp();
    const red = cause('Main is red, so ships are refused');
    await watcher(store).watch({ product: { slug: 'kestrel', repoPath: root }, sha: '053ec65' });
    const row = store.readItem('kestrel', red.id);
    expect(row?.status).toBe('done');
    expect(row?.note).toMatch(/green again/);
  });

  it('leaves a cause about anything else open', async () => {
    const { store, cause } = await setUp();
    const other = cause('Your Mac has no key for the database');
    await watcher(store).watch({ product: { slug: 'kestrel', repoPath: root }, sha: '053ec65' });
    expect(statusOf(store, other.id)).toBe('blocked');
  });

  it('knows the ways an agent names a red main, and not other trouble', () => {
    const row = (title: string) => ({ id: 'w-c', title, kind: CAUSE_KIND, labels: [CAUSE_LABEL], status: 'blocked' });
    for (const t of ['Main is red, so ships are refused', 'Main is red: a test about the list fails on main', "Main's tests are failing", 'main is broken']) expect(aboutRedMain(row(t))).toBe(true);
    for (const t of ['Your Mac cannot push to GitHub', 'The domain is red in the browser', 'A ship failed on the main window test']) expect(aboutRedMain(row(t))).toBe(false);
    expect(aboutRedMain({ ...row('Main is red'), status: 'done' })).toBe(false);
    expect(aboutRedMain({ ...row('Main is red'), kind: 'task', labels: [] })).toBe(false);
  });
});
