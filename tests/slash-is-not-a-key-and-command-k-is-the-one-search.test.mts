// `/` is not a key any more; ⌘K is the one search.
//
// What was asked (w-30e94db8cf): "get rid of `/` entirely and replace it with
// Command+K because it's just the same thing". `/` opened a full-page search
// that ⌘K already covers: ⌘K lists the best threads, the lines and files found
// inside them, and "See all N threads", which still opens that full page. The
// person picked "take `/` out, and ⌘K is the only search" from screenshots of
// the shortcuts page with and without the `/` line.
//
// What must still hold: Files and Settings keep `/` for their own find boxes,
// which are not the thread search; "See all" still reaches the full list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { OPENS_A_TEXT_FIELD } from '../renderer/src/keys';
import { keyOnAnOpenThread, keyOnTheList } from '../renderer/src/reply-keys';
import { HINTS } from '../renderer/src/hint-plate';
import { everyKey } from '../shared/shortcuts.mts';
import { HER_LETTERS_IN_A_PAGE } from '../shared/artifact-keys.mts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const palette = read('renderer/src/components/Palette.tsx');

describe('slash is not a key and ⌘K is the one search', () => {
  it('no key handler opens the thread search on /', () => {
    expect(app).not.toMatch(/e\.key === '\/'\)\s*\{\s*e\.preventDefault\(\);\s*openSearch\(\)/);
    expect(app.match(/e\.key === '\/'/g) ?? []).toHaveLength(1);
  });

  it('Files keeps / for its own find box', () => {
    expect(app).toMatch(/e\.key === '\/'\) \{ e\.preventDefault\(\); document\.querySelector<HTMLInputElement>\('\.fp-find input'\)/);
  });

  it('the shortcuts page does not list /', () => {
    expect(everyKey()).not.toContain('/');
    expect(everyKey()).toContain('⌘K');
  });

  it('⌘K offers no Search threads row and prints no /', () => {
    expect(palette).not.toMatch(/keyHint: '\/'/);
    expect(palette).not.toMatch(/id: 'search'/);
  });

  it('but See all still opens the full list', () => {
    expect(palette).toMatch(/See all \$\{found\.length\} threads/);
    expect(app).toMatch(/onSearchFor=\{searchFor\}/);
  });

  it('/ is a character, not a shortcut, in a thread and on the list', () => {
    expect(OPENS_A_TEXT_FIELD.has('/')).toBe(false);
    expect(keyOnAnOpenThread({ key: '/', justChanged: false })).toBe('to the box');
    expect(keyOnTheList({ key: '/', justChanged: false })).toBe('nowhere');
    expect(HER_LETTERS_IN_A_PAGE.has('/')).toBe(false);
  });

  it('the letters either side of it are untouched', () => {
    expect(keyOnAnOpenThread({ key: 'j', justChanged: false })).toBe('shortcut');
    expect(keyOnTheList({ key: 'o', justChanged: false })).toBe('shortcut');
    expect(OPENS_A_TEXT_FIELD.has('n')).toBe(true);
    expect(HER_LETTERS_IN_A_PAGE.has('k')).toBe(true);
  });

  it('no hover hint promises /', () => {
    for (const lines of Object.values(HINTS)) for (const l of lines) expect(l.key).not.toBe('/');
  });

  // Two power testers (2026-11-09) logged "/ does not open search" as broken:
  // their own brief still listed it.
  it('no synthetic tester is told / searches', () => {
    for (const brief of ['.claude/skills/power-test/scripts/plan.mjs', '.claude/skills/verify-agentbox/scripts/breaker.mjs']) {
      const keys = read(brief);
      expect(keys).toMatch(/⌘K \(press k meta\)/);
      expect(keys).not.toMatch(/\/ searches/);
    }
  });
});
