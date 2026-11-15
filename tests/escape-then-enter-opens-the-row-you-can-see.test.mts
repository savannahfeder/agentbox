// Escape out of a thread, then Enter, opened a thread further down the list.
//
// Twice in one tester's evening (power-test-2, issue 46): once the second row
// in Needs you, once the third, while the first was the one lit. The pointer
// had not moved since before the thread was opened, so it still owned a row,
// and Enter acts on the row the pointer owns.
//
// J and K had cleared the hover since they were written. Escape had not, and
// Escape is the key that comes back to the list.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opensATextField, takesTheListBack } from '../renderer/src/keys.ts';

describe('which keys hand the list back to the keyboard', () => {
  it('the way out of a thread does', () => {
    expect(takesTheListBack('Escape')).toBe(true);
  });

  it('so do the ones that walk it, whichever spelling the key arrives as', () => {
    for (const key of ['j', 'J', 'k', 'K', 'ArrowDown', 'ArrowUp', 'Tab']) {
      expect(takesTheListBack(key), key).toBe(true);
    }
  });

  it('and the ones that act on a row do NOT: a pointer on a row still owns E and R', () => {
    for (const key of ['e', 'E', 'r', 'R', 'l', 'Enter', '1', 'z']) {
      expect(takesTheListBack(key), key).toBe(false);
    }
  });

  it('is a separate question from whether a key opens a field', () => {
    expect(opensATextField('Escape')).toBe(false);
    expect(takesTheListBack('r')).toBe(false);
  });
});

// The rule is applied once, above the branches, for the reason keys.ts gives:
// Escape leaves a thread in one branch and clears a search in another.
describe('the window handler', () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

  it('asks the rule once, beside the other key-level guard', () => {
    expect(app).toContain('if (takesTheListBack(e.key)) setHoveredId(null);');
    const guard = app.indexOf('if (takesTheListBack(e.key))');
    expect(guard).toBeGreaterThan(0);
    // Above the branch that splits an open thread from the list.
    expect(guard).toBeLessThan(app.indexOf('if (focused) {'));
  });
});
