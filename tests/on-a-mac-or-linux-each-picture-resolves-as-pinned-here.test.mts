// ON A MAC OR LINUX EACH PICTURE RESOLVES AS PINNED HERE.
//
// The Windows picture fix (on-windows-a-picture-or-document-opens-from-its-drive)
// runs through code a Mac and Linux run too, and it was written on a Windows
// computer where neither can be tried. So each input below was run through
// main at 174d82f3 as a Mac runs it, the main process with `path` bound to
// path.posix and the window's own lines from Focus.tsx, DocText.tsx and
// ArtifactStage.tsx, and its answers are written in as they came out. The same
// inputs go through the branch with the window told it is not on Windows and
// the main process told darwin, then linux, and must come out the same, byte
// for byte, a throw included.

import { describe, it, expect } from 'vitest';
import { imgUrl, imgPath, servable, IMG_SCHEME } from '../main/img-scheme.mts';
import { docUrl, docPath, DocGrants, DOC_SCHEME } from '../main/doc-scheme.mts';
import { fileBeside, pictureUrl, wholeMediaPath, wholePicturePath } from '../renderer/src/picture.ts';

const IMG = `${IMG_SCHEME}://file`;
const DOC = `${DOC_SCHEME}://file`;
const THROWS = { throws: 'URIError' };
const outcome = (fn) => { try { return fn(); } catch (e) { return { throws: e.constructor.name }; } };
const NOT_WINDOWS = false;

// [the picture it names, the page folder, the file, the url drawn, the file a Mac opens]
const BESIDE = [
  ['pic.png', '/Users/me/dir', '/Users/me/dir/pic.png', `${IMG}/Users/me/dir/pic.png`, '/Users/me/dir/pic.png'],
  ['pic.png', '/Users/me/my dir', '/Users/me/my%20dir/pic.png', `${IMG}/Users/me/my%2520dir/pic.png`, '/Users/me/my%20dir/pic.png'],
  ['pic.png', '/Users/me/C# notes', '/Users/me/pic.png', `${IMG}/Users/me/pic.png`, '/Users/me/pic.png'],
  ['pic.png', '/Users/me/what? now', '/Users/me/pic.png', `${IMG}/Users/me/pic.png`, '/Users/me/pic.png'],
  ['pic.png', '/Users/me/100% done', '/Users/me/100%%20done/pic.png', `${IMG}/Users/me/100%25%2520done/pic.png`, '/Users/me/100%%20done/pic.png'],
  ['pic.png', '/Users/me/café', '/Users/me/caf%C3%A9/pic.png', `${IMG}/Users/me/caf%25C3%25A9/pic.png`, '/Users/me/caf%C3%A9/pic.png'],
  ['pic.png', '/home/me/my dir', '/home/me/my%20dir/pic.png', `${IMG}/home/me/my%2520dir/pic.png`, '/home/me/my%20dir/pic.png'],
  ['a b.png', '/Users/me/dir', '/Users/me/dir/a%20b.png', `${IMG}/Users/me/dir/a%2520b.png`, '/Users/me/dir/a%20b.png'],
  ['a%20b.png', '/Users/me/dir', '/Users/me/dir/a%20b.png', `${IMG}/Users/me/dir/a%2520b.png`, '/Users/me/dir/a%20b.png'],
  ['é.png', '/Users/me/dir', '/Users/me/dir/%C3%A9.png', `${IMG}/Users/me/dir/%25C3%25A9.png`, '/Users/me/dir/%C3%A9.png'],
  ['100%.png', '/Users/me', '/Users/me/100%.png', `${IMG}/Users/me/100%25.png`, '/Users/me/100%.png'],
  ['../shots/a.png', '/Users/me/dir', '/Users/me/shots/a.png', `${IMG}/Users/me/shots/a.png`, '/Users/me/shots/a.png'],
  ['../shots/a.png', '/Users/me/C# notes', '/Users/shots/a.png', `${IMG}/Users/shots/a.png`, '/Users/shots/a.png'],
  ['./a.png', '/Users/me/dir', '/Users/me/dir/a.png', `${IMG}/Users/me/dir/a.png`, '/Users/me/dir/a.png'],
  ['sub/a#1.png', '/Users/me/dir', '/Users/me/dir/sub/a', `${IMG}/Users/me/dir/sub/a`, '/Users/me/dir/sub/a'],
  ['a?.png', '/Users/me/dir', '/Users/me/dir/a', `${IMG}/Users/me/dir/a`, '/Users/me/dir/a'],
];

// [what a message names, as a picture, as a film or voice note, the file a Mac opens]
const WHOLE = [
  ['/Users/x/a.png', '/Users/x/a.png', '/Users/x/a.png', '/Users/x/a.png'],
  ['/Users/x/a b.png', '/Users/x/a b.png', '/Users/x/a b.png', '/Users/x/a b.png'],
  ['/home/x/a.png', '/home/x/a.png', '/home/x/a.png', '/home/x/a.png'],
  ['file:///Users/x/a.png', '/Users/x/a.png', null, '/Users/x/a.png'],
  ['file:///Users/x/a%20b.png', '/Users/x/a b.png', null, '/Users/x/a b.png'],
  ['file:///Users/x/a%zz.png', THROWS, null, null],
  ['file:///C:/x/a.png', '/C:/x/a.png', null, '/C:/x/a.png'],
  ['/C:/x/a.png', '/C:/x/a.png', '/C:/x/a.png', '/C:/x/a.png'],
  ['C:/x.png', null, null, null],
  ['C:\\x.png', null, null, null],
  ['C:a.png', null, null, null],
  ['attachments/a.png', null, null, null],
  ['./a.png', null, null, null],
  ['/Users/x/clip.mp4', '/Users/x/clip.mp4', '/Users/x/clip.mp4', '/Users/x/clip.mp4'],
  ['file:///Users/x/clip.mp4', '/Users/x/clip.mp4', null, '/Users/x/clip.mp4'],
  ['file:///Users/x/a%20b.m4a', '/Users/x/a b.m4a', null, '/Users/x/a b.m4a'],
  ['C:\\x\\clip.mp4', null, null, null],
];

// [the path, the url drawn]
const DRAWN = [
  ['/Users/x/.staging/a b#1?.png', `${IMG}/Users/x/.staging/a%20b%231%3F.png`],
  ['/Users/x/100%.png', `${IMG}/Users/x/100%25.png`],
  ['/home/x/a\\b.png', `${IMG}/home/x/a%5Cb.png`],
  ['/C:/x/a.png', `${IMG}/C%3A/x/a.png`],
  ['C:\\x.png', 'C:\\x.png'],
  ['C:/x.png', 'C:/x.png'],
  ['attachments/a.png', 'attachments/a.png'],
  ['https://example.com/a.png', 'https://example.com/a.png'],
  ['', ''],
];

// [the call, what it is given, its answer]
const MAIN_PROCESS = [
  ['imgUrl', '/Users/x/.staging/a b#1?.png', `${IMG}/Users/x/.staging/a%20b%231%3F.png`],
  ['docUrl', '/Users/x/.staging/a b#1?.png', `${DOC}/Users/x/.staging/a%20b%231%3F.png`],
  ['imgUrl', '/home/x/p/page.html', `${IMG}/home/x/p/page.html`],
  ['docUrl', '/home/x/p/page.html', `${DOC}/home/x/p/page.html`],
  ['imgUrl', '/home/x/a\\b.png', `${IMG}/home/x/a%5Cb.png`],
  ['docUrl', '/home/x/a\\b.png', `${DOC}/home/x/a%5Cb.png`],
  ['imgUrl', 'C:\\Users\\me\\shot.png', null],
  ['docUrl', 'C:\\Users\\me\\shot.png', null],
  ['imgUrl', 'C:/x.png', null],
  ['docUrl', 'C:/x.png', null],
  ['imgUrl', 'attachments/a.png', null],
  ['docUrl', 'attachments/a.png', null],
  ['imgUrl', '/', `${IMG}/`],
  ['docUrl', '/', `${DOC}/`],
  ['imgPath', `${IMG}/Users/x/a%20b.png`, '/Users/x/a b.png'],
  ['docPath', `${DOC}/Users/x/a%20b.png`, '/Users/x/a b.png'],
  ['imgPath', `${IMG}/Users/x/attachments/../../../etc/hosts`, '/etc/hosts'],
  ['docPath', `${DOC}/Users/x/attachments/../../../etc/hosts`, '/etc/hosts'],
  ['imgPath', `${IMG}/C:/x/a.png`, '/C:/x/a.png'],
  ['docPath', `${DOC}/C:/x/a.png`, '/C:/x/a.png'],
  ['imgPath', `${IMG}/C%3A/x/a.png`, '/C:/x/a.png'],
  ['docPath', `${DOC}/C%3A/x/a.png`, '/C:/x/a.png'],
  ['imgPath', `${IMG}/Users/x/a%zz.png`, null],
  ['docPath', `${DOC}/Users/x/a%zz.png`, null],
  ['imgPath', `${IMG}/Users/x/%2e%2e/%2e%2e/etc/hosts`, '/etc/hosts'],
  ['docPath', `${DOC}/Users/x/%2e%2e/%2e%2e/etc/hosts`, '/etc/hosts'],
  ['imgPath', `${IMG}/Users/x/a%2fb.png`, '/Users/x/a/b.png'],
  ['docPath', `${DOC}/Users/x/a%2fb.png`, '/Users/x/a/b.png'],
  ['servable', '/Users/me/x.png', ['/Users/me'], true],
  ['servable', '/users/me/x.png', ['/Users/me'], false],
  ['servable', '/Users/meX/x.png', ['/Users/me'], false],
  ['servable', '/x.png', ['/'], false],
  ['servable', '/Users/me/x.txt', ['/Users/me'], false],
  ['servable', 'C:\\x.png', ['C:\\'], false],
  ['servable', '/Users/me/a/../x.png', ['/Users/me/a'], false],
  ['grants', '/Users/me/dir/page.html', '/Users/me/dir/a.png', true],
  ['grants', '/Users/me/dir/page.html', '/users/me/dir/a.png', false],
  ['grants', '/Users/me/dir/page.html', '/Users/me/dirX/a.png', false],
  ['grants', '/page.html', '/shots/a.png', false],
  ['grants', 'C:\\page.html', 'C:\\shots\\a.png', false],
];

const opens = (url) => outcome(() => imgPath(url, 'darwin'));

describe('a picture a page names beside itself, drawn by a window not on Windows', () => {
  it.each(BESIDE)('%s in %s', (from, folder, file, drawn, mac) => {
    expect(outcome(() => fileBeside(from, folder, NOT_WINDOWS))).toEqual(file);
    const url = outcome(() => pictureUrl(fileBeside(from, folder, NOT_WINDOWS), NOT_WINDOWS));
    expect(url).toEqual(drawn);
    expect(opens(url)).toEqual(mac);
  });
});

describe('a whole path a message names, drawn by a window not on Windows', () => {
  it.each(WHOLE)('%s', (src, picture, media, mac) => {
    const whole = outcome(() => wholePicturePath(src, NOT_WINDOWS));
    expect(whole).toEqual(picture);
    expect(outcome(() => wholeMediaPath(src, NOT_WINDOWS))).toEqual(media);
    expect(typeof whole === 'string' ? opens(pictureUrl(whole, NOT_WINDOWS)) : null).toEqual(mac);
  });
});

describe('a path the window draws, not on Windows', () => {
  it.each(DRAWN)('%s', (file, drawn) => {
    expect(pictureUrl(file, NOT_WINDOWS)).toBe(drawn);
  });
});

describe('the main process', () => {
  const call = {
    imgUrl: (platform, file) => imgUrl(file, platform),
    docUrl: (platform, file) => docUrl(file, platform),
    imgPath: (platform, url) => imgPath(url, platform),
    docPath: (platform, url) => docPath(url, platform),
    servable: (platform, file, roots) => servable(file, roots, platform),
    grants: (platform, page, file) => { const g = new DocGrants(8, platform); g.grant(page); return g.allows(file); },
  };
  for (const platform of ['darwin', 'linux']) {
    it.each(MAIN_PROCESS)(`on ${platform}, %s %s`, (fn, ...rest) => {
      const answer = rest.pop();
      expect(call[fn](platform, ...rest)).toEqual(answer);
    });
  }
});
