// A click outside ⌘K closes it, including a click in the top of the window.
//
// What broke: "when I click out of it, I can't really do that" (w-30e94db8cf).
// The backdrop has closed the box on a click since it was written, and in
// headless Chromium every click outside it closes it
// (scripts/scratch/time-keys.mjs, five spots round the box). In the app the
// top 94 points are `.topbar`, a window drag region, and the 40-point
// `.workspace-layout::after` strip lies over the whole width. Electron builds
// the native drag region from the page's rectangles IN ORDER, adding each
// draggable one and cutting each no-drag one, and macOS hands a press inside it
// to the window, not the page. The backdrop said nothing, and the strip is the
// last child of the frame ⌘K is drawn in, so it was reported after the box and
// won over it. Headless Chrome has no app regions at all, so this is read off
// the source.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const styles = bare(read('styles.css'));
const navCss = bare(read('workspace-navigation.css'));
const app = read('App.tsx');
const palette = read('components/Palette.tsx');

const rules = (css, sel) => {
  const out = [];
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'g');
  for (let m; (m = re.exec(css));) out.push(m[2]);
  return out.join('\n');
};

it('the backdrop closes the box on a click and the box itself does not', () => {
  expect(palette).toMatch(/palette-backdrop[^"`]*[`"]\}? onClick=\{onClose\}/);
  expect(palette).toMatch(/className=\{`modal palette[^}]*\}[^>]*onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
});

it('the backdrop cuts itself out of the window drag region', () => {
  expect(rules(styles, '.modal-backdrop.palette-backdrop')).toMatch(/-webkit-app-region:\s*no-drag/);
});

it('the backdrop is drawn after the top bar, so its cut comes after the bar and wins', () => {
  const bar = app.indexOf('<header className="topbar"');
  const box = app.indexOf('<Palette');
  expect(bar).toBeGreaterThan(-1);
  expect(box).toBeGreaterThan(bar);
});

it('the strip drawn after the box stands down while the box is open', () => {
  expect(rules(navCss, '.workspace-layout::after')).toMatch(/-webkit-app-region:\s*drag/);
  expect(rules(navCss, '.workspace-layout:has(> .palette-backdrop)::after')).toMatch(/-webkit-app-region:\s*no-drag/);
});

it('and only while it is open: no other window gives up the strip', () => {
  const standsDown = [...navCss.matchAll(/([^{}]*)::after\s*\{[^}]*-webkit-app-region:\s*no-drag/g)].map((m) => m[1].trim());
  expect(standsDown).toEqual(['.workspace-layout:has(> .palette-backdrop)']);
});
