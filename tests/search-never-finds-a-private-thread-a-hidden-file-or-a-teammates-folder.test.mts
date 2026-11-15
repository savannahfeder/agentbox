// SEARCH MUST NOT FIND WHAT THE PERSON MAY NOT READ.
//
// Searching inside every thread, file and comment is only safe if it reads the
// same things the person can already open. This covers the three ways it could
// leak: a teammate's thread that is private (no card for this person, or hidden),
// a file of a teammate's that no visible thread carries, and a teammate's message
// that names a path elsewhere on this computer. Each must find nothing, and the
// ordinary shared thread beside them must still be found.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFinder, readableSharedThreads } from '../main/everything-found.mts';

describe('which teammates threads may be searched', () => {
  const folders = [
    { ownerId: 'p-dev', threadId: 't-shared', version: 1 },
    { ownerId: 'p-dev', threadId: 't-private', version: 1 },
    { ownerId: 'p-dev', threadId: 't-hidden', version: 1 },
    { ownerId: 'p-me', threadId: 't-mine', version: 1 },
  ];
  const cards = [
    { personId: 'p-dev', threadId: 't-shared', visible: true },
    { personId: 'p-dev', threadId: 't-hidden', visible: false },
    { personId: 'p-me', threadId: 't-mine', visible: true },
  ];
  const ids = (list) => list.map((f) => f.threadId);

  it('the ones the cloud shows this person a card for', () => {
    expect(ids(readableSharedThreads({ cards, me: 'p-me', folders }))).toContain('t-shared');
  });

  it('not a folder left on disk with no card for it', () => {
    expect(ids(readableSharedThreads({ cards, me: 'p-me', folders }))).not.toContain('t-private');
  });

  it('not a thread whose card is hidden', () => {
    expect(ids(readableSharedThreads({ cards, me: 'p-me', folders }))).not.toContain('t-hidden');
  });

  it('not this person\'s own thread a second time', () => {
    expect(ids(readableSharedThreads({ cards, me: 'p-me', folders }))).not.toContain('t-mine');
  });
});

describe('searching with a teammate\'s shared thread on disk', () => {
  let root;
  const threads = new Map();
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'found-private-'));
    const make = (name, files) => {
      const dir = path.join(root, name);
      fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
      for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
      return dir;
    };
    const shared = make('t-shared', { 'attachments/aaaaaaaaaaaa-status.md': 'Status: the render account is live.\n' });
    make('t-private', { 'attachments/bbbbbbbbbbbb-salaries.md': 'Everyone gets a raise.\n' });
    fs.writeFileSync(path.join(root, 'my-own-secret.md'), 'The vault code is walrus.\n');
    threads.set('t-shared', {
      shared: true, product: 'shared-thread:p-dev:t-shared', dir: shared,
      lines: [
        { id: 't-shared', uid: 'a1', ts: 5, source: 'founder', by: 'p-dev', patch: { answer: 'Posted the [status](attachments/aaaaaaaaaaaa-status.md) and read [this](' + path.join(root, 'my-own-secret.md') + ').' } },
      ],
    });
    threads.set('t-private', {
      shared: true, product: 'shared-thread:p-dev:t-private', dir: path.join(root, 't-private'),
      lines: [{ id: 't-private', uid: 'b1', ts: 6, source: 'founder', by: 'p-dev', patch: { answer: 'Salary talk: [salaries](attachments/bbbbbbbbbbbb-salaries.md) is confidential.' } }],
    });
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  function finder(cards) {
    const products = [...threads.values()].map((t) => ({ slug: t.product, name: 'Shared thread', dir: t.dir }));
    const team = {
      sharedThreads: () => readableSharedThreads({ cards, me: 'p-me', folders: [...threads.keys()].map((threadId) => ({ ownerId: 'p-dev', threadId, version: 1 })) }),
      threadWork: (_owner, threadId) => threads.get(threadId),
    };
    const store = { listProducts: () => [], listAllWorkItems: () => [], readHistory: () => [] };
    return appFinder({ store, team, readableProducts: () => products, accountRoot: root, storeRoot: root });
  }
  const visible = [{ personId: 'p-dev', threadId: 't-shared', visible: true }];

  it('finds the line, the file by name and the file by contents of a thread shared with them', async () => {
    const f = finder(visible);
    expect((await f.search('posted the status')).lines[0]).toMatchObject({ kind: 'shared', ownerId: 'p-dev', threadId: 't-shared', uid: 'a1', by: 'p-dev' });
    expect((await f.search('status')).files[0]).toMatchObject({ how: 'name', name: 'status.md', product: null, ownerId: 'p-dev', threadId: 't-shared' });
    const inside = (await finder(visible).search('render account is live')).files[0];
    expect(inside).toMatchObject({ how: 'contents', name: 'status.md' });
  });

  it('finds nothing of a teammate\'s private thread: not its line, its file name or its contents', async () => {
    const f = finder(visible);
    for (const q of ['salary talk', 'salaries', 'everyone gets a raise', 'confidential']) {
      const got = await f.search(q);
      expect([got.lines.length, got.files.length, got.comments.length], q).toEqual([0, 0, 0]);
    }
  });

  it('finds nothing in a path a teammate\'s message names outside their thread\'s folder', async () => {
    const got = await finder(visible).search('vault code walrus');
    expect(got.files).toHaveLength(0);
    expect(got.lines).toHaveLength(0);
  });

  it('finds the thread no more once its owner has taken it private', async () => {
    const f = finder([]);
    const got = await f.search('render account');
    expect([got.lines.length, got.files.length]).toEqual([0, 0]);
  });
});
