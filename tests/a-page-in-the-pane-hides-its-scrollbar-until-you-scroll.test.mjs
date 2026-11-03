// A PAGE IN THE PANE DREW A WHITE SCROLLBAR DOWN ITS WHOLE RIGHT EDGE, 2026-10-05.
//
// Reported with a screenshot of a design page open beside a thread: "always
// visible and rather ugly. better to only be visible on like hover/movement of
// the area, and also more subtle. like no white background". The app's own
// scrollbars have been invisible at rest since styles.css said so, but a page
// in the pane is its own document and that stylesheet stops at the frame. With
// a mouse plugged in, macOS draws classic scrollbars, and a page that does not
// say it is dark gets the light ones: a white track 15 points wide with a grey
// thumb. Reproduced in Electron 43 on a dark page in a sandboxed frame, then
// gone once the frame was handed the style below. The small preview under a
// message had the same white strip; it runs with scripts off, where the main
// process cannot reach (measured: "Script not run"), so it is told not to
// scroll at all, which a picture of a page never needed to.
import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DOC_SCHEMES } from '../shared/schemes.mjs';
import {
  wantsQuietScrollbars, quietScrollbars, quietTheFramesScrollbars, AT_REST, SHOWN,
} from '../main/frame-scrollbars.mts';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

it('quiets the pages the app serves, under every name its scheme has had, and files', () => {
  for (const scheme of DOC_SCHEMES) {
    expect(wantsQuietScrollbars(`${scheme}://file/Users/x/designs/a.html`)).toBe(true);
  }
  expect(wantsQuietScrollbars('file:///Users/x/designs/a.html')).toBe(true);
});

it('leaves a running app and the web alone, and anything that is not a url', () => {
  expect(wantsQuietScrollbars('http://localhost:3000/')).toBe(false);
  expect(wantsQuietScrollbars('https://example.com/')).toBe(false);
  expect(wantsQuietScrollbars('about:blank')).toBe(false);
  expect(wantsQuietScrollbars('')).toBe(false);
  expect(wantsQuietScrollbars(undefined)).toBe(false);
  expect(wantsQuietScrollbars('not a url')).toBe(false);
});

it('has no track at all and no thumb at rest, and a thin soft thumb when shown', () => {
  expect(AT_REST).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/);
  expect(AT_REST).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*transparent/);
  expect(AT_REST).not.toMatch(/#fff|white/i);
  expect(SHOWN).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(/);
  expect(SHOWN).not.toMatch(/#fff|white/i);
});

it('loses to a page that styles its own scrollbars', () => {
  // Unlayered rules beat layered ones whatever the order, so a page that drew
  // its own scrollbars on purpose keeps them.
  expect(AT_REST.trim().startsWith('@layer')).toBe(true);
  expect(SHOWN.trim().startsWith('@layer')).toBe(true);
});

// A window just big enough for the script: one adopted sheet, its listeners,
// and a clock the test moves by hand.
function fakePage() {
  const listeners = {};
  class Sheet { replaceSync(text) { this.text = text; } }
  const page = {
    CSSStyleSheet: Sheet,
    innerWidth: 1000,
    document: { adoptedStyleSheets: [], documentElement: { clientWidth: 990 } },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    setTimeout: (fn, ms) => { page.timer = { fn, ms }; return 1; },
    clearTimeout: () => { page.timer = null; },
    fire: (type, event = {}) => (listeners[type] ?? []).forEach((fn) => fn(event)),
    tick: () => { const t = page.timer; page.timer = null; t?.fn(); },
    sheet: () => page.document.adoptedStyleSheets[0]?.text,
  };
  return page;
}

it('starts hidden, shows while the page scrolls, and goes once it stops', () => {
  const page = fakePage();
  quietScrollbars(page, AT_REST, SHOWN);
  expect(page.sheet()).toBe(AT_REST);
  page.fire('scroll');
  expect(page.sheet()).toBe(SHOWN);
  page.tick();
  expect(page.sheet()).toBe(AT_REST);
});

it('shows when the pointer comes to the right edge, and not in the middle of the page', () => {
  const page = fakePage();
  quietScrollbars(page, AT_REST, SHOWN);
  page.fire('mousemove', { clientX: 500 });
  expect(page.sheet()).toBe(AT_REST);
  page.fire('mousemove', { clientX: 985 });
  expect(page.sheet()).toBe(SHOWN);
  // It stays while the pointer rests there, so the thumb can be grabbed.
  expect(page.timer).toBeFalsy();
  page.fire('mousemove', { clientX: 500 });
  page.tick();
  expect(page.sheet()).toBe(AT_REST);
});

it('keeps the page own sheets and adds its own only once', () => {
  const page = fakePage();
  const theirs = { text: 'theirs' };
  page.document.adoptedStyleSheets = [theirs];
  quietScrollbars(page, AT_REST, SHOWN);
  quietScrollbars(page, AT_REST, SHOWN);
  expect(page.document.adoptedStyleSheets).toHaveLength(2);
  expect(page.document.adoptedStyleSheets).toContain(theirs);
});

function fakeContents() {
  const contents = new EventEmitter();
  contents.mainFrame = { url: 'file:///app/index.html', executeJavaScript: vi.fn(async () => {}) };
  return contents;
}
const fakeFrame = (url) => Object.assign(new EventEmitter(), { url, executeJavaScript: vi.fn(async () => {}) });

it('hands the style to a page frame as its document is ready', () => {
  const contents = fakeContents();
  quietTheFramesScrollbars(contents);
  const frame = fakeFrame(`${DOC_SCHEMES[0]}://file/Users/x/a.html`);
  contents.emit('frame-created', {}, { frame });
  frame.emit('dom-ready');
  expect(frame.executeJavaScript).toHaveBeenCalledTimes(1);
  expect(frame.executeJavaScript.mock.calls[0][0]).toContain('adoptedStyleSheets');
});

it('never touches the app window itself or a running app in the pane', () => {
  const contents = fakeContents();
  quietTheFramesScrollbars(contents);
  contents.emit('frame-created', {}, { frame: contents.mainFrame });
  const local = fakeFrame('http://localhost:3000/');
  contents.emit('frame-created', {}, { frame: local });
  local.emit('dom-ready');
  expect(contents.mainFrame.executeJavaScript).not.toHaveBeenCalled();
  expect(local.executeJavaScript).not.toHaveBeenCalled();
});

it('is wired to the app window', () => {
  expect(read('main/main.mjs')).toMatch(/quietTheFramesScrollbars\(window\.webContents\)/);
});

it('tells the small preview under a message not to scroll', () => {
  expect(read('renderer/src/components/ArtifactThumbnail.tsx')).toMatch(/<iframe[^>]*scrolling="no"/);
});
