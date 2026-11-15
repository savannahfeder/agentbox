// SEARCH COULD NOT FIND A FILE OR A COMMENT ON ONE.
//
// The finding, 2026-10-30: "no documents". A file a thread made, a markdown
// note's contents and a comment left on a file were only reachable by opening
// the thread that held them. This runs the app's own finder over a real
// project folder: files by name, markdown by what it says, comments on files,
// and the files that must stay out (a file no thread names, and a file in
// another project).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFinder } from '../main/everything-found.mts';

let root;
const mine = { slug: 'lumen', name: 'Lumen' };
const other = { slug: 'other', name: 'Other' };

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'found-files-'));
  for (const p of [mine, other]) { p.dir = path.join(root, p.slug); fs.mkdirSync(p.dir, { recursive: true }); fs.writeFileSync(path.join(p.dir, 'project.json'), '{}'); }
  fs.writeFileSync(path.join(mine.dir, 'launch-plan.md'), '# Launch plan\n\nThe clinics get the beta on Tuesday.\nPricing is still open.\n');
  fs.writeFileSync(path.join(mine.dir, 'homepage.png'), 'not really a picture');
  fs.writeFileSync(path.join(mine.dir, 'unlinked-notes.md'), 'The word zanzibar is in a file no thread names.\n');
  fs.writeFileSync(path.join(other.dir, 'other-plan.md'), 'The word quokka is in another project.\n');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const line = (uid, ts, patch, extra = {}) => ({ id: 't1', uid, ts, source: 'agent', patch, ...extra });
const ledger = [
  line('l1', 10, { result: 'Wrote [the plan](launch-plan.md) and a mock [homepage](homepage.png).' }),
  line('l2', 20, { artifact: { do: 'note', id: 'n1', file: 'launch-plan.md', place: { kind: 'whole' }, text: 'Move the beta to Wednesday please.' } }, { source: 'system', by: 'p-dev' }),
  line('l3', 30, { artifact: { do: 'note', id: 'n2', file: 'homepage.png', place: { kind: 'pin', x: 0.2, y: 0.3 }, text: 'The hero is too blue.' } }, { source: 'system', by: 'p-maya' }),
];

function finder() {
  const store = {
    listProducts: () => [mine, other],
    listAllWorkItems: () => [{ product: 'lumen', id: 't1', updatedAt: 30 }],
    readHistory: () => ledger,
  };
  return appFinder({ store, team: null, readableProducts: () => [mine, other], accountRoot: root, storeRoot: root });
}

describe('files on a thread', () => {
  it('are found by name, newest version once, with the path that opens them', async () => {
    const got = await finder().search('homepage');
    expect(got.files).toHaveLength(1);
    expect(got.files[0]).toMatchObject({ how: 'name', name: 'homepage.png', src: 'homepage.png', product: 'lumen', id: 't1' });
  });

  it('are found by a word of the name, from the start of a word', async () => {
    expect((await finder().search('launch')).files[0]).toMatchObject({ how: 'name', name: 'launch-plan.md' });
    expect((await finder().search('plan')).files.some((f) => f.name === 'launch-plan.md')).toBe(true);
  });

  it('are found for markdown by what the file says, showing that line', async () => {
    const got = await finder().search('beta on tuesday');
    expect(got.files[0]).toMatchObject({ how: 'contents', name: 'launch-plan.md', src: 'launch-plan.md' });
    expect(got.files[0].text).toContain('clinics get the beta on Tuesday');
  });

  it('are not found by contents when the file is a picture', async () => {
    expect((await finder().search('really picture')).files).toHaveLength(0);
  });

  it('are the ones a thread names, and no other file in the folder', async () => {
    expect((await finder().search('zanzibar')).files).toHaveLength(0);
    expect((await finder().search('unlinked')).files).toHaveLength(0);
  });

  it('never include a file from another project', async () => {
    expect((await finder().search('quokka')).files).toHaveLength(0);
    expect((await finder().search('other-plan')).files).toHaveLength(0);
  });
});

describe('comments on files', () => {
  it('are found with who wrote them, when, and the file they are on', async () => {
    const got = await finder().search('hero blue');
    expect(got.comments).toHaveLength(1);
    expect(got.comments[0]).toMatchObject({ by: 'p-maya', at: 30, name: 'homepage.png', src: 'homepage.png', noteId: 'n2' });
    expect(got.comments[0].text).toContain('hero is too blue');
  });

  it('are found on a markdown file too', async () => {
    const got = await finder().search('beta wednesday');
    expect(got.comments[0]).toMatchObject({ by: 'p-dev', name: 'launch-plan.md' });
  });

  it('are not found by the name of the file they are on', async () => {
    expect((await finder().search('homepage')).comments).toHaveLength(0);
  });
});
