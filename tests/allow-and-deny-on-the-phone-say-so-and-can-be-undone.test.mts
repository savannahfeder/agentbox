// ALLOW AND DENY ON THE PHONE SAY SO, AND CAN BE UNDONE.
//
// What broke (phone testers, 2026-11-08): after Allow or Deny the card stamped
// "Allowed" for under half a second and was gone, with nothing after it to say
// what had been decided, and no way back from a wrong tap. The computer acts on
// an answer the moment it gets one, so the phone now holds the answer for as
// long as its toast's Undo shows, then sends it; putting the app away sends it
// at once. Measured with fake timers on the hold, and from the sources.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { heldAnswers } from '../mobile/src/lib/held-answers';
import { TOAST_GOES_MS } from '../mobile/src/lib/overlays';

const cloud = fs.readFileSync(new URL('../mobile/src/state/cloud.tsx', import.meta.url), 'utf8');
const card = fs.readFileSync(new URL('../mobile/src/ui/Approvals.tsx', import.meta.url), 'utf8');

afterEach(() => { vi.useRealTimers(); });

describe('the hold', () => {
  it('sends the answer once the Undo window is over, not before', () => {
    vi.useFakeTimers();
    const sent: [string, boolean][] = [];
    const h = heldAnswers((id, allow) => sent.push([id, allow]), TOAST_GOES_MS);
    h.hold('a1', true);
    vi.advanceTimersByTime(TOAST_GOES_MS - 1);
    expect(sent).toEqual([]);
    expect([...h.held()]).toEqual(['a1']);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([['a1', true]]);
    expect(h.held().size).toBe(0);
  });

  it('Undo inside the window sends nothing, ever', () => {
    vi.useFakeTimers();
    const sent: unknown[] = [];
    const h = heldAnswers((id, allow) => sent.push([id, allow]), TOAST_GOES_MS);
    h.hold('a1', false);
    expect(h.undo('a1')).toBe(true);
    vi.advanceTimersByTime(TOAST_GOES_MS * 3);
    expect(sent).toEqual([]);
  });

  it('Undo after it went says so', () => {
    vi.useFakeTimers();
    const h = heldAnswers(() => {}, TOAST_GOES_MS);
    h.hold('a1', true);
    vi.advanceTimersByTime(TOAST_GOES_MS);
    expect(h.undo('a1')).toBe(false);
  });

  it('putting the app away sends every held answer at once, each once', () => {
    vi.useFakeTimers();
    const sent: [string, boolean][] = [];
    const h = heldAnswers((id, allow) => sent.push([id, allow]), TOAST_GOES_MS);
    h.hold('a1', true);
    h.hold('a2', false);
    h.flush();
    vi.advanceTimersByTime(TOAST_GOES_MS * 2);
    expect(sent).toEqual([['a1', true], ['a2', false]]);
  });

  it('a second tap on the same card holds it once', () => {
    vi.useFakeTimers();
    const sent: unknown[] = [];
    const h = heldAnswers((id, allow) => sent.push([id, allow]), TOAST_GOES_MS);
    h.hold('a1', true);
    h.hold('a1', true);
    vi.advanceTimersByTime(TOAST_GOES_MS);
    expect(sent).toHaveLength(1);
  });
});

describe('on screen', () => {
  it('the toast names the decision and the card, with Undo', () => {
    expect(cloud).toMatch(/say\(`\$\{allow \? 'Allowed' : 'Denied'\}: \$\{clipToSentence\(what, 48\)\}\$\{UNDO_WORDS\}`/);
  });
  it('a held card is out of the list, the Review count and the stage until it is undone', () => {
    expect(cloud).toMatch(/approvals: shown\.approvals\.filter\(\(a\) => !heldIds\.has\(a\.id\)\)/);
  });
  it('the app put away sends what is held', () => {
    expect(cloud).toMatch(/if \(s !== 'active'\) answers\.flush\(\)/);
  });
  it('the card answers through the hold, not straight to the computer', () => {
    expect(card).toMatch(/c\.answerApproval\(card, allow, words\)/);
    expect(card).not.toMatch(/kind: 'approve'/);
  });
});
