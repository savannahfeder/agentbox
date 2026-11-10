// Ctrl+K and the sidebar search never found the thread "toKebab function and
// tests" by typing "kebab" (QA F-173, 4 of 4 tries), while other threads were
// found by their titles. Search folds to lower case and matches only at the
// start of a word, so the K of "toKebab" was mid-word. A capital inside a word
// now starts a word for matching; a lower-case letter mid-word still does not.

import { describe, expect, it } from 'vitest';
import { searchItems, searchScore } from '../renderer/src/search.ts';

const kebab = { id: 'w-1', title: 'toKebab function and tests', body: 'Write toKebab(str) in index.js.', updatedAt: 1 };
const into = { id: 'w-2', title: 'Fold the list into one', body: 'Nothing else.', updatedAt: 2 };
const plain = { id: 'w-3', title: 'Kebab case helper', body: '', updatedAt: 3 };

describe('a word inside a camelCase name', () => {
  it('finds the thread by the word after the hump', () => {
    expect(searchItems([kebab, into], 'kebab').map((h) => h.item.id)).toEqual(['w-1']);
  });

  it('counts as a title hit, as a plain word would', () => {
    expect(searchScore(kebab, 'kebab')).toBe(2);
    expect(searchScore(kebab, 'kebab function')).toBe(4);
  });

  it('still finds the whole name and its first part', () => {
    expect(searchScore(kebab, 'tokebab')).toBe(2);
    expect(searchScore(kebab, 'to')).toBe(2);
  });

  it('finds a hump in the body too', () => {
    const body = { id: 'w-4', title: 'Helpers', body: 'Add clampNum to index.js.', updatedAt: 4 };
    expect(searchScore(body, 'num')).toBe(1);
  });

  it('does not match inside a lower-case word', () => {
    expect(searchScore(into, 'to')).toBe(0);
    expect(searchScore(kebab, 'ebab')).toBe(0);
  });

  it('leaves a plain title found as before', () => {
    expect(searchScore(plain, 'kebab')).toBe(2);
  });
});
