// A second search with / typed itself into the first one. Two testers searched,
// opened a result, came back out of it and pressed / for a new search: the
// field read "runbook/flaky" and "Review open pull requests/summarise the
// risky", and said Nothing matches. Measured on a live copy on stand-in agents:
// / "Mobile", Enter, reply, Esc back to the results, / "login" left the field
// reading "Mobile/login". Coming back out of a result hands the field the
// keyboard with the old words in it, so the / was a character in it. Pressed
// from inside an open result instead, / kept the old words with the caret
// after them, and "fix" made "Mobilefix".
//
// Now / on an old search selects its words, so the next ones replace them. A /
// in words she is typing, and a / that starts a fresh search, are still typed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { slashSearchesAgain } from '../renderer/src/keys.ts';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');

describe('/ in the search field', () => {
  it('on the old words the field was handed back with, searches again', () => {
    expect(slashSearchesAgain({ query: 'runbook', typedSince: false })).toBe(true);
  });

  it('in words she has typed since, is a slash in her query', () => {
    expect(slashSearchesAgain({ query: 'src', typedSince: true })).toBe(false);
    expect(slashSearchesAgain({ query: 'runbook', typedSince: true })).toBe(false);
  });

  it('in an empty field, is the first character of her query', () => {
    expect(slashSearchesAgain({ query: '', typedSince: false })).toBe(false);
  });
});

describe('where the app wires it', () => {
  const field = app.slice(app.indexOf('ref={searchRef}'), app.indexOf('className="search-out"'));
  const open = app.slice(app.indexOf('const openSearch = useCallback'), app.indexOf('const searchFor = useCallback'));
  const handBack = app.slice(app.indexOf('WHO HOLDS THE KEYBOARD WHILE SEARCHING'), app.indexOf('/* ------------------------- ⌘R comes back here'));

  it('the field asks the rule and selects its words instead of typing the slash', () => {
    expect(field).toMatch(/e\.key === '\/' && slashSearchesAgain\(\{ query: e\.currentTarget\.value, typedSince: searchTyped\.current \}\)\) \{ e\.preventDefault\(\); e\.currentTarget\.select\(\); \}/);
  });

  it('typing in the field is typing since', () => {
    expect(field).toMatch(/onChange=\{\(e\) => \{ searchTyped\.current = true;/);
  });

  it('handing the field the keyboard starts the count again', () => {
    expect(handBack).toContain('searchTyped.current = false;');
    expect(open).toContain('searchTyped.current = false;');
  });

  it('/ from anywhere else selects the old words too', () => {
    expect(open).toContain('searchRef.current?.select()');
  });
});
