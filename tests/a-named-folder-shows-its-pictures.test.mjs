// A DESIGN FOLDER A MESSAGE NAMES SHOWS THE PICTURES IN IT.
//
// Her words, 2026-10-04: the previews she should be able to open from the chat,
// "and maybe even show a little preview component", had stopped showing up.
// One of the six Agentbox Team results that day that named a picture or a
// design folder said only "Photos of the built version are the files starting
// with `r3-` in:" and then the folder, which holds 42 pictures from three
// rounds. Nothing was drawn and the folder was grey text.
//
// So a folder on its own line asks main which pictures are in it, newest first,
// because the round a worker just finished is the one it is pointing at. Only
// pictures, only inside this product's own folders, the same two rules the
// picture scheme enforces (main/img-scheme.mjs), so a folder line can never be
// a way to list anything else on her disk.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { folderPictures } from '../main/folder-pictures.mjs';

let root, dir, repo, prod;
const touch = (rel, ageMinutes) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  const t = new Date(Date.now() - ageMinutes * 60_000);
  fs.utimesSync(file, t, t);
  return file;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-pictures-'));
  dir = path.join(root, 'agentbox-team');
  repo = path.join(root, 'repo');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
  prod = { slug: 'agentbox-team', dir, repoPath: repo };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the pictures in a folder a message names', () => {
  it('lists the folder on her screenshot, newest first, so round three leads', () => {
    touch('designs/w-a3/b-open.png', 300);
    touch('designs/w-a3/r2-rail.png', 120);
    touch('designs/w-a3/r3-built-closed.png', 5);
    const r = folderPictures({ src: 'designs/w-a3/', product: 'agentbox-team', products: [prod], accountRoot: root });
    expect(r.ok).toBe(true);
    expect(r.pictures.map((p) => path.basename(p))).toEqual(['r3-built-closed.png', 'r2-rail.png', 'b-open.png']);
    expect(r.total).toBe(3);
  });

  it('accepts the folder written out in full', () => {
    touch('designs/w-a3/one.png', 1);
    const r = folderPictures({ src: `${dir}/designs/w-a3/`, product: 'agentbox-team', products: [prod], accountRoot: root });
    expect(r.pictures).toHaveLength(1);
  });

  it('leaves out what is not a picture, a page or a note beside them', () => {
    touch('designs/w-a3/one.png', 1);
    touch('designs/w-a3/page.html', 1);
    touch('designs/w-a3/notes.md', 1);
    const r = folderPictures({ src: 'designs/w-a3/', product: 'agentbox-team', products: [prod], accountRoot: root });
    expect(r.pictures.map((p) => path.basename(p))).toEqual(['one.png']);
  });

  it('does not go into folders inside the folder', () => {
    touch('designs/w-a3/one.png', 1);
    touch('designs/w-a3/old/two.png', 1);
    const r = folderPictures({ src: 'designs/w-a3/', product: 'agentbox-team', products: [prod], accountRoot: root });
    expect(r.total).toBe(1);
  });

  it('hands back at most `limit` pictures but counts all of them', () => {
    for (let i = 0; i < 9; i++) touch(`designs/w-a3/p${i}.png`, i);
    const r = folderPictures({ src: 'designs/w-a3/', product: 'agentbox-team', products: [prod], accountRoot: root, limit: 4 });
    expect(r.pictures).toHaveLength(4);
    expect(r.total).toBe(9);
  });

  it('refuses a folder outside her project, even one full of pictures', () => {
    const outside = path.join(root, 'elsewhere');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.png'), 'x');
    const r = folderPictures({ src: outside, product: 'agentbox-team', products: [prod], accountRoot: path.join(root, 'nope') });
    expect(r.ok).toBe(false);
  });

  it('says so when the folder is not there', () => {
    const r = folderPictures({ src: 'designs/w-gone/', product: 'agentbox-team', products: [prod], accountRoot: root });
    expect(r.ok).toBe(false);
  });

  it('refuses a file, which is not a folder to look into', () => {
    touch('designs/w-a3/one.png', 1);
    const r = folderPictures({ src: 'designs/w-a3/one.png', product: 'agentbox-team', products: [prod], accountRoot: root });
    expect(r.ok).toBe(false);
  });
});
