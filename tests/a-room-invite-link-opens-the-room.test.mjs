// A ROOM INVITE LINK OPENS THE ROOM, AND NOTHING ELSE DOES (w-3d0fa23ffb, 2026-10-20).
//
// Rooms are joined from a link: the web address people share, the app's own
// scheme that page opens, or the link pasted into Find rooms. Measured on the
// parsing rule, and on main/main.mjs's text: only the installed app takes the
// scheme (run from source it would point every link on the Mac at a
// checkout's Electron), and a link that arrives before the window is up is
// held for it rather than dropped.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tokenFromLink, joinLink, JOIN_SCHEME } from '../shared/room-links.mjs';
import { nameSlug } from '../shared/product-name.mjs';

const TOKEN = '3f9c2a7be41d4c0f9a8e2b6d1c5f7a90';

describe('what counts as an invite link', () => {
  it('the web address, the app scheme, and the token itself', () => {
    expect(tokenFromLink(joinLink(TOKEN))).toBe(TOKEN);
    expect(tokenFromLink(`https://${nameSlug}.ac/join/${TOKEN}/`)).toBe(TOKEN);
    expect(tokenFromLink(`${JOIN_SCHEME}://join/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromLink(`  ${TOKEN}  `)).toBe(TOKEN);
    expect(tokenFromLink(`${joinLink(TOKEN)}?utm=x`)).toBe(TOKEN);
  });

  it('anything else is not', () => {
    expect(tokenFromLink('')).toBeNull();
    expect(tokenFromLink(null)).toBeNull();
    expect(tokenFromLink('short')).toBeNull();
    expect(tokenFromLink(`https://${nameSlug}.ac/terms`)).toBeNull();
    expect(tokenFromLink(`${JOIN_SCHEME}://open/${TOKEN}`)).toBeNull();
    expect(tokenFromLink(`https://x.test/join/${TOKEN}/../../etc`)).toBeNull();
    expect(tokenFromLink('a token with spaces in it that is long')).toBeNull();
  });

  it('the scheme is the app’s own name, read from one place', () => {
    expect(JOIN_SCHEME).toBe(nameSlug);
  });
});

describe('the app takes the link', () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'main.mjs'), 'utf8');
  it('only the installed app registers the scheme', () => {
    expect(main).toMatch(/if \(app\.isPackaged\) app\.setAsDefaultProtocolClient\(JOIN_SCHEME\)/);
    expect(main.match(/setAsDefaultProtocolClient/g)).toHaveLength(1);
  });
  // Codex's review of the build: a link sent while the window was still
  // starting reached no listener and was gone. The window asks for it.
  it('a link is held until the window takes it, and handed over once', () => {
    expect(main).toMatch(/app\.on\('open-url'/);
    const opened = main.slice(main.indexOf('function openJoinLink'), main.indexOf('function openJoinLink') + 500);
    expect(opened).toMatch(/pendingJoin = token;/);
    expect(main).toMatch(/ipcMain\.handle\('zero:take-join', \(\) => \{ const token = pendingJoin; pendingJoin = null; return token; \}\)/);
  });
});
