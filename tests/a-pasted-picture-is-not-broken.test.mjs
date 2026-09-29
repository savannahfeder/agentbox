// (hers, 2026-08-23).
//
// The cause, measured in a real Electron window before any of this was written:
// a pasted screenshot goes to disk the moment it is pasted, so the thumbnail
// carries a path rather than bytes and was drawn as `<img src="file:///…">`.
// Her Agentbox runs from the dev server, and an http page may not load a file://
// picture. Same picture, same window settings:
//
//   page at file:///…            naturalWidth 788
//   page at http://127.0.0.1/…   naturalWidth 0, "Not allowed to load local
//                                 resource: file:///…"
//
// So no picture in the window is a file:// url any more. This holds the two
// halves of that: the renderer asks on the app's own scheme, and the app hands
// back only pictures, only from folders it owns.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imgUrl, imgPath, servable, IMG_SCHEME } from '../main/img-scheme.mjs';
import { DOC_SCHEME } from '../shared/schemes.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the url a picture is asked for on', () => {
  it('is the app scheme, not file://', () => {
    expect(imgUrl('/Users/x/.staging/pasted-1.png'))
      .toBe(`${IMG_SCHEME}://file/Users/x/.staging/pasted-1.png`);
  });

  it('survives a filename with a space, a hash or a question mark in it', () => {
    for (const name of ['a picture.png', 'shot #2.png', 'why?.png', 'café.png']) {
      const url = imgUrl(`/Users/x/${name}`);
      expect(imgPath(url)).toBe(`/Users/x/${name}`);
    }
  });

  it('refuses anything that is not an absolute path', () => {
    expect(imgUrl('attachments/pasted-1.png')).toBe(null);
    expect(imgPath('https://example.com/x.png')).toBe(null);
    expect(imgPath(`${DOC_SCHEME}://file/Users/x/a.png`)).toBe(null);
  });

  it('normalises a climb written into the url away', () => {
    expect(imgPath(`${IMG_SCHEME}://file/Users/x/attachments/../../../etc/hosts`)).toBe('/etc/hosts');
  });
});

describe('what the app agrees to hand back', () => {
  const roots = ['/Users/x/Store/accounts/acct', '/Users/x/code/zero'];

  it('serves a staged paste and a worker screenshot', () => {
    expect(servable('/Users/x/Store/accounts/acct/.staging/mt5-pasted-8.png', roots)).toBe(true);
    expect(servable('/Users/x/Store/accounts/acct/agentbox/attachments/a.jpeg', roots)).toBe(true);
    expect(servable('/Users/x/code/zero/shots/first-run/beat-3.png', roots)).toBe(true);
  });

  it('serves pictures and nothing else, whatever folder it is in', () => {
    expect(servable('/Users/x/Store/accounts/acct/zero.config.json', roots)).toBe(false);
    expect(servable('/Users/x/code/zero/main/main.mjs', roots)).toBe(false);
    expect(servable('/Users/x/Store/accounts/acct/notes.md', roots)).toBe(false);
  });

  it('stays inside the folders the app owns', () => {
    expect(servable('/Users/x/Library/Keychains/login.keychain.png', roots)).toBe(false);
    expect(servable('/etc/hosts.png', roots)).toBe(false);
    // /a/bc is not inside /a/b.
    expect(servable('/Users/x/code/zero-other/shot.png', roots)).toBe(false);
  });

  it('opens nothing at all when the app has not said what it owns yet', () => {
    expect(servable('/Users/x/Store/accounts/acct/.staging/a.png', [])).toBe(false);
  });
});

describe('the window never builds a file:// picture again', () => {
  it('draws a staged paste on the scheme', () => {
    const attach = read('renderer/src/components/AttachRow.tsx');
    expect(attach).toContain('pictureUrl(a.srcPath)');
    expect(attach).not.toContain('`file://${a.srcPath}`');
  });

  it('draws a picture inside a message on the scheme', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('roots.map((r) => pictureUrl(`${r}/${rel}`))');
    expect(focus).not.toContain('roots.map((r) => `file://${r}/${rel}`)');
  });

  it('is registered before the app is ready, or it is not a standard scheme', () => {
    const main = read('main/main.mjs');
    expect(main).toContain('IMG_SCHEMES.map((scheme) => ({');
    expect(main).toContain('for (const scheme of IMG_SCHEMES) protocol.handle(scheme');
    // The handler asks the store every time, so a project made after launch is
    // not a folder of broken pictures.
    expect(main).toContain('servable(file, imageRoots())');
  });
});
