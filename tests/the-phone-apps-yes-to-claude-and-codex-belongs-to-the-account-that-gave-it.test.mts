// THE PHONE APP'S YES TO CLAUDE AND CODEX BELONGS TO THE ACCOUNT THAT GAVE IT.
//
// The yes asked before your words go to Claude Code or Codex (App Review
// guideline 5.1.2(i)) was kept once per phone. On 2026-11-08 Codex, reading the
// app as an App Store reviewer, found that account A's yes let account B
// send. The fix kept one answer naming its account, so B's answer then wrote
// over A's: in phone session m19 (2026-11-15) the tester signed out, used
// another account and came back to the first, and "Where your messages go"
// was asked again 30 minutes after it was answered. Now each account keeps
// its own answer. An answer kept before answers named an account counts until
// the next sign-out.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { NO_NOTICES, noticeFor, readNotices, signedOut, withAnswer } from '../mobile/src/lib/ai-notice';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');
const again = (kept) => readNotices(JSON.stringify(kept));

describe('whose yes it is', () => {
  it('counts for the account that gave it', () => {
    const kept = withAnswer(NO_NOTICES, 'user-a', { agreed: 1 });
    expect(noticeFor(again(kept), 'user-a')).toEqual({ agreed: 1 });
  });
  it('never for another account, or for nobody signed in', () => {
    const kept = again(withAnswer(NO_NOTICES, 'user-a', { agreed: 1 }));
    expect(noticeFor(kept, 'user-b')).toBeNull();
    expect(noticeFor(again(withAnswer(NO_NOTICES, 'user-a', { declined: 1 })), 'user-b')).toBeNull();
    expect(noticeFor(kept, null)).toBeNull();
  });
  it('another account answering leaves the first one answered', () => {
    let kept = withAnswer(NO_NOTICES, 'user-a', { agreed: 1 });
    kept = again(signedOut(kept));
    kept = again(withAnswer(kept, 'user-b', { declined: 2 }));
    kept = again(signedOut(kept));
    expect(noticeFor(kept, 'user-a')).toEqual({ agreed: 1 });
    expect(noticeFor(kept, 'user-b')).toEqual({ declined: 2 });
  });
  it('signing out and back in to the same account is not asked again', () => {
    const kept = again(signedOut(withAnswer(NO_NOTICES, 'user-a', { agreed: 1 })));
    expect(noticeFor(kept, 'user-a')).toEqual({ agreed: 1 });
  });
  it('turning it off for one account turns it off for that one only', () => {
    let kept = withAnswer(withAnswer(NO_NOTICES, 'user-a', { agreed: 1 }), 'user-b', { agreed: 2 });
    kept = again(withAnswer(kept, 'user-a', { declined: 3 }));
    expect(noticeFor(kept, 'user-a')).toEqual({ declined: 3 });
    expect(noticeFor(kept, 'user-b')).toEqual({ agreed: 2 });
  });
});

describe('answers kept by an older copy of the app', () => {
  it('one answer naming its account still counts for that account only', () => {
    const kept = readNotices(JSON.stringify({ agreed: 1792700000000, by: 'user-a' }));
    expect(noticeFor(kept, 'user-a')).toEqual({ agreed: 1792700000000 });
    expect(noticeFor(kept, 'user-b')).toBeNull();
  });
  it('one naming no account counts until the next sign-out, so nobody is asked again on updating', () => {
    const kept = readNotices(JSON.stringify({ agreed: 1 }));
    expect(noticeFor(kept, 'user-a')).toEqual({ agreed: 1 });
    expect(noticeFor(signedOut(kept), 'user-a')).toBeNull();
  });
  it('an id that is not a string is no account', () => {
    expect(noticeFor(readNotices(JSON.stringify({ agreed: 1, by: 42 })), 'user-a')).toEqual({ agreed: 1 });
  });
  it('nothing kept, or nonsense, is no answer', () => {
    expect(noticeFor(readNotices(null), 'user-a')).toBeNull();
    expect(noticeFor(readNotices('{oops'), 'user-a')).toBeNull();
  });
});

describe('the phone', () => {
  const cloud = read('state/cloud.tsx');
  it('writes the answer under the signed-in account', () => {
    expect(cloud).toMatch(/withAnswer\(kept, me, /);
  });
  it('reads it through noticeFor, for the account signed in now', () => {
    expect(cloud).toMatch(/noticeFor\(notices, me\)/);
  });
  it('forgets only the answer that names no account when you sign out', () => {
    const signOut = cloud.slice(cloud.indexOf('const signOut = useCallback'));
    expect(signOut.slice(0, 1500)).toMatch(/signedOut\(notices\)/);
  });
});
