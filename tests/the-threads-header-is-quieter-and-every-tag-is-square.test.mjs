// A QUIETER HEADER, AND TAGS THAT ARE SQUARE IN EVERY THEME.
//
// Search, New thread and Display were three bordered rectangles in a row
// across the top, and the run of them was overwhelming. Search is the one that
// is not an action, so it loses its box and answers the pointer the way every
// other quiet control does, with a background. New thread keeps its outline,
// because it is the thing you press.
//
// And the chips: the app's pattern is square, so no tag is rounded. Every
// corner took `--radius`, which is 3px in both themes and 0 only under the
// Ember Grid skin, so the tags were rounded everywhere but there.
// `--tag-radius` is a second token, declared once and never re-declared by a
// skin, so a tag is square whatever is worn. It is deliberately NOT
// `--radius`: cards, menus, fields and the app's other corners keep their 3px.
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

describe('the token: square tags, whatever theme or skin is worn', () => {
  it('is declared once, at the root', () => {
    expect(styles).toMatch(/--tag-radius:\s*0px/);
  });
  it('and no skin or theme ever re-declares it, which is the whole point', () => {
    expect(styles.match(/--tag-radius:/g)).toHaveLength(1);
  });
  it('the app keeps the 3px corner everywhere else', () => {
    expect(styles).toMatch(/--radius:\s*3px/);
    const ember = styles.slice(styles.indexOf(':root[data-skin="ember-grid"] {'));
    expect(ember.slice(0, ember.indexOf('}'))).toMatch(/--radius:\s*0px/);
  });
});

describe('every tag names it', () => {
  const tags = [
    [pages, '.th-pop .opts > button'], // the Display menu's chips
    [pages, '.th-row-act'], // Share and Unshare at the end of a row
    [pages, '.th-urgent'],
    [summary, '.ts-sumbtn'], // the Summary button
    [summary, '.ts-more'],
    [summary, '.ts-msgbtn'],
    [composer, '.tc-chip'], // the composer's Project, Priority and Visibility chips
    [composer, '.tc-urgent'],
  ];
  for (const [css, selector] of tags) {
    it(`${selector} is square`, () => {
      expect(rule(css, selector)).toMatch(/border-radius: var\(--tag-radius\)/);
    });
  }
  it('the +N face chip too, which is the same shape', () => {
    expect(rule(pages, '.th-more')).toMatch(/border-radius: var\(--tag-radius\)/);
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
