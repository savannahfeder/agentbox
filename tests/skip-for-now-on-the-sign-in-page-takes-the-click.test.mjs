// "When I hit 'Skip for now' in the top-right corner, nothing happens"
// (2026-10-29, with a screenshot of the sign-in page over the inbox).
//
// The handler was fine. The press never reached the page. Electron builds one
// window drag region by walking the reported rectangles in document order,
// adding a drag one and subtracting a no-drag one. The sign-in page was the
// FIRST child of `.workspace-layout`, so its "Skip for now" (top 18px, no-drag)
// was subtracted first, and then `.topbar` (drag, the top ~94px) and
// `.workspace-layout::after` (drag, the top 40px, generated last) put it back.
// The click went to the window server as "move this window". The same trap as
// the tutorial's Skip (tests/her-way-out-of-the-walk-really-works.test.mjs).
//
// Headless Chrome cannot see `-webkit-app-region`, so this pins the order:
// every sign-in page is drawn at the end of <body>, after everything the app
// draws, and so its own rectangles are the last word on the window.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const css = read('renderer/src/team/sign-in.css').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  expect(at, `there is no ${sel} rule`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('the sign-in page is drawn after every drag strip in the window', () => {
  const uses = [...app.matchAll(/<SignInPage\b/g)].map((m) => m.index);

  it('is shown in three places: the ask, the phone and the cloud', () => {
    expect(uses).toHaveLength(3);
  });

  it('every one of them goes to the end of <body>, not inside the app', () => {
    for (const at of uses) {
      const before = app.slice(Math.max(0, at - 40), at);
      expect(before, app.slice(at, at + 80)).toMatch(/drawnIn\(\s*$/);
      const close = app.indexOf('/>', at);
      expect(app.slice(close, close + 30)).toMatch(/^\/>,\s*document\.body\)/);
    }
  });

  it('a page that drags the window, with Skip and the card cut out of it', () => {
    // These are what make the page's own rectangles right once they are last:
    // the whole window drags, and the two things you press do not.
    expect(rule('.si-page')).toMatch(/-webkit-app-region: drag/);
    expect(rule('.si-skip-corner')).toMatch(/-webkit-app-region: no-drag/);
    expect(rule('.si-card')).toMatch(/-webkit-app-region: no-drag/);
  });

  it('and the drag strips it has to beat are still there, so the order still matters', () => {
    expect(read('renderer/src/workspace-navigation.css')).toMatch(/\.workspace-layout::after \{[^}]*-webkit-app-region: drag/);
  });
});
