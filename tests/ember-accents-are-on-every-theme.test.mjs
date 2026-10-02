// EMBER'S ACCENTS ARE ON THE ONE LOOK.
//
// w-3fc39983be put Ember's mono on the small right-side details and left the
// body in Avenir Next. w-9e434e8671 went further: the one light look wears
// Ember Grid's type one to one, so the body is Geist too (pinned in full by
// the-app-has-one-look-and-it-is-light).
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

  it('set the body in Ember Grid’s Geist, with Ember’s own fallbacks', () => {
    expect(styles).toContain("font-family: 'Geist', 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif;");
    expect(styles).not.toContain("font-family: 'Avenir Next', 'Source Sans 3 Variable'");
  });
});
