// EMBER'S ACCENTS ARE ON EVERY THEME, AND ONLY THE ACCENTS.
//
// w-3fc39983be: Ember's type goes on the small right-side details such as
// times, while the original font stays everywhere else, so the main font is
// still Avenir Next.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', f), 'utf8');
const styles = read('styles.css');
const nav = read('workspace-navigation.css');

describe("Ember's accents", () => {
  it('make Geist Mono the mono of every theme', () => {
    expect(styles).toMatch(/:root \{[\s\S]*?--mono: 'Geist Mono', ui-monospace/);
  });

  it('put the chrome in spaced mono capitals without naming a theme', () => {
    const block = nav.slice(nav.indexOf(":root:root .workspace-search span"));
    for (const sel of ['.workspace-section', '.row-end .product', '.row-end .time']) {
      expect(block).toContain(`:root:root ${sel}`);
    }
    expect(block).toMatch(/font-family: var\(--mono\); font-size: 11px; letter-spacing: \.06em; text-transform: uppercase;/);
  });

  // w-9e434e8671: Light wears Ember Grid's type too, so the body is Geist in
  // both themes and Light carries Ember's five weight and spacing rules.
  it('set the body in Geist in both themes, with Ember Grid’s fallbacks', () => {
    expect(styles).toContain("font-family: 'Geist', 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif;");
    expect(styles).not.toContain("font-family: 'Avenir Next', 'Source Sans 3 Variable'");
    for (const rule of [
      ':root:root .set-title { font-weight: 400; letter-spacing: -0.035em; }',
      ':root:root .workspace-title { font-weight: 400; letter-spacing: -.03em; }',
      ':root:root .row .subject { font-weight: 400; letter-spacing: -.01em; }',
    ]) expect(nav).toContain(rule);
  });
});
