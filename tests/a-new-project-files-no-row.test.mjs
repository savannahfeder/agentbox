// MAKING A PROJECT PUTS NOTHING IN HER INBOX.
//
// This is the second and last round on that one line. It started as a
// `directive` reading "Take X from idea toward launch", which `isFresh` took
// straight into a real Claude Code session in the person's repo before they had
// said a word. That round made it a `question` so nothing would spawn, and it
// left the half she is pointing at now standing: a new project still wrote a
// row into the one place she cannot afford noise in.
//
// So there is no row at all, and these are the two things to hold. The inbox
// stays empty, and the fleet stays home. The second is the expensive one to get
// wrong, because a spawn is somebody's real repo, so it runs the real
// supervisor tick rather than trusting the first assertion to imply it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';

// The same shape every other Store test uses: a throwaway root, and the app's
// own work-item code underneath it.
async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-norow-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  return new Store({
    storeRoot: root, accountId: 'test-account', accountRoot, products: [],
  }).init();
}

describe('a new project arrives with an empty inbox', () => {
  it('writes no work item, with a code folder', async () => {
    const s = await store();
    const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-dev-')), 'oldway');
    const { slug } = s.createProduct({ name: 'Old Way', repoPath: repo });
    expect(slug).toBe('old-way');
    expect(s.listItems().filter((i) => i.product === slug)).toEqual([]);
  });

  it('writes no work item without one either, which is the case that used to ask where the code was', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Nothing Yet' });
    expect(s.listItems().filter((i) => i.product === slug)).toEqual([]);
  });

  it('hands back the slug and no row, because the slug is all either call site ever used', async () => {
    const s = await store();
    const made = s.createProduct({ name: 'Kestrel' });
    expect(made.slug).toBe('kestrel');
    expect(made.item).toBeUndefined();
  });

  it('still makes the project itself, so an empty inbox is not a failed create', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Orbit' });
    const p = s.listProducts().find((x) => x.slug === slug);
    expect(p).toBeTruthy();
    expect(p.name).toBe('Orbit');
    expect(fs.existsSync(path.join(s.productDir(slug), 'project.json'))).toBe(true);
  });

  it('never writes the sentence she screenshotted, anywhere in the project', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Alchemy' });
    const said = s.listItems()
      .filter((i) => i.product === slug)
      .map((i) => `${i.title}\n${i.body ?? ''}`)
      .join('\n');
    expect(said).not.toMatch(/Give it its first job/i);
    expect(said).not.toMatch(/idea toward launch/i);
  });
});

describe('THE EXPENSIVE HALF: no project of hers starts a session on its own', () => {
  // Run the supervisor for real. The old row was excluded from `isFresh` by
  // kind, which is a guarantee one edit to the compose could have taken away.
  // With no row composed at all there is nothing for a tick to find, and this
  // asserts that end to end rather than reasoning about it.
  it('ticks over a brand new project and spawns nobody', async () => {
    const s = await store();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-norow-repo-'));
    const { slug } = s.createProduct({ name: 'Old Way', repoPath: repo });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-norow-sup-'));
    const sup = new Supervisor({ storeRoot: tmp, maxConcurrentSessions: 3 }, {
      listItems: () => s.listItems(),
      listProducts: () => [{ slug, name: 'Old Way', dir: s.productDir(slug) }],
      isDue: (i, at = Date.now()) => !i?.runAt || i.runAt <= at,
    }, tmp);
    sup.spawned = [];
    sup.spawnWorker = (item) => sup.spawned.push(item.id);
    sup.serveRepeats = async () => {};

    await sup.tick();
    expect(sup.spawned).toEqual([]);
    expect(sup.status().queued).toEqual([]);
  });
});
