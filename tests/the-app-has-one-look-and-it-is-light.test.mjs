// THE APP HAS ONE LOOK, AND IT IS LIGHT (w-9e434e8671).
//
// The app shipped light, dark, Match my system and twenty-odd picture themes,
// chosen from Settings, from Command-K and from a step in the walk. The
// decision was to get rid of the themes for simplicity and keep only today's
// light, with the brand orange as its accent everywhere. Measured before the
// change: four ways to change the look (Settings' Themes page, the Command-K
// rows, the theme picker, the walk's `look` step), a dark token block, 230
// picture and dark rules in styles.css alone, and 24 MB of pictures.
//
// So this pins the whole of it: nothing offers another look, nothing reads a
// stored one, the stylesheet has no rule that could only match under one, the
// accent is the orange, and the window opens on the light frame's own colour.
// A walk saved on the old picker step still resumes, at the screen after it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, N_BEATS, STEPS, nextStep, readFirstRun } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const cssFiles = (() => {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push(p);
    }
  })('renderer/src');
  return out;
})();
// Selectors only, with comments taken out, so a sentence about the old themes
// in a comment is not mistaken for a rule.
const selectorsOf = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? [];
const rootBlock = () => read('renderer/src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '').match(/^:root\s*\{([\s\S]*?)^\}/m)[1];
const token = (name) => rootBlock().match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();

describe('nothing offers another look', () => {
  it('has no theme, picture or look-switch module and no theme picker', () => {
    for (const f of ['renderer/src/theme.ts', 'renderer/src/skins.ts', 'renderer/src/look-switch.ts',
      'renderer/src/components/ThemePicker.tsx', 'renderer/src/components/MatchMark.tsx']) {
      expect(exists(f), f).toBe(false);
    }
  });

  it('has no Themes page in Settings, and an old link to it opens General', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).not.toMatch(/\['appearance',\s*'Themes'\]/);
    expect(settings).not.toMatch(/pane === 'appearance'/);
    expect(settings).toMatch(/want === 'themes' \|\| want === 'appearance'\) return 'general'/);
  });

  it('has no theme rows in Command-K', () => {
    const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code('renderer/src/palette-rows.ts')).not.toMatch(/lookRows|Themes…|Switch to (dark|light)/);
    expect(code('renderer/src/components/Palette.tsx')).not.toMatch(/lookRows|onThemes|onSetLook/);
  });

  it('reads no stored theme or picture at boot or in the window', () => {
    for (const f of ['renderer/src/main.tsx', 'renderer/src/App.tsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/zero\.theme|zero\.skin|THEME_KEY|SKIN_KEY|applyTheme|applySkin/);
    }
  });
});

describe('the walk has no picker step', () => {
  it('goes from the last introduction slab straight to the hand-off', () => {
    expect(STEPS).not.toContain('look');
    expect(nextStep('goal')).toBe('hand');
  });

  it('counts seventeen beats with no gap where the picker was', () => {
    expect(N_BEATS).toBe(17);
    expect(BEAT.goal).toBe(6);
    expect(BEAT.hand).toBe(7);
    expect(Math.max(...Object.values(BEAT))).toBe(N_BEATS);
  });

  it('resumes a walk saved on the old picker step at the hand-off', () => {
    const store = (step) => ({ getItem: () => JSON.stringify({ step }), setItem() {}, removeItem() {} });
    expect(readFirstRun(store('look')).step).toBe('hand');
    // Either side of it is untouched.
    expect(readFirstRun(store('goal')).step).toBe('goal');
    expect(readFirstRun(store('hand')).step).toBe('hand');
  });
});

describe('the stylesheet has only the light look', () => {
  it('has no rule that could only match under dark, a picture or Match my system', () => {
    const dead = /\[data-skin|\[data-theme="dark"\]|:not\(\[data-theme="light"\]\)|\[data-machine|\[data-look-switching/;
    for (const f of cssFiles) {
      const hits = selectorsOf(read(f)).filter((s) => dead.test(s));
      expect(hits, f).toEqual([]);
    }
  });

  it('scopes nothing to light, because light is always on', () => {
    for (const f of cssFiles) {
      expect(selectorsOf(read(f)).filter((s) => s.includes('[data-theme="light"]')), f).toEqual([]);
    }
  });

  it('ships no theme pictures', () => {
    const assets = fs.readdirSync(path.join(root, 'renderer/src/assets'));
    expect(assets.filter((a) => a.endsWith('.webp'))).toEqual([]);
    expect(assets).not.toContain('look-thumbs');
    expect(assets).not.toContain('look-tiles');
  });
});

describe('the brand orange is the accent', () => {
  it('is Ember Grid’s orange, not the old blue', () => {
    expect(token('--accent').toLowerCase()).toBe('#ee6018');
    expect(rootBlock()).not.toMatch(/#3b7dfb|59,\s*125,\s*251/i);
  });

  it('is worn by the selected-row bar, the asks-you chip and link underlines', () => {
    expect(token('--select-bar')).toBe('var(--accent)');
    expect(token('--chip-ask')).toBe('var(--accent)');
    expect(token('--underline').replace(/\s/g, '')).toBe('rgba(238,96,24,0.45)');
  });

});

// EMBER GRID'S TYPE, ONE TO ONE. Asked for after the first build kept Light's
// Avenir Next body. Measured on the built app against the build before this
// change wearing Ember Grid: all 63 text elements on the inbox and Settings
// matched in family, size, weight and letter-spacing. These are the rules that
// produce that, copied from Ember's block at Ember's specificity.
describe('the type is Ember Grid’s, exactly', () => {
  const nav = () => read('renderer/src/workspace-navigation.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('sets the body in Geist with Ember’s fallbacks, and the labels in Geist Mono', () => {
    const css = read('renderer/src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\nbody \{[^}]*font-family: 'Geist', 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif;/);
    expect(token('--mono')).toBe(`'Geist Mono', ui-monospace, "SF Mono", Menlo, monospace`);
  });

  it('carries the five weight and spacing rules Ember set, at Ember’s specificity', () => {
    for (const rule of [
      ':root:root .set-title { font-weight: 400; letter-spacing: -0.035em; }',
      ':root:root .idle-zero { font-weight: 400; }',
      ':root:root .workspace-navigation .workspace-tab.active { font-weight: 400; }',
      ':root:root .workspace-title { font-weight: 400; letter-spacing: -.03em; }',
      ':root:root .row .subject { font-weight: 400; letter-spacing: -.01em; }',
    ]) expect(nav()).toContain(rule);
  });

  it('names Geist in one rule only, the body, as Ember did (loading the face aside)', () => {
    const all = cssFiles.map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/g, '')).join('\n');
    expect(all.match(/font-family:\s*'Geist'[^;]*/g) ?? []).toHaveLength(1);
  });
});

describe('the window opens on the light frame', () => {
  it('paints the frame colour before the page loads, never dark', () => {
    const bg = read('main/main.mjs').match(/backgroundColor:\s*'([^']+)'/)[1].toLowerCase();
    expect(bg).toBe(token('--bg').toLowerCase());
    expect(bg).not.toBe('#1a1a1c');
  });

  it('no longer tells the window which picture size suits its screen', () => {
    expect(exists('main/screen-detail.mjs')).toBe(false);
    expect(read('main/main.mjs')).not.toMatch(/screenDetail|zero:screen-detail/);
    expect(read('shared/bridge-map.mjs')).not.toMatch(/onScreenDetail/);
    expect(read('preload.cjs')).not.toMatch(/onScreenDetail|zero:screen-detail/);
  });
});
