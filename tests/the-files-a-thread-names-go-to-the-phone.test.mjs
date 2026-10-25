// THE PICTURES, FILMS AND PAGES A THREAD NAMES GO TO THE PHONE WITH THE MAC SHUT.
//
// What she reported (2026-10-17): the hosted phone site could not show
// "images, videos, contents". Measured that morning with the site built from
// this branch against her real threads: every picture, film and design page
// an agent named drew as a bare path, because a thread's copy online was its
// words only and the files stayed on the Mac.
//
// Now the Mac uploads the files a thread names, inside that project's own
// folders and nowhere else, once each (named by what is in them), with the
// files a page draws from beside it, and lists them in the thread's copy.
// Checked against her real store: 845 files, 716 MB for a week of threads.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPhoneUploads, filesNamed, partsOf, keyOf } from '../main/phone-uploads.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';

const T = Date.UTC(2026, 9, 17, 18, 0);
let home; let docs; let repo; let outside;
const put = (file, data = 'x') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); return file; };
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const snap = (text, over = {}) => ({ v: 3, item: { id: 'w-aaaaaaaaaa', result: text, updatedAt: T, ...over }, history: [] });

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-files-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  repo = path.join(home, 'code', 'proj');
  outside = path.join(home, 'elsewhere');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
});

function uploader(over = {}) {
  const stored = new Map();
  const state = {};
  let now = T;
  const up = createPhoneUploads({
    backend: { async putPhoneFile({ name, data }) { stored.set(name, Buffer.from(data)); }, async dropPhoneFiles({ names }) { for (const n of names) stored.delete(n); } },
    owner: 'o', device: 'a1b2c3d4e5f6', state, save() {}, home, now: () => now, ...over,
  });
  return { up, stored, state, tick: (ms) => { now += ms; } };
}

describe('which files a thread names', () => {
  it('finds a bare name, a path from the project, one written from her home and one in quotes', () => {
    put(path.join(docs, 'designs', 'w-aaaaaaaaaa', 'quiet-1.png'));
    put(path.join(docs, 'designs', 'w-aaaaaaaaaa', 'cut.mp4'));
    put(path.join(docs, 'reports', 'week one.html'));
    put(path.join(repo, 'designs', 'logo.svg'));
    const text = `Three versions: quiet-1.png. The film:\n~/Zero/accounts/a/proj/designs/w-aaaaaaaaaa/cut.mp4\nNotes in "reports/week one.html", logo at designs/logo.svg.`;
    const keys = filesNamed(snap(text), { dir: docs, repoPath: repo, home }).map((f) => f.key).sort();
    expect(keys).toEqual(['@repo/designs/logo.svg', 'designs/w-aaaaaaaaaa/cut.mp4', 'designs/w-aaaaaaaaaa/quiet-1.png', 'reports/week one.html']);
  });

  // A spreadsheet and a text file go now (tests/every-kind-of-file-a-thread-
  // names-goes-to-the-phone), with their secrets taken out.
  it('never a file outside the project, through a link that leads out, under .git, or a key (Codex\'s second review, finding 1)', () => {
    put(path.join(outside, 'secret.png'));
    put(path.join(docs, '.git', 'shot.png'));
    put(path.join(docs, 'key.pem'));
    fs.symlinkSync(path.join(outside, 'secret.png'), path.join(docs, 'looks-inside.png'));
    const text = `${outside}/secret.png ../elsewhere/secret.png looks-inside.png .git/shot.png key.pem /etc/hosts.png`;
    expect(filesNamed(snap(text), { dir: docs, repoPath: repo, home })).toEqual([]);
  });

  it('reads what a page draws from beside it, not what it draws from a site', () => {
    expect(partsOf(`<img src="a/1.png"><video src="cut.mp4#t=33" poster='p.jpg'></video><img srcset="s.png 1x, s@2x.png 2x">
      <link href="style.css"><a href="https://x.com/y.png">x</a><img src="/abs.png"><img src="data:image/png;base64,AA"><style>body{background:url('bg.webp')}</style>`).sort())
      .toEqual(['a/1.png', 'bg.webp', 'cut.mp4', 'p.jpg', 's.png', 's@2x.png', 'style.css']);
  });

  it('a key is where the file is: under the documents folder, or @repo/ under the code', () => {
    expect(keyOf(path.join(docs, 'designs/a.png'), { docs, repo })).toBe('designs/a.png');
    expect(keyOf(path.join(repo, 'designs/a.png'), { docs, repo })).toBe('@repo/designs/a.png');
    expect(keyOf(path.join(outside, 'a.png'), { docs, repo })).toBe(null);
  });
});

describe('uploading them', () => {
  it('lists a file only once it is online, then by its name there', async () => {
    put(path.join(docs, 'designs', 'w-aaaaaaaaaa', 'a.png'), 'picture');
    const { up, stored, tick } = uploader();
    expect(up.manifest('t', snap('a.png'), { dir: docs, updatedAt: T, base: '1' })).toBe(null);
    await up.kick();
    expect([...stored.keys()]).toEqual([`${sha('picture')}.png`]);
    tick(6 * 60_000);
    expect(up.manifest('t', snap('a.png'), { dir: docs, updatedAt: T, base: '1' })).toEqual({ files: { 'designs/w-aaaaaaaaaa/a.png': { n: `${sha('picture')}.png`, s: 7 } } });
  });

  it('a page brings its pictures, films and stylesheet, and the stylesheet its own pictures', async () => {
    const d = path.join(docs, 'designs', 'w-aaaaaaaaaa');
    put(path.join(d, 'page.html'), '<link href="s.css"><img src="shots/1.png"><video src="cut.mp4#t=3"></video><img src="../../../../../elsewhere/x.png">');
    put(path.join(d, 's.css'), 'body { background: url(bg.png) }');
    put(path.join(d, 'shots', '1.png'), '1'); put(path.join(d, 'cut.mp4'), 'film'); put(path.join(d, 'bg.png'), 'bg');
    put(path.join(outside, 'x.png'), 'no');
    const { up, tick } = uploader();
    up.manifest('t', snap('designs/w-aaaaaaaaaa/page.html'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    tick(6 * 60_000);
    const { files } = up.manifest('t', snap('designs/w-aaaaaaaaaa/page.html'), { dir: docs, updatedAt: T, base: '1' });
    expect(Object.keys(files).sort()).toEqual(['bg.png', 'cut.mp4', 'page.html', 's.css', 'shots/1.png'].map((f) => `designs/w-aaaaaaaaaa/${f}`).sort());
  });

  it('the same file named twice goes up once; a file over the bound is listed as too big', async () => {
    put(path.join(docs, 'a.png'), 'same'); put(path.join(docs, 'b.png'), 'same');
    put(path.join(docs, 'big.mp4'), Buffer.alloc(2048));
    const { up, stored, tick } = uploader({ limits: { fileBytes: 1024, threadBytes: 1e9, totalBytes: 1e9, files: 60, days: 7 } });
    up.manifest('t', snap('a.png b.png big.mp4'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    expect(stored.size).toBe(1);
    tick(6 * 60_000);
    const { files } = up.manifest('t', snap('a.png b.png big.mp4'), { dir: docs, updatedAt: T, base: '1' });
    expect(files['a.png'].n).toBe(files['b.png'].n);
    expect(files['big.mp4']).toEqual({ s: 2048, big: true });
  });

  it('a page changed under the same words goes up again under its new name', async () => {
    const page = put(path.join(docs, 'latest.html'), 'one');
    const { up, stored, tick } = uploader();
    up.manifest('t', snap('latest.html'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    fs.writeFileSync(page, 'two!');
    fs.utimesSync(page, new Date(), new Date(Date.now() + 5000));
    tick(6 * 60_000);
    up.manifest('t', snap('latest.html'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    tick(6 * 60_000);
    expect(up.manifest('t', snap('latest.html'), { dir: docs, updatedAt: T, base: '1' }).files['latest.html'].n).toBe(`${sha('two!')}.html`);
    expect(stored.size).toBe(2);
  });

  it('a thread not touched for a week sends none; the space for all of them is never passed', async () => {
    put(path.join(docs, 'a.png'), 'aaaa'); put(path.join(docs, 'b.png'), 'bbbb');
    const { up, stored } = uploader({ limits: { fileBytes: 1e9, threadBytes: 1e9, totalBytes: 6, files: 60, days: 7 } });
    expect(up.manifest('old', snap('a.png'), { dir: docs, updatedAt: T - 8 * 24 * 3600_000, base: '1' })).toBe(null);
    expect(up.pending()).toBe(0);
    up.manifest('t', snap('a.png b.png'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    expect(stored.size).toBe(1);
  });

  it('never a file named for a secret, and a text file goes with its keys hidden (Codex\'s review, finding 1)', async () => {
    put(path.join(docs, 'credentials.md'), 'password: hunter2');
    put(path.join(docs, '.env.html'), 'x');
    const key = 'sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; // a made-up key, to prove it is hidden. public-check: allow
    put(path.join(docs, 'notes.md'), `The key is ${key} and the folder ${home}/x`);
    const { up, stored } = uploader();
    expect(filesNamed(snap('credentials.md .env.html notes.md'), { dir: docs, home }).map((f) => f.key)).toEqual(['notes.md']);
    up.manifest('t', snap('notes.md'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    const [sent] = [...stored.values()].map(String);
    expect(sent).not.toContain(key);
    expect(sent).not.toContain(home);
  });

  it('a file swapped for a link out of the project after it was checked does not go (Codex\'s review, finding 2)', async () => {
    const file = put(path.join(docs, 'a.png'), 'mine');
    put(path.join(outside, 'secret.png'), 'not mine');
    const { up, stored } = uploader();
    up.manifest('t', snap('a.png'), { dir: docs, updatedAt: T, base: '1' });
    fs.rmSync(file);
    fs.symlinkSync(path.join(outside, 'secret.png'), file);
    await up.kick();
    expect(stored.size).toBe(0);
  });

  it('a page too big to read is listed but not read for what it draws (Codex\'s review, finding 3)', async () => {
    put(path.join(docs, 'big.html'), `<img src="x.png">${' '.repeat(3 * 1024 * 1024)}`);
    put(path.join(docs, 'x.png'), 'x');
    const { up } = uploader();
    up.manifest('t', snap('big.html'), { dir: docs, updatedAt: T, base: '1' });
    expect(up.pending()).toBe(1);
  });

  it('a long thread\'s bound keeps its newest messages\' files, each page with its own', async () => {
    put(path.join(docs, 'old.png'), 'o');
    put(path.join(docs, 'new.html'), '<video src="film.mp4"></video>');
    put(path.join(docs, 'film.mp4'), 'f');
    put(path.join(docs, 'newer.png'), 'n');
    const s = { v: 3, item: { id: 'w-aaaaaaaaaa', result: 'newer.png', updatedAt: T }, history: [{ ts: 1, source: 'agent', patch: { result: 'old.png' } }, { ts: 2, source: 'agent', patch: { result: 'new.html' } }] };
    const { up, tick } = uploader({ limits: { fileBytes: 1e9, threadBytes: 1e9, totalBytes: 1e9, files: 3, days: 7 } });
    up.manifest('t', s, { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    tick(6 * 60_000);
    expect(Object.keys(up.manifest('t', s, { dir: docs, updatedAt: T, base: '1' }).files)).toEqual(['newer.png', 'new.html', 'film.mp4']);
  });

  it('a refused upload rests the uploader for half an hour instead of reading every file again to be refused again', async () => {
    put(path.join(docs, 'a.png'), 'a'); put(path.join(docs, 'b.png'), 'b');
    let tries = 0;
    let refuse = true;
    const { up, tick } = uploader({ backend: { async putPhoneFile() { tries += 1; if (refuse) throw new Error('Bucket not found'); }, async dropPhoneFiles() {} } });
    up.manifest('t', snap('a.png b.png'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    expect(tries).toBe(1);
    tick(10 * 60_000);
    up.manifest('t', snap('a.png b.png'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    expect(tries).toBe(1);
    refuse = false;
    tick(25 * 60_000);
    await up.kick();
    expect(tries).toBe(3);
  });

  it('nothing goes up once she has signed out', async () => {
    put(path.join(docs, 'a.png'));
    const { up, stored } = uploader({ alive: () => false });
    up.manifest('t', snap('a.png'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    expect(stored.size).toBe(0);
  });

  it('a file no thread has named for three days is deleted', async () => {
    put(path.join(docs, 'a.png'), 'a');
    const { up, stored, tick } = uploader();
    up.manifest('t', snap('a.png'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    tick(2 * 24 * 3600_000);
    expect(await up.sweep()).toBe(0);
    tick(2 * 24 * 3600_000);
    expect(await up.sweep()).toBe(1);
    expect(stored.size).toBe(0);
  });
});

describe('the thread\'s copy', () => {
  it('carries what went up and where the project is, written from her home', async () => {
    put(path.join(docs, 'designs', 'w-aaaaaaaaaa', 'a.png'), 'pic');
    const sent = [];
    const stored = new Map();
    let now = T;
    const row = { id: 'w-aaaaaaaaaa', title: 't', status: 'open', result: 'Here: a.png', createdAt: T, updatedAt: T };
    const inbox = createPhoneInbox({
      backend: {
        async putPhoneProject() {}, async dropPhoneThreads() {}, async dropPhoneProject() {},
        async putPhoneThreads(d, p, batch) { sent.push(...batch); },
        async waitingPhoneCommands() { return []; }, async claimPhoneCommand() { return null; }, async markPhoneCommand() {},
        async putPhoneFile({ name, data }) { stored.set(name, data); }, async dropPhoneFiles() {},
      },
      owner: 'o', device: 'a1b2c3d4e5f6', home, now: () => now,
      projects: () => [{ slug: 'p', name: 'P', dir: docs, repoPath: repo }],
      listItems: () => [row], historyOf: () => [], apply: async () => ({}),
      stateFile: path.join(home, 'state.json'),
    });
    await inbox.syncOnce();
    expect(sent[0].snapshot.attached).toBeUndefined();
    await inbox.filesSettled();
    sent.length = 0;
    now += 6 * 60_000;
    await inbox.syncOnce();
    expect(sent[0].snapshot.attached).toEqual({ dir: '~/Zero/accounts/a/proj', repo: '~/code/proj', files: { 'designs/w-aaaaaaaaaa/a.png': { n: `${sha('pic')}.png`, s: 3 } } });
    expect(stored.size).toBe(1);
  });

  it('what went up stays known after the app restarts, so nothing goes up twice', async () => {
    put(path.join(docs, 'a.png'), 'pic');
    const stored = [];
    const row = { id: 'w-aaaaaaaaaa', title: 't', status: 'open', result: 'a.png', createdAt: T, updatedAt: T };
    const make = () => createPhoneInbox({
      backend: {
        async putPhoneProject() {}, async dropPhoneThreads() {}, async dropPhoneProject() {}, async putPhoneThreads() {},
        async waitingPhoneCommands() { return []; }, async claimPhoneCommand() { return null; }, async markPhoneCommand() {},
        async putPhoneFile({ name }) { stored.push(name); }, async dropPhoneFiles() {},
      },
      owner: 'o', device: 'a1b2c3d4e5f6', home, now: () => T,
      projects: () => [{ slug: 'p', name: 'P', dir: docs }],
      listItems: () => [row], historyOf: () => [], apply: async () => ({}),
      stateFile: path.join(home, 'state.json'),
    });
    const first = make();
    await first.syncOnce();
    await first.filesSettled();
    const again = make();
    await again.syncOnce();
    await again.filesSettled();
    expect(stored).toEqual([`${sha('pic')}.png`]);
  });
});
