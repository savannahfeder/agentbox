// Which theme you get, and when the machine stops having an opinion.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextTheme, resolveTheme } from '../renderer/src/theme.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe('resolveTheme', () => {
  it('is dark when nobody has chosen, whatever the Mac says', () => {
    // THIS LINE USED TO READ THE MAC, and that is the whole of: only the setup
    // screens and inbox zero pin the lake, so on a tester's light Mac every other
    // screen came up light and the walk turned white after the third screen.
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme(undefined)).toBe('dark');
  });

  it('obeys her choice over everything else, in both directions', () => {
    // A person who picked light at noon did not mean "until the Mac says dark".
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('treats an unreadable stored value as no choice, never as a third theme', () => {
    // A theme name we do not recognise must not select a set of tokens that
    // does not exist, which would be a window with no colours defined at all.
    for (const junk of ['', 'DARK', 'auto', 'sepia', undefined]) {
      expect(['light', 'dark']).toContain(resolveTheme(junk));
      expect(resolveTheme(junk)).toBe('dark');
    }
  });

  it('leaves no reader of the machine anywhere in the window', () => {
    // Matching the Mac is a look someone can PICK now, not something that
    // happens to them, and the option to pick it is not built yet. Asserted
    // over the source because a single reintroduced `matchMedia` in any file
    // brings the disagreement back and nothing else would fail.
    const src = path.join(root, 'renderer/src');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
      e.isDirectory() ? walk(path.join(dir, e.name))
        : /\.(ts|tsx|css)$/.test(e.name) ? [path.join(dir, e.name)] : []
    ));
    const guilty = walk(src).filter((f) => {
      if (f.endsWith('theme.ts')) return false; // its comment says why it is gone
      return /prefers-color-scheme|matchMedia/.test(fs.readFileSync(f, 'utf8'));
    });
    expect(guilty.map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe('nextTheme', () => {
  it('is a toggle, not a cycle through a third state', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme(nextTheme('dark'))).toBe('dark');
  });
});
