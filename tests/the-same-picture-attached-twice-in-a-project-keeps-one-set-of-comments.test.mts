// THE SAME PICTURE ATTACHED TWICE IN A PROJECT KEEPS ONE SET OF COMMENTS.
//
// Sofia pinned a comment on onboarding-b.png in one place, then sent the same
// file again elsewhere, and Maya's pin landed on the second copy: "the DM copy
// and the group copy are two files". Measured in the store: every attach saves
// a new attachments/<time>-<random>-name, and the big view opened from a thread
// read only that thread's comments, so each copy kept its own. Opened from a
// thread now, a picture also shows the comments and approvals made on any
// other copy with the same bytes in the same project, and resolving or
// answering one of them writes to the thread it was made in.
//
// What must NOT join: a different picture with the same name, and the same
// bytes in another project.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000010', 'hex');
const OTHER = Buffer.from('89504e470d0a1a0a0000000d4948445200000020', 'hex');

let store, place, dir, a, b, c, d;
const attach = (project, saved, bytes) => {
  fs.mkdirSync(path.join(dir(project), 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir(project), 'attachments', saved), bytes);
  return `attachments/${saved}`;
};
const thread = async (project, title, file) => {
  const t = await store.composeItem(project, { title, body: 'x' });
  await disk.updateWorkItem(dir(project), t.id, { body: `Have a look [onboarding-b.png](${file})` }, { source: 'founder' });
  return t;
};
const note = (id, text) => ({ do: 'note', id, file: 'onboarding-b.png', place: { kind: 'pin', x: 0.2, y: 0.3 }, text });

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'same-file-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const [id, name] of [['website', 'Website'], ['billing', 'Billing']]) {
    fs.mkdirSync(path.join(accountRoot, id), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, name }));
  }
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, team: null, accountRoot, storeRoot });
  dir = (id) => path.join(accountRoot, id);

  a = await thread('website', 'Onboarding A or B', attach('website', 'mvwy0001-aaaa-onboarding-b.png', PNG));
  b = await thread('website', 'Pick for the team', attach('website', 'mvwy0002-bbbb-onboarding-b.png', PNG));
  c = await thread('website', 'Old draft', attach('website', 'mvwy0003-cccc-onboarding-b.png', OTHER));
  d = await thread('billing', 'Billing screen', attach('billing', 'mvwy0004-dddd-onboarding-b.png', PNG));
  store.fileMark('website', a.id, note('n-a', 'Step 2 label is cut'));
  store.fileMark('website', a.id, { do: 'approve', file: 'onboarding-b.png' });
  store.fileMark('website', c.id, note('n-c', 'On the old draft'));
  store.fileMark('billing', d.id, note('n-d', 'In billing'));
});

const pathIn = (t) => store.readItem(t.product, t.id).body.match(/\]\(([^)]+)\)/)[1];

describe('opened from the second thread', () => {
  it('shows the comment and the approval made on the first copy, as on this one', async () => {
    const got = await place.sameFile({ product: 'website', id: b.id, path: pathIn(b), file: 'onboarding-b.png' });
    expect(got.notes.map((n) => [n.id, n.text, n.file, n.in])).toEqual([['n-a', 'Step 2 label is cut', 'onboarding-b.png', 'Onboarding A or B']]);
    expect(got.approvals.map((x) => x.file)).toEqual(['onboarding-b.png']);
  });

  it('leaves out a different picture of the same name, and the same bytes in another project', async () => {
    const got = await place.sameFile({ product: 'website', id: b.id, path: pathIn(b), file: 'onboarding-b.png' });
    expect(got.notes.map((n) => n.id)).not.toContain('n-c');
    expect(got.notes.map((n) => n.id)).not.toContain('n-d');
  });

  it('does not repeat this thread\'s own comments', async () => {
    store.fileMark('website', b.id, note('n-b', 'Here'));
    const got = await place.sameFile({ product: 'website', id: b.id, path: pathIn(b), file: 'onboarding-b.png' });
    expect(got.notes.map((n) => n.id)).toEqual(['n-a']);
  });

  it('resolving the first copy\'s comment from here resolves it there', async () => {
    const got = await place.sameFile({ product: 'website', id: b.id, path: pathIn(b), file: 'onboarding-b.png' });
    expect((await place.mark(got.key, { do: 'resolve', on: 'n-a' })).ok).toBe(true);
    expect(store.readItem('website', a.id).artifacts.notes.find((n) => n.id === 'n-a').resolved).toBe(true);
  });

  it('a reply to it from here is written in the first thread', async () => {
    const got = await place.sameFile({ product: 'website', id: b.id, path: pathIn(b), file: 'onboarding-b.png' });
    expect((await place.mark(got.key, { do: 'reply', id: 'r-1', on: 'n-a', file: 'onboarding-b.png', text: 'Fixed in v2' })).ok).toBe(true);
    const there = store.readItem('website', a.id).artifacts.notes.find((n) => n.id === 'n-a');
    expect(JSON.stringify(there)).toContain('Fixed in v2');
  });
});

it('a picture attached once has nothing elsewhere', async () => {
  const got = await place.sameFile({ product: 'website', id: c.id, path: pathIn(c), file: 'onboarding-b.png' });
  expect(got.notes).toEqual([]);
  expect(got.approvals).toEqual([]);
});

it('the thread view shows them and routes their marks to where they were made', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ThreadArtifacts.tsx', import.meta.url), 'utf8');
  expect(view).toMatch(/fileElsewhere/);
  expect(view).toMatch(/filesPlaceMark/);
});

describe('in the thread view', async () => {
  const { withElsewhere, markGoesTo } = await import('../renderer/src/components/ThreadArtifacts.tsx');
  const own = { notes: [{ id: 'n-b', file: 'x.png', place: { kind: 'pin', x: 0, y: 0 }, text: 'mine', by: null, ts: 20, pin: 1 }], approvals: [], seen: {} };
  const there = [{ key: 'k1', notes: [{ id: 'n-a', file: 'x.png', place: { kind: 'pin', x: 0, y: 0 }, text: 'theirs', by: null, ts: 10, pin: 1, key: 'k1', in: 'A' }], approvals: [{ file: 'x.png', by: 'p', ts: 5, owner: null, key: 'k1' }] }];
  it('numbers every pin in the order it was made', () => {
    expect(withElsewhere(own, there).notes.map((n) => [n.id, n.pin])).toEqual([['n-a', 1], ['n-b', 2]]);
  });
  it('carries the approvals made elsewhere', () => {
    expect(withElsewhere(own, there).approvals).toHaveLength(1);
  });
  it('sends a resolve or a reply on another copy\'s comment there, and the rest here', () => {
    expect(markGoesTo({ do: 'resolve', on: 'n-a' }, there)).toBe('k1');
    expect(markGoesTo({ do: 'reply', id: 'r', on: 'n-a', file: 'x.png', text: 't' }, there)).toBe('k1');
    expect(markGoesTo({ do: 'resolve', on: 'n-b' }, there)).toBeNull();
    expect(markGoesTo({ do: 'note', id: 'n', file: 'x.png', place: { kind: 'whole' }, text: 't' }, there)).toBeNull();
  });
});
