// THE HOSTED PHONE DRAWS THE PICTURES, FILMS AND PAGES A THREAD NAMES.
//
// What she reported (2026-10-17): agentbox-phone.pages.dev showed no images,
// videos or pages. Measured with the site built from this branch: each project
// on the phone had an empty folder, so no path a message gave ever resolved,
// and the doors that read a file (readDoc, folderPictures, openArtifact)
// answered "not here".
//
// Now each project gets a stand-in folder shaped like the Mac's, every address
// the screens make under it is turned back into the file's key in the Mac's
// list, and from there into a link signed for an hour. Checked in Chrome at
// iPhone size against her real video thread: pictures drawn, both films ready
// to play, the folder grid drawn, the design page drawn with its pictures.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudPlaces, standIn, keyAt, findFile, pathOfUrl, pageForPhone, pageStyles, withStyles } from '../renderer/src/cloud-files.ts';
import { phoneView, phoneSlug } from '../renderer/src/cloud-bridge.ts';
import { pictureUrl } from '../renderer/src/picture.ts';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

const D = 'a1b2c3d4e5f6';
const n = (c) => `${c.repeat(64)}.png`;
const attached = (files, extra = {}) => ({ dir: '~/Zero/accounts/a/proj', repo: '~/code/proj', files, ...extra });
const thread = (item, updatedAt, a) => ({ device: D, project: 'proj', item, snapshot: { v: 3, item: { id: item, title: item, status: 'open', updatedAt }, history: [], attached: a } });

describe('where a project\'s files are on the phone', () => {
  it('stands in for the Mac\'s folder under a home of each computer\'s own', () => {
    expect(standIn(D, '~/Zero/accounts/a/proj')).toBe(`/home/phone-${D}/Zero/accounts/a/proj`);
    expect(standIn('f6e5d4c3b2a1', '~/Zero/accounts/a/proj')).not.toBe(standIn(D, '~/Zero/accounts/a/proj'));
    expect(standIn(D, null)).toBe('');
  });

  it('gives the screens that folder, so a path in a message finds its file', () => {
    const view = phoneView({ projects: [{ device: D, project: 'proj', name: 'Proj' }], threads: [thread('w-aaaaaaaaaa', 1, attached({ 'a.png': { n: n('a'), s: 1 } }))], commands: [] });
    expect(view.products[0]).toMatchObject({ dir: `/home/phone-${D}/Zero/accounts/a/proj`, repoPath: `/home/phone-${D}/code/proj` });
    const none = phoneView({ projects: [{ device: D, project: 'proj', name: 'Proj' }], threads: [thread('w-aaaaaaaaaa', 1, undefined)], commands: [] });
    expect(none.products[0].dir).toBe('');
  });

  it('takes the newest copy\'s word on a file, and no name that is not a file\'s', () => {
    const places = cloudPlaces([
      thread('w-old', 1, attached({ 'latest.html': { n: n('1'), s: 1 } })),
      thread('w-new', 2, attached({ 'latest.html': { n: n('2'), s: 1 }, 'x.png': { n: '../../etc/passwd', s: 1 } })),
    ], phoneSlug);
    const place = places.get(phoneSlug(D, 'proj'));
    expect(place.files.get('latest.html').n).toBe(n('2'));
    expect(place.files.has('x.png')).toBe(false);
  });
});

describe('an address the screens make', () => {
  const places = cloudPlaces([thread('w-aaaaaaaaaa', 1, attached({
    'designs/w-aaaaaaaaaa/quiet-1.png': { n: n('a'), s: 1 },
    '@repo/designs/logo.png': { n: n('b'), s: 1 },
    'designs/cut.mp4': { s: 99e6, big: true },
  }))], phoneSlug);
  const slug = phoneSlug(D, 'proj');
  const dir = places.get(slug).dir;

  it('is turned back into the file it asks for, under the documents folder or the code', () => {
    expect(pathOfUrl(pictureUrl(`${dir}/designs/w-aaaaaaaaaa/quiet 1.png`))).toEqual({ file: `${dir}/designs/w-aaaaaaaaaa/quiet 1.png`, kind: 'img' });
    expect(keyAt(places, `${dir}/designs/w-aaaaaaaaaa/quiet-1.png`)?.key).toBe('designs/w-aaaaaaaaaa/quiet-1.png');
    expect(keyAt(places, `/home/phone-${D}/code/proj/designs/logo.png`)?.key).toBe('@repo/designs/logo.png');
    expect(keyAt(places, `/home/phone-${D}/elsewhere/x.png`)).toBe(null);
    expect(pathOfUrl('https://example.com/a.png')).toBe(null);
  });

  it('a path as a message gives it is found where the Mac finds it, by name last', () => {
    expect(findFile(places, slug, 'designs/w-aaaaaaaaaa/quiet-1.png')?.key).toBe('designs/w-aaaaaaaaaa/quiet-1.png');
    expect(findFile(places, slug, '~/Zero/accounts/a/proj/designs/w-aaaaaaaaaa/quiet-1.png')?.key).toBe('designs/w-aaaaaaaaaa/quiet-1.png');
    expect(findFile(places, slug, 'logo.png')?.key).toBe('@repo/designs/logo.png');
    expect(findFile(places, slug, 'quiet-1.png')?.key).toBe('designs/w-aaaaaaaaaa/quiet-1.png');
    expect(findFile(places, slug, 'designs/cut.mp4')?.entry.big).toBe(true);
    expect(findFile(places, slug, 'nothing.png')).toBe(null);
    expect(findFile(places, 'other@ffffffffffff', 'logo.png')).toBe(null);
  });
});

describe('a page on the phone', () => {
  const links = { 'd/shots/1.png': 'https://cloud/1?token=t', 'd/cut.mp4': 'https://cloud/2?token=t', 'd/s.css': 'https://cloud/3?token=t', 'bg.png': 'https://cloud/4?token=t' };
  const page = (html) => pageForPhone(html, 'd/page.html', (k) => links[k] ?? null);

  it('points each file beside it at its link, keeping a film\'s start time', () => {
    expect(page('<img src="shots/1.png"><video src="cut.mp4#t=33"></video><link href="./s.css?v=2">'))
      .toBe('<img src="https://cloud/1?token=t"><video src="https://cloud/2?token=t#t=33"></video><link href="https://cloud/3?token=t">');
    expect(page('<div style="background:url(\'../bg.png\')"></div>')).toBe('<div style="background:url(\'https://cloud/4?token=t\')"></div>');
    expect(page('<img srcset="shots/1.png 1x, missing.png 2x">')).toBe('<img srcset="https://cloud/1?token=t 1x, missing.png 2x">');
  });

  it('leaves a site\'s address and a file it does not have as they were', () => {
    expect(page('<a href="https://example.com">x</a><img src="missing.png"><a href="#top">t</a>')).toBe('<a href="https://example.com">x</a><img src="missing.png"><a href="#top">t</a>');
  });

  it('puts a stylesheet of its own in the page, with the stylesheet\'s own files pointed at their links (Codex\'s review, finding 4)', () => {
    const html = '<link rel="stylesheet" href="css/s.css?v=1"><link href="https://fonts.example/x.css" rel="stylesheet"><p>x</p>';
    expect(pageStyles(html, 'd/page.html')).toEqual(['d/css/s.css']);
    const styles = new Map([['d/css/s.css', 'body{background:url("../bg2.png")} h1{background:url(https://x/y.png)}</style><script>']]);
    const out = withStyles(html, 'd/page.html', styles, (k) => (k === 'd/bg2.png' ? 'https://cloud/5?token=t' : null));
    expect(out).toBe('<style>body{background:url("https://cloud/5?token=t")} h1{background:url(https://x/y.png)}<\\/style><script></style><link href="https://fonts.example/x.css" rel="stylesheet"><p>x</p>');
    expect(withStyles('<link rel="stylesheet" href="gone.css">', 'd/page.html', new Map(), () => null)).toBe('');
  });

  it('keeps a stylesheet\'s media, and leaves out one for print, an alternative or one switched off (Codex\'s second review, finding 4)', () => {
    const styles = new Map([['d/a.css', 'a{}'], ['d/p.css', 'body{display:none}'], ['d/alt.css', 'b{}'], ['d/off.css', 'c{}']]);
    const html = '<link rel="stylesheet" href="a.css" media="(max-width: 600px)"><link rel="stylesheet" href="p.css" media="print"><link rel="alternate stylesheet" href="alt.css"><link rel="stylesheet" href="off.css" disabled>';
    expect(withStyles(html, 'd/page.html', styles, () => null)).toBe('<style media="(max-width: 600px)">a{}</style>');
  });

  it('runs no code of the page\'s own', () => {
    expect(page('<p>a</p><script>alert(1)</script><SCRIPT src="x.js"></SCRIPT><script src="y.js"/><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });
});

describe('the site\'s own rules', () => {
  it('lets films and sounds come from her cloud and a page be drawn from its copy, and no script but its own', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-site-'));
    const dist = path.join(dir, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'index.html'), '<html><head></head><body></body></html>');
    const configFile = path.join(dir, 'team.config.json');
    fs.writeFileSync(configFile, JSON.stringify({ url: 'https://abc.supabase.co', anonKey: 'public-key-0123456789abcdef' }));
    const { csp } = buildPhoneSite({ dist, out: path.join(dir, 'out'), configFile });
    expect(csp).toContain("media-src 'self' blob: https://abc.supabase.co");
    expect(csp).toContain('frame-src blob:');
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*(unsafe|blob|https)/);
  });
});
