// A PICTURE CLICKED OPEN SHOWS ITS NEWEST VERSION, NOT THE ONE OPENED BEFORE.
//
// What broke: an agent redrew a picture under the same name. The thread drew the
// new one, and a click on it opened the old one, so it looked as if the agent
// had changed nothing.
//
// Measured in Playwright's Chromium, a picture served no-store with
// crossOrigin="anonymous" as the app serves and draws it: open it as an <img>
// or `new Image()`, close it, replace the file (100 -> 300 wide), open it again
// at the same address. It drew 100 in all six combinations, and with
// `vary: *`, `no-cache, must-revalidate` and `max-age=0` too, because Chromium
// keeps one picture per address for the life of the page. A fetch() of the same
// address got 300, which is why the thread (FittedImg reads by fetch) was right
// and every viewer (which draw by address) was wrong. The same address with a
// query added drew 300.
//
// So each opening of a viewer asks under an address of its own.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pictureUrl, seenAt, opening } from '../renderer/src/picture.ts';
import { imgPath } from '../main/img-scheme.mts';
import { pathOfUrl } from '../renderer/src/cloud-files.ts';
import { phoneFileUrl } from '../renderer/src/phone-files.ts';

const read = (rel) => fs.readFileSync(new URL(`../renderer/src/${rel}`, import.meta.url), 'utf8');

describe('the address a viewer asks for', () => {
  const file = '/Users/x/Zero/p/designs/w-1/onboarding.png';

  it('differs between two openings of the same picture', () => {
    const a = seenAt(pictureUrl(file), opening());
    const b = seenAt(pictureUrl(file), opening());
    expect(a).not.toBe(b);
    expect(a.startsWith(pictureUrl(file))).toBe(true);
  });

  it('is the same for everything one opening draws, so its strip and stage share one read', () => {
    const at = opening();
    expect(seenAt(pictureUrl(file), at)).toBe(seenAt(pictureUrl(file), at));
  });

  it('keeps a look-again mark the thread already put on it', () => {
    const marked = seenAt(`${pictureUrl(file)}?look=2`, 7);
    expect(marked).toBe(`${pictureUrl(file)}?look=2&seen=7`);
  });

  it('leaves alone an address that is not the app’s own: a link, a blob, bytes', () => {
    for (const url of ['https://files.example/a.png?sig=abc', 'blob:http://localhost/123', 'data:image/png;base64,AAAA', '/f/key/img/a.png', '']) {
      expect(seenAt(url, 3)).toBe(url);
    }
  });

  it('still names the same file to the Mac, the phone and the web app', () => {
    const marked = seenAt(pictureUrl(file), 5);
    expect(imgPath(marked)).toBe(file);
    expect(pathOfUrl(marked)).toEqual({ file, kind: 'img' });
    expect(phoneFileUrl(marked, 'k').split('?')[0]).toBe(phoneFileUrl(pictureUrl(file), 'k'));
  });
});

describe('every viewer a click opens asks that way', () => {
  it('the full-screen viewer, for its stage and its strip', () => {
    const view = read('components/PictureView.tsx');
    expect(view).toMatch(/useState\(opening\)/);
    expect(view).toMatch(/decoded\(seenAt\(p\.url, at\)\)/);
    expect(view).toMatch(/decoded\(seenAt\(u, at\)\)/);
    expect(view).toMatch(/<img src=\{seenAt\(p\.url, at\)\}/);
  });

  it('the large viewer on the Mac', () => {
    const stage = read('components/ArtifactStage.tsx');
    expect(stage).toMatch(/useState\(opening\)/);
    expect(stage).toMatch(/<PictureStage url=\{seenAt\(url as string, at\)\}/);
  });

  it('the pane beside the thread', () => {
    const pane = read('components/DocPane.tsx');
    expect(pane).toMatch(/const pictureAt = useMemo\(\(\) => opening\(\), \[resolved\]\)/);
    expect(pane).toMatch(/src=\{seenAt\(pictureUrl\(resolved\), pictureAt\)\}/);
  });
});
