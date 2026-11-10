// A HYPHENATED WORD IS FOUND TYPED WITHOUT ITS HYPHEN.
//
// The 2026-11-06 phone workday (issue 31): searching "signup" said Nothing
// matches while "sign-up" and "sign up" both found the two sign-up threads.
// The haystack held only "sign-up", and "signup" starts no word in it.
import { describe, it, expect } from 'vitest';
import { searchItems, searchScore } from '../renderer/src/search';

const signUp = { id: 'w-1', title: 'Try sign-up the way a new user would', updatedAt: 2 };
const inBody = { id: 'w-2', title: 'Failed step', body: 'Two sign-ups failed at the e-mail step.', updatedAt: 1 };
const ids = (q, items = [signUp, inBody]) => searchItems(items, q).map((h) => h.item.id);

describe('typing a hyphenated word without its hyphen', () => {
  it('signup finds sign-up in a title and sign-ups in a body', () => {
    expect(ids('signup')).toEqual(['w-1', 'w-2']);
  });
  it('a title hit still ranks as a title hit', () => {
    expect(searchScore(signUp, 'signup')).toBe(2);
  });
  it('sign-up and sign up still find both, as before', () => {
    expect(ids('sign-up')).toEqual(['w-1', 'w-2']);
    expect(ids('sign up')).toEqual(['w-1', 'w-2']);
  });
  it('email finds e-mail', () => {
    expect(ids('email', [inBody])).toEqual(['w-2']);
  });
  it('does not join words a space keeps apart, or find a word that is not there', () => {
    expect(ids('signup', [{ id: 'w-3', title: 'Sign up page', updatedAt: 1 }])).toEqual([]);
    expect(ids('signupx')).toEqual([]);
    expect(ids('ignup')).toEqual([]);
  });
});
