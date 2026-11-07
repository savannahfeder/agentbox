// A PICTURE SENT FROM THE WEB APP SHOWS AT ONCE, NEVER "MISSING IMAGE".
//
// What broke (the founder, sending a screenshot from the web app on an iPhone,
// 2026-10-26): "when I sent that image it says 'missing image' for the first 5s
// or so". The reply is drawn the moment it is sent, naming the picture as
// phone-files/<hash>.png, but the web app asks the database for that file's
// link only on its next read, up to five seconds later. Until then the picture
// tried addresses that could not answer, gave up, and said "missing image".
// Now the picture just sent is drawn from its own bytes until its link comes,
// and a sent picture with no link yet holds its place instead of saying missing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { linkForFile, fileOnPhone, objectsToSign } from '../renderer/src/phone-links';
import { setPictureLinks, sentPictureLink, pictureLinksVersion, pictureLinksChanged, onPictureLinks } from '../renderer/src/picture';

const NAME = `${'ab'.repeat(32)}.png`;
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe('a picture held here until its link comes', () => {
  it('is drawn from the bytes just sent, and asked to be signed like any other', () => {
    const links = new Map([[NAME, { url: 'blob:https://web.example/1', until: 0 }]]);
    expect(linkForFile(new Map(), links, `phone-files/${NAME}`)).toBe('blob:https://web.example/1');
    expect(fileOnPhone(new Map(), links, 'p@0a1b2c3d4e5f', `phone-files/${NAME}`)).toMatchObject({ ok: true, link: 'blob:https://web.example/1', sent: true });
    const waiting = [{ id: 'c1', device: '0a1b2c3d4e5f', project: 'p', item: 'w-1', kind: 'reply', payload: { text: `![shot](phone-files/${NAME})` }, created_at: '', taken_at: null, outcome: null }];
    expect(objectsToSign(new Map(), waiting, links, 'me')).toEqual([`me/0a1b2c3d4e5f/${NAME}`]);
  });

  it('is what the web app keeps for each file it sends', () => {
    const bridge = read('../renderer/src/cloud-bridge.ts');
    expect(bridge).toMatch(/URL\.createObjectURL\(new Blob\(\[/);
    expect(bridge).toMatch(/links\.set\(name, \{ url: URL\.createObjectURL\(/);
    expect(bridge).toMatch(/pictureLinksChanged\(\)/);
  });
});

describe('a sent picture on a page with links', () => {
  it('says whether its link is here, and nothing on a page without links', () => {
    setPictureLinks(null);
    expect(sentPictureLink(`phone-files/${NAME}`)).toBeUndefined();
    setPictureLinks((f) => (f.endsWith(NAME) ? 'https://x.example/signed' : null));
    expect(sentPictureLink(`phone-files/${NAME}`)).toBe('https://x.example/signed');
    expect(sentPictureLink(`phone-files/${'cd'.repeat(32)}.png`)).toBeNull();
    expect(sentPictureLink('designs/a.png')).toBeUndefined();
    setPictureLinks(null);
  });

  it('is drawn again when links arrive', () => {
    let heard = 0;
    const off = onPictureLinks(() => { heard += 1; });
    const was = pictureLinksVersion();
    pictureLinksChanged();
    expect(pictureLinksVersion()).toBe(was + 1);
    expect(heard).toBe(1);
    off();
    pictureLinksChanged();
    expect(heard).toBe(1);
  });

  it('holds its place while it waits, rather than saying missing', () => {
    const focus = read('../renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/useSyncExternalStore\(onPictureLinks, pictureLinksVersion, pictureLinksVersion\)/);
    expect(focus).toMatch(/const sent = sentPictureLink\(src\);/);
    expect(focus).toMatch(/if \(sent === null\) return <span className="inline-image arriving" aria-hidden="true" \/>;/);
  });
});
