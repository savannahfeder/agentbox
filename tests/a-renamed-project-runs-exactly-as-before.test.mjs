// A RENAMED PROJECT RUNS EXACTLY AS IT DID UNDER ITS OLD NAME.
//
// She renamed "Astral Video Agent" to "Astral Video" eighteen seconds after
// making it, and ninety minutes later its Urgent row sat behind Agentbox work.
// She read the rename as the cause and asked that a rename change nothing at
// all (w-3e2cbd790a, 2026-09-26).
//
// The rename was not the cause: the project was never in her running order, and
// an unranked project scores below every ranked one. These tests pin down that
// a rename cannot cause it either. Everything that decides what runs keys a
// project by its folder, and the folder keeps the name it was made with. They
// run the real store, a real row and the real supervisor queue, once before the
// rename and once after, and compare.
//
// The one thing that did change with the name was an agent asking for the
// project by the name it was made with. The store answered "no product called
// that", so a worker that remembered the old name could not file or read
// anything on it.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { setProjectName } from '../main/project-identity.mjs';
import { resolveAccount, resolveProduct } from '../mcp/core/account.mjs';
import { envName } from '../shared/product-name.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

async function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rename-'));
  dirs.push(root);
  const accountRoot = path.join(root, 'accounts', 'acct-1');
  fs.mkdirSync(accountRoot, { recursive: true });
  const s = await new Store({ storeRoot: root, accountId: 'acct-1', accountRoot, products: [] }).init();
  const { slug: agentbox } = s.createProduct({ name: 'Agentbox' });
  const { slug: video } = s.createProduct({ name: 'Astral Video Agent' });
  // Where the store server looks, named the way the app names it.
  process.env[envName('HOME')] = root;
  process.env.STORE_ACCOUNT_ID = 'acct-1';
  resolveAccount();
  return { s, root, agentbox, video, dir: (slug) => path.join(accountRoot, slug) };
}

// The supervisor, reading the real store, with one slot and her order set.
function supervisorOver(s, root, order) {
  const sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: root, maxConcurrentSessions: 1, authProfiles: ['default'] },
    { listItems: () => s.listItems(), listProducts: () => s.listProducts(), isDue: () => true, settleAnswer() {} },
    '/nonexistent-app',
  );
  sup.productOrder = order;
  const spawned = [];
  sup.spawnWorker = (item) => { spawned.push(item.id); sup.sessions.set(item.id, { itemId: item.id }); };
  return { sup, spawned };
}

describe('renaming a project', () => {
  it('keeps every row on it, under the same project', async () => {
    const { s, video, dir } = await world();
    const row = s.composeItem(video, { title: 'Build the video app', body: 'go', priority: 9 });
    const before = s.listItems().filter((i) => i.product === video).map((i) => i.id);

    setProjectName(dir(video), 'Astral Video');

    expect(s.listProducts().find((p) => p.slug === video).name).toBe('Astral Video');
    expect(s.listItems().filter((i) => i.product === video).map((i) => i.id)).toEqual(before);
    expect(before).toContain(row.id);
  });

  it('keeps its place in her order and its priority, so the queue is identical', async () => {
    const { s, root, agentbox, video, dir } = await world();
    s.composeItem(agentbox, { title: 'Low Agentbox task', body: 'x', priority: 2 });
    const urgent = s.composeItem(video, { title: 'Urgent video task', body: 'x', priority: 9 });
    const order = [video, agentbox];

    const first = supervisorOver(s, root, order);
    const scoresBefore = s.listItems().map((i) => [i.id, first.sup._score(i)]);
    await first.sup.tick();

    setProjectName(dir(video), 'Astral Video');

    const second = supervisorOver(s, root, order);
    const scoresAfter = s.listItems().map((i) => [i.id, second.sup._score(i)]);
    await second.sup.tick();

    expect(first.spawned).toEqual([urgent.id]);
    expect(second.spawned).toEqual(first.spawned);
    expect(scoresAfter).toEqual(scoresBefore);
  });

  it('is found by its new name', async () => {
    const { video, dir } = await world();
    setProjectName(dir(video), 'Astral Video');
    expect(path.basename(resolveProduct('Astral Video').dir)).toBe(video);
  });

  // The worker that remembered the old name. This one was broken.
  it('is still found by the name it was made with', async () => {
    const { video, dir } = await world();
    setProjectName(dir(video), 'Astral Video');
    expect(path.basename(resolveProduct('Astral Video Agent').dir)).toBe(video);
    expect(path.basename(resolveProduct('astral video agent').dir)).toBe(video);
  });

  // A name she gives one project now outranks the name another was made with.
  it('gives a current name precedence over an old one', async () => {
    const { s, video, dir } = await world();
    setProjectName(dir(video), 'Astral Video');
    const { slug: other } = s.createProduct({ name: 'Scratch' });
    setProjectName(dir(other), 'Astral Video Agent');
    expect(path.basename(resolveProduct('Astral Video Agent').dir)).toBe(other);
  });
});
