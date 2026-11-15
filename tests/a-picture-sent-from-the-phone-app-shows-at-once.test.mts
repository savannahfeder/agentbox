// A PICTURE SENT FROM THE PHONE APP SHOWS AT ONCE (w-9f9c2570e2, 2026-10-27).
//
// The web app draws a picture you just sent from its own bytes until the next
// read signs its link (1f45b416). The phone app held a grey box for up to five
// seconds instead, because the link map had nothing for the new file until the
// next read. `drawFromBytes` now puts the bytes in as a data address with
// `until: 0`, so the next read still asks for the real link.
import { describe, it, expect } from 'vitest';
import { drawFromBytes } from '../mobile/src/lib/files';
import { fileOnPhone, objectsToSign } from '../renderer/src/phone-links';

const HASH = 'a'.repeat(64);
const sent = [{ rel: `phone-files/${HASH}.png`, name: 'shot.png', image: true }];

describe('a picture you just sent', () => {
  it('is drawn from its own bytes before its link arrives', () => {
    const links = new Map();
    expect(fileOnPhone(new Map(), links, 'p', `phone-files/${HASH}.png`).ok).toBe(false);
    expect(drawFromBytes(links, sent, [{ dataBase64: 'iVBORw0KGgo=' }])).toBe(true);
    const at = fileOnPhone(new Map(), links, 'p', `phone-files/${HASH}.png`);
    expect(at).toMatchObject({ ok: true, link: 'data:image/png;base64,iVBORw0KGgo=' });
  });

  it('still asks for its real link on the next read', () => {
    const links = new Map();
    drawFromBytes(links, sent, [{ dataBase64: 'iVBORw0KGgo=' }]);
    const commands = [{ device: 'dev1', taken_at: null, payload: { text: `look\n\n![shot.png](phone-files/${HASH}.png)` } }];
    expect(objectsToSign(new Map(), commands, links, 'me')).toEqual([`me/dev1/${HASH}.png`]);
  });

  it('never replaces a real link, and leaves files that are not pictures alone', () => {
    const links = new Map([[`${HASH}.png`, { url: 'https://signed', until: Date.now() + 1e6 }]]);
    expect(drawFromBytes(links, sent, [{ dataBase64: 'AAAA' }])).toBe(false);
    expect(links.get(`${HASH}.png`).url).toBe('https://signed');
    const notes = new Map();
    expect(drawFromBytes(notes, [{ rel: `phone-files/${HASH}.txt` }], [{ dataBase64: 'aGk=' }])).toBe(false);
    expect(notes.size).toBe(0);
  });
});
