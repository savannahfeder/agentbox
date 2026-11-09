// A SHARED PAGE CARRIES ITS OWN PICTURES, AND NOTHING FROM OUTSIDE ITS FOLDER.
//
// Shareable files (w-d7e61eb261): a page an agent made usually names pictures
// beside it (designs/w-1/index.html with shot.png), and the copy on the web has
// no folder beside it, so main/file-link.mts puts them inside the page. The
// danger is the other way: a page that names ../../.ssh/id_rsa, or a link that
// points out of the folder, would put a private file on a public page.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileForLink, linkKindOf, linkSource, linkAddress, linkCopyOf, LINK_MAX_BYTES } from '../main/file-link.mts';

let dir, page;
const write = (rel, data) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-link-'));
  write('secret.txt', 'KEY');
  write('secret.png', 'PNGSECRET');
  write('designs/w-1/shot.png', 'PNG');
  write('designs/w-1/parts/look.css', 'body{background:url(bg.png)}');
  write('designs/w-1/bg.png', 'BG');
  page = path.join(dir, 'designs/w-1/index.html');
});

describe('a page', () => {
  it('carries the pictures, styles and scripts in its own folder', () => {
    write('designs/w-1/app.js', 'console.log(1)');
    fs.writeFileSync(page, `<link rel="stylesheet" href="parts/look.css"><img src="shot.png"><img src='./shot.png?v=2'><script src="app.js"></script><div style="background:url('bg.png')"></div>`);
    const out = fileForLink(page);
    expect(out).toMatchObject({ kind: 'page', type: 'text/html' });
    expect(out.body).toContain(`src="data:image/png;base64,${Buffer.from('PNG').toString('base64')}"`);
    expect(out.body).toContain(`src='data:image/png;base64,${Buffer.from('PNG').toString('base64')}'`);
    expect(out.body).toContain('href="data:text/css;base64,');
    expect(out.body).toContain('src="data:text/javascript;base64,');
    expect(out.body).toContain(`url('data:image/png;base64,${Buffer.from('BG').toString('base64')}')`);
  });

  it('leaves anything outside its folder as it was', () => {
    fs.writeFileSync(page, `<img src="../../secret.png"><img src="/etc/passwd.png"><img src="..%2F..%2Fsecret.png"><a href="../../secret.txt">x</a>`);
    const out = fileForLink(page);
    expect(out.body).not.toContain(Buffer.from('PNGSECRET').toString('base64'));
    expect(out.body).not.toContain(Buffer.from('KEY').toString('base64'));
    expect(out.body).toContain('src="../../secret.png"');
  });

  it('does not follow a link inside its folder that points out of it', () => {
    fs.symlinkSync(path.join(dir, 'secret.png'), path.join(dir, 'designs/w-1/sneaky.png'));
    fs.writeFileSync(page, `<img src="sneaky.png">`);
    expect(fileForLink(page).body).toBe('<img src="sneaky.png">');
  });

  it('leaves web addresses, data and anchors alone', () => {
    const html = `<img src="https://x.test/a.png"><img src="data:image/png;base64,AA"><a href="#top">t</a><link rel="icon" href="//cdn.test/i.png">`;
    fs.writeFileSync(page, html);
    expect(fileForLink(page).body).toBe(html);
  });
});

describe('what can be shared', () => {
  it('names each kind a link draws, and nothing else', () => {
    expect(linkKindOf('a.md')).toEqual({ kind: 'markdown', type: 'text/markdown' });
    expect(linkKindOf('A.HTML')).toEqual({ kind: 'page', type: 'text/html' });
    expect(linkKindOf('s.jpeg')).toEqual({ kind: 'image', type: 'image/jpeg' });
    expect(linkKindOf('r.pdf')).toEqual({ kind: 'pdf', type: 'application/pdf' });
    expect(linkKindOf('f.mkv')).toBeNull();
    expect(linkKindOf('t.xlsx')).toBeNull();
  });
  it('sends a picture as base64 and a document as its words', () => {
    expect(fileForLink(path.join(dir, 'designs/w-1/shot.png')).body).toBe(Buffer.from('PNG').toString('base64'));
    expect(fileForLink(write('plan.md', '# Plan\n')).body).toBe('# Plan\n');
  });
  it('refuses a file over the limit, and takes one at it', () => {
    expect(fileForLink(write('big.png', Buffer.alloc(LINK_MAX_BYTES + 1))).error).toMatch(/too big/);
    expect(fileForLink(write('edge.png', Buffer.alloc(LINK_MAX_BYTES))).kind).toBe('image');
  });
  it('says so when the file has gone', () => {
    expect(fileForLink(path.join(dir, 'gone.md')).error).toMatch(/not on this computer/);
  });
});

// Update link on q1-roadmap.md put q1-roadmap-v2.md, which she had never
// opened, on an investor's page (power test, round 3, 2026-11-04).
describe('the copy a link carries', () => {
  it('is the file on screen, by its own name and version, whatever newer version sits beside it', () => {
    const v1 = write('deck/plan.md', 'one');
    write('deck/plan-v2.md', 'two');
    expect(linkCopyOf(v1)).toMatchObject({ name: 'plan.md', version: 1, body: 'one' });
    expect(linkCopyOf(path.join(dir, 'deck/plan-v2.md'))).toMatchObject({ name: 'plan-v2.md', version: 2, body: 'two' });
  });
});

it('keeps one link per file of a thread, at an address on the site', () => {
  expect(linkSource('agentbox-team', 'w-1', 'plan.md')).toBe('agentbox-team/w-1/plan.md');
  expect(linkSource('p', 't', 'x'.repeat(500))).toHaveLength(400);
  expect(linkAddress('https://app.agentbox.ac/', 'abc')).toBe('https://app.agentbox.ac/f/abc');
});
