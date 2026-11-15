// THE PHONE APP'S YES TO CLAUDE AND CODEX BELONGS TO THE ACCOUNT THAT GAVE IT.
//
// The yes asked before your words go to Claude Code or Codex (App Review
// guideline 5.1.2(i)) was kept once per phone. Codex, reading the app as an
// App Store reviewer on 2026-11-08, found that account A's yes let account B
// send after A signed out, and Settings showed B the date A agreed. A reviewer
// handed two review accounts can see that. Now the yes carries the account's
// id and counts only for that account; a yes kept before it had one counts
// until the next sign-out, which forgets it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { noticeFor, readNotice } from '../mobile/src/lib/ai-notice';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

describe('whose yes it is', () => {
  it('keeps the account a yes or a no came from', () => {
    expect(readNotice(JSON.stringify({ agreed: 1792700000000, by: 'user-a' }))).toEqual({ agreed: 1792700000000, by: 'user-a' });
    expect(readNotice(JSON.stringify({ declined: 1792700000000, by: 'user-a' }))).toEqual({ declined: 1792700000000, by: 'user-a' });
  });
  it('counts for the account that gave it', () => {
    expect(noticeFor({ agreed: 1, by: 'user-a' }, 'user-a')).toEqual({ agreed: 1, by: 'user-a' });
  });
  it('never for another account, or for nobody signed in', () => {
    expect(noticeFor({ agreed: 1, by: 'user-a' }, 'user-b')).toBeNull();
    expect(noticeFor({ declined: 1, by: 'user-a' }, 'user-b')).toBeNull();
    expect(noticeFor({ agreed: 1, by: 'user-a' }, null)).toBeNull();
  });
  it('a yes kept before it named an account still counts, so nobody is asked again on updating', () => {
    expect(noticeFor({ agreed: 1 }, 'user-a')).toEqual({ agreed: 1 });
    expect(noticeFor(null, 'user-a')).toBeNull();
  });
  it('an id that is not a string is no account', () => {
    expect(readNotice(JSON.stringify({ agreed: 1, by: 42 }))).toEqual({ agreed: 1 });
  });
});

describe('the phone', () => {
  const cloud = read('state/cloud.tsx');
  it('writes the signed-in account into the answer', () => {
    expect(cloud).toMatch(/agreed: Date\.now\(\), by: me/);
    expect(cloud).toMatch(/declined: Date\.now\(\), by: me/);
  });
  it('reads it through noticeFor, for the account signed in now', () => {
    expect(cloud).toMatch(/noticeFor\(notice, me\)/);
  });
  it('forgets a yes that names no account when you sign out', () => {
    const signOut = cloud.slice(cloud.indexOf('const signOut = useCallback'));
    expect(signOut.slice(0, 1500)).toMatch(/!\('by' in /);
  });
});
