// A DROPDOWN NEVER FLOATS ON THE BLACK GROUND.
//
// Found on the summary panel's Visible to menu (2026-10-01, w-41ff964775).
// The rule: in this theme every dropdown sits on the same grey as the new
// thread card's menus, and none is drawn in the window's black.
//
// The new thread card's menus were already a grey (#363431). Every older menu
// painted itself `var(--bg)`, the window's own near-black, so it read as a
// hole cut in the window rather than a card above it. There is one token now,
// `--pop`, read by every menu. It is the window ground by default, which is
// what those menus already were, so no other theme moved.
//
// `--pop` is declared in the base token block (a look may only override a
// token both themes already define, which tests/skin-choice.test.mjs pins) and
// resolves to the window ground everywhere but here.
//
// This test is the fence: a menu added later that paints itself var(--bg)
// fails here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const styles = read('styles.css');
const nav = read('workspace-navigation.css');
const pages = read('threads/pages.css');
const composer = read('threads/thread-composer.css');
const summary = read('threads/summary.css');

/** Every rule whose selector names a menu or a popover, with its declarations. */
function popovers(css, file) {
  const out = [];
  const re = /(^|\})\s*([^{}@]*?(?:menu|-pop)[^{}]*?)\s*\{([^}]*)\}/gims;
  let m;
  while ((m = re.exec(css))) {
    const [, , selector, body] = m;
    if (!/background\s*:/.test(body)) continue;
    // Rows, heads, labels and separators sit INSIDE a menu; they are not the
    // floating surface and are allowed their own washes.
    if (/-row|-head|-label|-item|-none|-find|-rule|-sep|-anchor|-key|-wide|svg|input/i.test(selector)) continue;
    out.push({ file, selector: selector.trim().replace(/\s+/g, ' '), body });
  }
  return out;
}

const all = [
  ...popovers(styles, 'styles.css'),
  ...popovers(nav, 'workspace-navigation.css'),
  ...popovers(pages, 'threads/pages.css'),
  ...popovers(composer, 'threads/thread-composer.css'),
  ...popovers(summary, 'threads/summary.css'),
];

describe('the colour a dropdown floats on', () => {
  it('finds the menus, so this test is not passing on an empty list', () => {
    expect(all.length).toBeGreaterThanOrEqual(8);
  });

  it('never paints one with the window ground', () => {
    const black = all
      .filter((r) => /background\s*:\s*var\(--bg\)/.test(r.body))
      .map((r) => `${r.file} ${r.selector}`);
    expect(black).toEqual([]);
  });

  // Every floating menu in the app, by name, so they move together and a new
  // one has somewhere obvious to be added.
  it('reads the one token on each of them', () => {
    const surfaces = [
      [styles, '.slash-menu'], [styles, '.prio-menu'], [styles, '.when-menu'],
      [styles, '.proj-menu'], [styles, '.repeat-menu'], [styles, '.set-picker-menu'],
      [nav, '.instr-scope-menu'], [nav, '.instruction-restore-menu'],
      [pages, '.th-menu'], [pages, '.th-pop'],
    ];
    const offTheToken = surfaces.filter(([css, sel]) => {
      // The rule itself, which starts a line: `.dock-card .when-menu {` is a
      // position, not a surface, and matching it would read the wrong body.
      const at = css.search(new RegExp(`^\\${sel} \\{`, 'm'));
      const body = css.slice(at, css.indexOf('}', at));
      return at < 0 || !/background\s*:\s*var\(--pop\)/.test(body);
    }).map(([, sel]) => sel);
    expect(offTheToken).toEqual([]);
  });

  it('is the window ground by default, and this grey in ember-grid', () => {
    const base = styles.slice(styles.indexOf(':root {'));
    expect(base.slice(0, base.indexOf('\n}'))).toMatch(/--pop:\s*var\(--bg\)/);
    const ember = styles.slice(styles.indexOf(':root[data-skin="ember-grid"] {'));
    expect(ember.slice(0, ember.indexOf('\n}'))).toMatch(/--pop:\s*#363431/);
    // Three declarations and no more: light and dark both answer it (every
    // colour token must, tests/theme-tokens.test.mjs), and this one look
    // overrides it. A fourth would be a second answer nobody asked for.
    expect(styles.match(/^\s*--pop:/gm)?.length ?? 0).toBe(3);
  });

  it('keeps the new thread card and the older menus on the same grey', () => {
    expect(composer).toMatch(/--tc-pop:\s*var\(--pop\)/);
  });

  // On a grey menu a grey selected row is the same colour as the menu. Both
  // menus answer the pointer and the keyboard with a film of light instead.
  it('shows where the pointer and the keyboard are, on that grey', () => {
    expect(styles).toMatch(/\.prio-menu-row\.cursor \{ background: var\(--wash-strong\)/);
    expect(summary).toMatch(/\.ts-menu \.prio-menu-row:hover[^}]*var\(--wash-strong\)/);
  });
});
