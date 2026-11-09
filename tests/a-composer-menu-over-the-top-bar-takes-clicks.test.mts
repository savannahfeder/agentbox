// The project menu in the new thread card rose far enough to lie over the top
// bar, and Reorder and the rows under it took no press and lagged under the
// mouse (w-b4e97f344e, 2026-10-02, the second report, after the menu had
// already been kept out of the title bar band). `.topbar` is a window drag
// region about 94 points tall. A drag region in Electron is a native region on
// the window, not a CSS effect, and painting a menu over it changes nothing:
// macOS takes the press as "move the window" and the page is never told.
//
// Electron builds that region by walking the reported rectangles IN ORDER,
// adding each draggable one and cutting each no-drag one
// (shell/browser/ui/drag_util.mm). So the menu and the card say no-drag, and
// the card is drawn after the top bar, so the cut lands after the bar's rect
// and wins. The one drag strip drawn after everything, `.workspace-layout::after`,
// is shorter than the menus' top limit, so it cannot put the bar back over
// them. Headless Chrome has no app regions at all, which is why this is read
// off the source rather than clicked.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const composerCss = bare(read('threads/thread-composer.css'));
const navCss = bare(read('workspace-navigation.css'));
const app = read('App.tsx');

/** Every declaration block for exactly this selector, joined. */
const rules = (css, sel) => {
  const out = [];
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'g');
  for (let m; (m = re.exec(css));) out.push(m[2]);
  return out.join('\n');
};

it('a composer menu cuts itself out of the window drag region', () => {
  expect(rules(composerCss, '.tc-menu')).toMatch(/-webkit-app-region:\s*no-drag/);
});

it('so does the card, for a short window that puts its top under the bar', () => {
  expect(rules(composerCss, '.tc-card')).toMatch(/-webkit-app-region:\s*no-drag/);
});

it('the card is drawn after the top bar, so its cut comes after the bar and wins', () => {
  const bar = app.indexOf('<header className="topbar"');
  const card = app.indexOf('<ThreadComposer');
  expect(bar).toBeGreaterThan(-1);
  expect(card).toBeGreaterThan(bar);
});

it('the drag strip drawn last stops above where a menu may reach', () => {
  const strip = rules(navCss, '.workspace-layout::after');
  const height = Number(strip.match(/height:\s*(\d+)px/)[1]);
  const fit = read('keep-in-window.ts');
  const top = Number(fit.match(/const TOP = (\d+) \+ EDGE/)[1]) + Number(fit.match(/const EDGE = (\d+)/)[1]);
  expect(height).toBeLessThanOrEqual(top);
});
