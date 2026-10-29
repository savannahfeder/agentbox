// A FOLDER A CLOUD REQUEST NAMES GOES WITH THE RUN (w-6771163ced, 2026-10-29).
//
// The launch-video request named its intro as
// `~/Zero/accounts/<id>/astral/videos/hyperfocus-brain-…/`. The cloud run is
// sent every file the request names under the store, but only an absolute path
// to a single file was picked up: a `~/` path matched as `/Zero/…`, which does
// not exist, and a folder was refused. So the run started without the intro
// and built around a guess. A `~/` path is now read from the home folder, and a
// folder inside the store goes with its files, within a cap. The store itself,
// the task folder and this product's documents are never sent this way: they
// travel by their own rules.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesNamedIn } from '../main/cloud/run.mjs';

let tmp; let home; let store; let account; let cwd; let docs;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'named-folder-')));
  home = path.join(tmp, 'home');
  store = path.join(home, 'Zero');
  account = path.join(store, 'accounts/acct');
  docs = path.join(account, 'agentbox');
  cwd = path.join(tmp, 'repo');
  for (const d of [docs, cwd]) fs.mkdirSync(d, { recursive: true });
  put(path.join(account, 'astral/videos/intro/index.html'), '<html>');
  put(path.join(account, 'astral/videos/intro/assets/music.mp3'), 'mp3');
  put(path.join(account, 'astral/videos/intro/.env'), 'SECRET=1');
  put(path.join(account, 'astral/videos/intro/node_modules/x/index.js'), 'x');
  put(path.join(docs, 'notes.md'), 'notes');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
function put(f, text) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }

const opts = () => ({ cwd, roots: [store], docs, home });
const intro = () => path.join(account, 'astral/videos/intro');

describe('what a request that names a folder sends', () => {
  it('sends the files of a folder named with ~/, leaving out hidden and installed ones', () => {
    const sent = filesNamedIn('The intro is already done at: ~/Zero/accounts/acct/astral/videos/intro/\n\nThe video opens with it.', opts());
    expect(sent.sort()).toEqual([path.join(intro(), 'assets/music.mp3'), path.join(intro(), 'index.html')]);
  });

  it('sends a single file named with ~/', () => {
    expect(filesNamedIn('see ~/Zero/accounts/acct/astral/videos/intro/index.html.', opts())).toEqual([path.join(intro(), 'index.html')]);
  });

  it('sends a folder named by its absolute path', () => {
    expect(filesNamedIn(`at ${intro()}`, opts())).toHaveLength(2);
  });

  it('does not send the store, the account, this product\'s documents or a folder holding the task folder', () => {
    expect(filesNamedIn(`${store} ${account} ${docs}/ ~/Zero`, opts())).toEqual([]);
    const inside = path.join(store, 'checkout');
    put(path.join(inside, 'a.txt'), 'a');
    expect(filesNamedIn(`${inside}`, { ...opts(), cwd: path.join(inside, 'sub') })).toEqual([]);
  });

  it('sends nothing from a folder over the cap, so the run asks for what it needs', () => {
    for (let i = 0; i < 5; i++) put(path.join(intro(), `frames/${i}.png`), 'png');
    expect(filesNamedIn(`${intro()}`, { ...opts(), folderCap: { files: 4, bytes: 1024 } })).toEqual([]);
  });

  it('reads ~/ from the home folder only, never a ~ in the middle of a word', () => {
    expect(filesNamedIn('see x~/Zero/accounts/acct/astral/videos/intro/index.html', opts())).toEqual([]);
  });
});
