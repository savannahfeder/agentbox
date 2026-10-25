// ESC CLOSES A WEB PAGE YOU HAVE CLICKED INTO, ON THE FIRST PRESS.
//
// Found reading the blast radius of the website pane before it shipped, not
// from a report. The pane's own close mark says "Close this page (esc)", and
// from inside the page that was a press short of true.
//
// A keydown does not cross a document boundary, so the app never hears one
// from inside the pane and main forwards it. There are two forwarding paths
// and the new pane fell between them:
//
//   window.webContents before-input-event   hears the window's own frame
//                                           tree, so it hears an IFRAME. A
//                                           `<webview>` is a separate
//                                           WebContents, not a child frame,
//                                           so it is not heard here.
//   the webview branch                      heard it and sent
//                                           `zero:escape-browser`, a channel
//                                           built for the junk browser that
//                                           no renderer code has listened to
//                                           since that pane went. The key
//                                           landed nowhere.
//
// So Escape only moved the keyboard back to the app, and the SECOND press
// closed the pane.
//
// Measured in the running app while fixing it: with the guest holding the
// keyboard, `document.activeElement` in the app's own page is BODY, not the
// webview element. So the focus check cannot be the gate for a guest's key,
// and main says where the key came from instead. That check only ever
// existed to stop a key being answered twice when the window heard it too,
// which cannot happen for a guest.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { focusIsInTheFile, DOC_FRAME_CLASS } from '../renderer/src/doc-pane.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const held = (tagName, ...classes) => ({
  tagName,
  classList: { contains: (c) => classes.includes(c) },
});

describe('is the keyboard inside the page', () => {
  it('yes, in a file of ours drawn in a frame', () => {
    expect(focusIsInTheFile(held('IFRAME', DOC_FRAME_CLASS))).toBe(true);
  });

  it('yes, in a page off the web drawn in a browser of its own', () => {
    expect(focusIsInTheFile(held('WEBVIEW', DOC_FRAME_CLASS, 'doc-website-view'))).toBe(true);
  });

  it('no, when the app own page has it, which is the case that must not match', () => {
    // The ordinary Escape handler answers this one. If this ever returns true,
    // a single press is answered twice.
    expect(focusIsInTheFile(held('DIV', DOC_FRAME_CLASS))).toBe(false);
    expect(focusIsInTheFile(held('INPUT'))).toBe(false);
    expect(focusIsInTheFile(null)).toBe(false);
    expect(focusIsInTheFile(undefined)).toBe(false);
  });

  it('no, for a frame or a webview that is not the open document', () => {
    // Something else embedded on the page is not the pane, and Escape there
    // must not close a document she is not in.
    expect(focusIsInTheFile(held('IFRAME', 'some-other-frame'))).toBe(false);
    expect(focusIsInTheFile(held('WEBVIEW', 'some-other-view'))).toBe(false);
  });
});

describe('the key really gets out of the page', () => {
  const main = read('main/main.mjs');
  const app = read('renderer/src/App.tsx');

  it('says it came from a guest, so the focus check does not refuse it', () => {
    const webviewBranch = main.slice(main.indexOf("contents.getType() !== 'webview'"));
    expect(webviewBranch).toContain('fromGuest: true');
    expect(app).toContain('if (!k.fromGuest && !focusIsInTheFile(document.activeElement)) return;');
  });

  it('still checks focus for a key out of a frame, which the window also hears', () => {
    // Without this a single press in the app's own page is answered twice.
    expect(app).toContain('focusIsInTheFile(document.activeElement)');
    const frameBranch = main.slice(main.indexOf("window.webContents.on('before-input-event'"), main.indexOf("contents.getType() !== 'webview'"));
    expect(frameBranch).not.toContain('fromGuest');
  });

  it('comes up the one channel the renderer is listening on', () => {
    const webviewBranch = main.slice(main.indexOf("contents.getType() !== 'webview'"));
    expect(webviewBranch).toContain('zero:key-in-the-file');
  });

  it('no longer goes to the channel nothing listens to', () => {
    // `zero:escape-browser` was the junk browser's. Nothing in the renderer
    // has called onEscapeBrowser since that pane went, so a key sent there is
    // a key dropped. The comment beside the fix names the channel, which is
    // why this reads the code and not the prose.
    const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('zero:escape-browser');
  });
});
