// THE SEARCH FIELD IS A LINE THE WIDTH OF THE INBOX CARD, WITH A CROSS ON ITS
// RIGHT END.
//
// Three rounds got this wrong before she described it herself, 2026-08-24:
//
// Five ways out were then drawn on that line and she picked one:
//
//   "approve this one: The line, with a cross at its right end … build and
//    merge it"
//
// Four things in that are each one "tidy" away from being undone, which is why
// they are here rather than in an eye:
//
//   NO BOX. A background, a border on four sides or a ring is the wide search
//   BAR she deleted on 12 August, back in the row she deleted it from.
//
//   THE LINE IS THE CARD'S WIDTH. .topbar and .body carry the same 22px of side
//   padding, so a searching nav that grows to fill the strip ends exactly where
//   the inbox card ends. The two states where that is not automatic — the panel
//   up, and full screen — are the inset.
//
//   THE CROSS, NOT THE ESC KEYCAP AND NOT THE MAGNIFIER. Those were options 2,
//   3 and 4 on the same drawing and they are decided against. An approval closes
//   the option set.
//
//   THE THREE CORNER BUTTONS STEP OFF WHILE SHE SEARCHES. Her card's right edge
//   and the corner group's right edge are the same point (1688, measured on her
//   own 1710 window), so the line cannot have the card's width while the plus,
//   the ⌘ mark and the cog stand on the end of it. That is the trade she took.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

// Every `.tabs.searching` rule in the sheet, folded into one body, so a
// property split across two blocks still counts and a later block that
// overrides an earlier one is what this reads.
const searchingRules = () => {
  const out = [];
  const re = /\.tabs\.searching\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push(m[1]);
  return out.join(';');
};
const decl = (body, prop) => {
  const m = new RegExp(`(?:^|;|\\n)\\s*${prop}\\s*:\\s*([^;]+)`, 'g');
  const hits = [...body.matchAll(m)].map((x) => x[1].trim());
  return hits.length ? hits[hits.length - 1] : null;
};

// WHICH BRANCH DRAWS THE FIELD. It used to be an inline `search !== null`;
// since it is `searchFieldInStrip`, which also steps the field aside for an
// opened task (the strip is where that task's own header goes). The name is
// the anchor rather than the test inside it, because everything below is
// about what the line LOOKS like and none of it is about when.
const searchNav = (() => {
  const start = app.indexOf('{searchFieldInStrip(');
  expect(start, 'the searching nav is gone from App.tsx').toBeGreaterThan(-1);
  return app.slice(start, app.indexOf('</nav>', start));
})();

describe('the field wears a bottom line and nothing else', () => {
  const rules = searchingRules();

  it('draws one hairline under the field, in the divider token', () => {
    const border = decl(rules, 'border-bottom');
    expect(border, '.tabs.searching has no bottom line').toBeTruthy();
    expect(border).toMatch(/1px\s+solid\s+var\(--line-strong\)/);
  });

  it('paints no background, no full border and no ring, because that was the bar she deleted', () => {
    expect(decl(rules, 'background')).toBeNull();
    expect(decl(rules, 'border')).toBeNull();
    expect(decl(rules, 'box-shadow')).toBeNull();
    expect(decl(rules, 'border-radius')).toBeNull();
  });

  it('keeps the field itself bare, so the line is the only shape', () => {
    const field = css.slice(css.indexOf('.search-q {'), css.indexOf('}', css.indexOf('.search-q {')));
    expect(field).toMatch(/background:\s*none/);
    expect(field).toMatch(/border:\s*none/);
  });
});

describe('the line runs the width of the inbox card', () => {
  const rules = searchingRules();

  it('grows to fill the strip, which at rest IS the card width', () => {
    expect(decl(rules, 'flex')).toMatch(/1\s+1\s+auto/);
  });

  it('pulls back by the rail when the panel is up, so it still stops at the card', () => {
    // .rail is 322 and .body's gap is 19: 341 together.
    expect(decl(rules, 'margin-right')).toMatch(/var\(--search-rule-inset/);
    expect(css).toMatch(/\.app\.panel-up\s*\{[^}]*--search-rule-inset:\s*341px/);
    expect(css).toMatch(/\.app\.flat\.panel-up\s*\{[^}]*--search-rule-inset:\s*var\(--panel-span\)/);
  });

  it('still has the two paddings the alignment rests on: .topbar 22 and .body 22', () => {
    const topbar = css.slice(css.indexOf('.topbar {'), css.indexOf('}', css.indexOf('.topbar {')));
    const body = css.slice(css.indexOf('.body {'), css.indexOf('}', css.indexOf('.body {')));
    expect(topbar).toMatch(/padding:\s*42px 22px 18px 22px/);
    expect(body).toMatch(/padding:\s*0 22px 22px/);
  });

  it('keeps the rail at the 322 the inset is arithmetic on', () => {
    // Anchored to the line start: `.app.flat .rail` is a different block and
    // comes first in the sheet.
    const at = css.indexOf('\n.rail {');
    const rail = css.slice(at, css.indexOf('}', at));
    expect(rail).toMatch(/flex:\s*0 0 322px/);
    const body = css.slice(css.indexOf('.body {'), css.indexOf('}', css.indexOf('.body {')));
    expect(body).toMatch(/gap:\s*19px/);
  });
});

describe('the way out is the cross, and it is the only one', () => {
  it('puts a cross button at the end of the line', () => {
    expect(searchNav).toMatch(/className="search-out"/);
    expect(searchNav).toMatch(/<CrossIcon \/>/);
    expect(searchNav).toMatch(/aria-label="Close search"/);
    expect(searchNav).toMatch(/onClick=\{closeSearch\}/);
  });

  it('draws it after the field, not at the head, because the head was option four', () => {
    expect(searchNav.indexOf('className="search-q"')).toBeLessThan(searchNav.indexOf('className="search-out"'));
  });

  it('draws it whether or not she has typed, because it is the exit and not a clear', () => {
    // No `search &&`, no `search.length`, no `!== ''` guarding the button.
    const button = searchNav.slice(searchNav.indexOf('className="search-out"') - 200, searchNav.indexOf('</button>'));
    expect(button).not.toMatch(/search\s*(&&|\.length|!==\s*'')/);
  });

  it('never gained an esc keycap in the strip, which was option two and three', () => {
    expect(searchNav).not.toMatch(/<kbd>esc<\/kbd>/);
    expect(css).not.toMatch(/\.search-esc\b/);
  });

  it('leaves the magnifier a magnifier, because turning it into the exit was option four', () => {
    const glyph = searchNav.slice(searchNav.indexOf('className="search-glyph"'), searchNav.indexOf('</span>'));
    expect(glyph).not.toMatch(/button|Cross|onClick/);
  });
});

describe('the corner steps off the strip while she is searching', () => {
  it('renders the plus, the ⌘ mark and the cog only when the line is not there', () => {
    // ONE RULE FOR BOTH. This read `{search === null &&` until the field
    // learned to step aside for an opened task; with two separate tests, an
    // opened result would have kept the corner off for a line that was no
    // longer drawn, which is how the plus and the command mark went missing
    // from a task she had opened out of her search results.
    expect(app).toMatch(/\{!searchFieldInStrip\(\{ searching: search !== null[^}]*\}\) && <div className="topbar-right">/);
  });

  it('and the field itself is drawn off that same rule, so the two cannot drift', () => {
    expect(searchNav).toMatch(/^\{searchFieldInStrip\(\{ searching: search !== null/);
  });

  it('brings all three back, so nothing is deleted from the app', () => {
    const corner = app.slice(app.indexOf('className="topbar-right"'), app.indexOf('</header>'));
    // w-ec62ab6b38 (2026-09-28): the plus is labelled New thread now, not New task.
    expect(corner).toMatch(/aria-label="New thread"/);
    expect(corner).toMatch(/aria-label="Commands"/);
    expect(corner).toMatch(/aria-label="Settings"/);
  });

  it('did not instead stop the line short of them, which was option five', () => {
    expect(searchingRules()).not.toMatch(/152px/);
  });
});
