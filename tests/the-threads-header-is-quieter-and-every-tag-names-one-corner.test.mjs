// A QUIETER HEADER, AND TAGS THAT ALL NAME ONE CORNER.
//
// Search, New thread and Display were three bordered rectangles in a row
// across the top, and the run of them was overwhelming. Search is the one that
// is not an action, so it loses its box and answers the pointer the way every
// other quiet control does, with a background. New thread keeps its outline,
// because it is the thing you press.
//
// And the chips: every tag names `--tag-radius`. It was 0px, square in every
// theme, until the owner asked for soft corners on chips (2026-10-31); it now
// follows `--radius`, the small corner, so the Ember Grid skin squares it with
// everything else.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const styles = read('../renderer/src/styles.css');
const pages = read('../renderer/src/threads/pages.css');
const summary = read('../renderer/src/threads/summary.css');
const composer = read('../renderer/src/threads/thread-composer.css');

/** The body of one rule, by its exact selector. */
function rule(css, selector) {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return null;
  return css.slice(at + selector.length + 2, css.indexOf('}', at));
}

describe('the token', () => {
  it('is declared once, at the root, as the small corner', () => {
    expect(styles).toMatch(/--tag-radius:\s*var\(--radius\)/);
    expect(styles.match(/--tag-radius:/g)).toHaveLength(1);
  });
  it('squares with everything else under the Ember Grid skin', () => {
    const ember = styles.slice(styles.indexOf(':root[data-skin="ember-grid"] {'));
    expect(ember.slice(0, ember.indexOf('}'))).toMatch(/--radius:\s*0px/);
  });
});

describe('every tag names it', () => {
  const tags = [
    [pages, '.th-pop .opts > button'], // the Display menu's chips
    [pages, '.th-row-act'], // Share and Unshare at the end of a row
    [pages, '.th-urgent'],
    [summary, '.ts-close'], // the icon that folds the summary (the Summary button's heir, w-a3482b8c2c)
    [summary, '.ts-more'],
    [summary, '.ts-msgbtn'],
    [composer, '.tc-chip'], // the composer's Project, Priority and Visibility chips
    [composer, '.tc-urgent'],
  ];
  for (const [css, selector] of tags) {
    it(`${selector} names the tag corner`, () => {
      expect(rule(css, selector)).toMatch(/border-radius: var\(--tag-radius\)/);
    });
  }
  // The +N face chip used to be pinned here too. It went with the face chips
  // on 2026-10-01 (7b61442: the faces are one filter, named in words), and
  // this case kept GitHub's run red over a rule that no longer exists. What is
  // pinned now is that it stays gone, so a square rule is not owed to it.
  it('the +N face chip is gone, so it owes no rule', () => {
    expect(pages).not.toMatch(/\.th-more\b/);
  });
  it('but a card, a menu and a popover are not tags and keep their corner', () => {
    expect(rule(pages, '.th-card')).toMatch(/border-radius: var\(--radius\)/);
    expect(rule(pages, '.th-menu')).toMatch(/border-radius: var\(--radius\)/);
    expect(rule(pages, '.th-pop')).toMatch(/border-radius: var\(--radius\)/);
  });
});

describe('Search is no longer a box', () => {
  const search = rule(pages, '.th-search');
  it('carries no border', () => {
    expect(search).not.toMatch(/border: 1px solid/);
  });
  it('and no 240px block to hold open', () => {
    expect(search).not.toMatch(/width: 240px/);
  });
  it('answers the pointer with a background, the way New thread and Display do', () => {
    expect(pages).toMatch(/\.th-search:hover \{[^}]*background: var\(--wash-strong\)/);
  });
  it('while New thread keeps its outline, because it is the thing you press', () => {
    expect(rule(pages, '.th-new')).toMatch(/border: 1px solid var\(--line-strong\)/);
  });
});
