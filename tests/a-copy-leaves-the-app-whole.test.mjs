// (hers, 2026-08-25).
//
// THREE FAULTS, ALL MEASURED IN A REAL ELECTRON WINDOW BEFORE ANY OF THIS WAS
// WRITTEN — the harness prints all of it.
//
// 1. The context menu offered "Copy Link" ABOVE "Copy". `params.linkURL` is set
// whenever the POINTER is over a link, whatever is selected, so on a draft with
// an address in it the first copy-shaped word in the menu threw her selection
// away and copied the href. She took it and pasted `mailto:hello@example.com`,
// which is what her card says.
//
//   2. A copy carried urls that only mean something inside this window:
//        <app>-img://file/…           the picture
//        file:///Users/you/Zero/…  the file a worker named
// Agentbox prefers the html flavour and resolves both, so pasting back into
// Agentbox looked perfect. Gmail prefers it too and resolves neither. Same
// for `copyImageAt`, which leaves ["text/html","image/png"] and lets the
// html win. That is the "inconsistent" she is describing.
//
//   3. Nothing styled an <a> inside the options strip, so Chromium's own
//      #0000EE took it: 1.97:1 against the app's ground, where the same link in
//      the message reads 8.03:1.
//
// The suite has no DOM, so these hold the wiring; the script above is the proof
// that the wiring does what it says.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the right-click menu', () => {
  const main = read('main/main.mjs');

  it('offers what she selected above anything about a link', () => {
    const copy = main.indexOf("{ label: 'Copy', accelerator: 'CommandOrControl+C'");
    const link = main.indexOf("label: 'Copy Link Address'");
    expect(copy).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(-1);
    expect(copy).toBeLessThan(link);
  });

  it('never says the bare word "Copy Link" again, which was the ambiguous one', () => {
    expect(main).not.toMatch(/label: 'Copy Link'/);
  });

  // "Clicking copy doesnt seem to actually copy it (links)" (hers, 2026-09-22,
  // w-b108b1d596). A `role:` in this menu is not a call: on macOS Electron's
  // own execute() bails before webContentsMethod for every native role, and
  // ships a bare Cocoa selector up the responder chain instead, holding no
  // reference to the window she right-clicked in. Measured in
  // Measured: that selector left a sentinel
  // untouched on the clipboard where contents.copy() copied the whole
  // selection. So no item in this menu may be built from a role.
  it('builds no item in this menu from a role, because a role is not a call', () => {
    // The comments in here quote the old wiring on purpose, so only the code is read.
    const menu = main.slice(main.indexOf("contents.on('context-menu'"), main.indexOf('Menu.buildFromTemplate(items).popup'))
      .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    expect(menu).not.toMatch(/role:\s*'/);
  });

  it('copies, cuts, pastes and selects on the contents the menu was raised on', () => {
    const menu = main.slice(main.indexOf("contents.on('context-menu'"), main.indexOf('Menu.buildFromTemplate(items).popup'));
    for (const call of ['contents.cut()', 'contents.paste()', 'contents.selectAll()']) {
      expect(menu).toContain(`click: () => ${call}`);
    }
    // Copy goes through copySelection on the same contents, which falls back to
    // the clicked words when the page's own copy lands nothing (w-f7d2841075).
    expect(menu).not.toContain('click: () => contents.copy()');
    expect(menu.match(/click: \(\) => copySelection\(contents, params\.selectionText, clipboard\)/g)).toHaveLength(2);
  });

  it('still draws ⌘C on Copy without claiming the key for a popup menu', () => {
    expect(main).toMatch(/label: 'Copy', accelerator: 'CommandOrControl\+C', registerAccelerator: false/);
  });

  it('copies a picture through copyPicture, not straight through copyImageAt', () => {
    expect(main).toMatch(/label: 'Copy Image', click: \(\) => copyPicture\(contents, params\)/);
  });
});

describe('a picture put on the clipboard', () => {
  const main = read('main/main.mjs');

  it('is written as the image and nothing else, so no html flavour can win', () => {
    expect(main).toMatch(/clipboard\.writeImage\(picture\)/);
  });

  it('is only ever read from a file the picture scheme would serve anyway', () => {
    const body = main.slice(main.indexOf('const copyPicture ='), main.indexOf('app.on(\'web-contents-created\''));
    expect(body).toMatch(/imgPath\(params\.srcURL\)/);
    expect(body).toMatch(/servable\(file, imageRoots\(\)\)/);
  });

  it('still falls back for a picture we do not serve, so http and data: keep working', () => {
    const body = main.slice(main.indexOf('const copyPicture ='), main.indexOf('app.on(\'web-contents-created\''));
    expect(body).toMatch(/contents\.copyImageAt\(params\.x, params\.y\)/);
  });
});

describe('a picture can be read back out of the window', () => {
  const main = read('main/main.mjs');
  const focus = read('renderer/src/components/Focus.tsx');

  // All three are needed together. Measured: without corsEnabled the <img>
  // never loads at all, and without crossOrigin the canvas throws SecurityError.
  it('has the scheme marked cors-enabled', () => {
    expect(main).toMatch(/IMG_SCHEMES\.map\(\(scheme\) => \(\{[\s\S]*?corsEnabled: true/);
  });

  it('sends the header that lets the window read its own picture', () => {
    expect(main).toMatch(/headers\.set\('access-control-allow-origin', '\*'\)/);
  });

  it('asks for every picture with crossOrigin', () => {
    const imgs = focus.match(/<img[^>]*pictureUrl|<img[^>]*candidates\[attempt\]/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const tag of focus.match(/<img[^/]*\/>/g) ?? []) {
      if (/pictureUrl|candidates\[attempt\]/.test(tag)) expect(tag).toMatch(/crossOrigin="anonymous"/);
    }
  });
});

describe('what a copied message carries out of the app', () => {
  const out = read('renderer/src/copy-out.ts');

  it('turns a picture into a data: uri, which every mail client understands', () => {
    expect(out).toMatch(/canvas\.toDataURL\('image\/png'\)/);
  });

  it('drops an <img> it cannot read rather than sending a dead url', () => {
    expect(out).toMatch(/copy\.replaceWith\(name \? document\.createTextNode\(name\)/);
  });

  it('unwraps a link to a path on this Mac into the words it was showing', () => {
    expect(out).toContain('`^(file|${ALL_SCHEMES.join(\'|\')}):`');
    expect(out).toMatch(/a\.replaceWith\(document\.createTextNode\(a\.textContent \?\? ''\)\)/);
  });

  it('leaves a copy from anywhere else in the app completely alone', () => {
    expect(out).toMatch(/if \(!within\.contains\(range\.commonAncestorContainer\)\) return;/);
    expect(out).toMatch(/if \(!selection \|\| selection\.isCollapsed/);
  });

  it('is attached to the box the message is drawn in', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/onCopy=\{\(e\) => handleCopyOut\(e\.nativeEvent as ClipboardEvent, bodyRef\.current\)\}/);
  });
});

describe('a link in the options strip', () => {
  const css = read('renderer/src/styles.css');

  it('is the app accent, like every other link, not Chromium default #0000EE', () => {
    // `.opt-peek` was the other half of this rule until w-2e13752a85 moved the
    // options onto the turn they were asked on: the hover card existed to show
    // the half of an option a DOCKED strip had to clip, and nothing in the
    // stream clips, so the card and its link went with it.
    expect(css).toMatch(/\.opt-text a \{ color: var\(--accent\); text-decoration: none; \}/);
  });

  it('is words rather than a door, because the row it sits in sends an answer', () => {
    expect(css).toMatch(/\.opt-row a \{ pointer-events: none; \}/);
  });
});

describe('the title of the thing she is reading', () => {
  const css = read('renderer/src/styles.css');

  it('can be selected, where the body sets user-select: none for everything', () => {
    expect(css).toMatch(/\.focus-title \{[^}]*user-select: text;[^}]*\}/);
  });
});

// She was right. The only file-shaped thing the menu could give her was "Copy
// Link Address" on a worker's `file://` link, which hands over thirteen
// folders of her home directory as words — the exact line her Gmail screenshot
// shows. And the chips under a message are buttons, so the menu saw no href
// and offered nothing on them at all.
//
// MEASURED, section 4 of that run: writing
// `public.file-url` leaves a real file reference on the pasteboard, which
// `osascript -e 'the clipboard as record'` reads back as «class furl», and
// which Finder, Mail and a browser paste as a file rather than as a path.
describe('a file she right-clicks', () => {
  const main = read('main/main.mjs');
  const focus = read('renderer/src/components/Focus.tsx');

  it('goes on the clipboard as the file itself, not as its address', () => {
    expect(main).toMatch(/clipboard\.writeBuffer\('public\.file-url', Buffer\.from\(pathToFileURL\(file\)\.toString\(\), 'utf8'\)\)/);
  });

  it('is only ever a file inside a root the app already owns', () => {
    const body = main.slice(main.indexOf('const copyFile = (file)'));
    expect(body.slice(0, body.indexOf('};'))).toMatch(/if \(!file \|\| !servable\(file, imageRoots\(\)\)\) return false;/);
  });

  it('is never a folder, because a folder is not what she pointed at', () => {
    expect(main).toMatch(/if \(!fs\.statSync\(file\)\.isFile\(\)\) return false;/);
  });

  it('sits above anything about the address, like the selection does', () => {
    const menu = main.slice(main.indexOf("contents.on('context-menu'"));
    expect(menu.indexOf("label: 'Copy File'")).toBeGreaterThan(-1);
    expect(menu.indexOf("label: 'Copy File'")).toBeLessThan(menu.indexOf("label: 'Copy Link Address'"));
  });

  it('is found under the pointer even when the thing there is a picture, not a link', () => {
    expect(main).toMatch(/elementFromPoint/);
    expect(main).toMatch(/closest\('\[data-copy-file\]'\)/);
  });

  it('is what the picture in the message says it is', () => {
    // It was the chip at the foot that carried this. That row is deleted
    // (w-38d7d32c88, 2026-09-23) and the drawing carries it instead, which is
    // the thing she is pointing at anyway.
    expect(focus).toMatch(/data-copy-file=\{\/\^https\?:\/\.test\(path\) \? undefined : path\}/);
  });
});
