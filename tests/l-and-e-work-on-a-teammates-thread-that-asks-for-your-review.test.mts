// L AND E WORK ON A TEAMMATE'S THREAD THAT ASKS FOR YOUR REVIEW.
//
// Reported 2026-11-21 (w-32801fee32): "I'm trying to run commands, like
// hitting L, etc., but nothing's working over this layer." A review ask opens
// on the teammate's thread it is about (App.tsx, "AN ASK OPENS ON THE THREAD
// IT IS ABOUT"), and that page's key branch only knew Escape, J, K, N, Z and
// R, so L (Later) and E (close) went nowhere. Measured in the code: the
// branch returned before the list's L and E, and `leaveResolved` only cleared
// `focused`, which the page had already cleared to open the card.
//
// Now L and E act on the ask task behind the page, and once it leaves your
// inbox the page closes and moves on as a thread of your own does. A
// teammate's thread with no ask on you has nothing of yours to put off or
// close, so the keys stay out of it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isTheAskOn } from '../renderer/src/threads/teammate-thread.ts';

const card = { personId: 'tony', threadId: 'w-abc' };
const ask = (owner: string, thread: string) => ({ ask: { kind: 'review' as const, owner, thread, product: 'p' } });

describe('which task the open teammate thread carries', () => {
  it('is the ask on that very thread (the reported case)', () => {
    expect(isTheAskOn(ask('tony', 'w-abc'), card)).toBe(true);
  });

  it('is not an ask on another of their threads, or the same thread id of someone else', () => {
    expect(isTheAskOn(ask('tony', 'w-other'), card)).toBe(false);
    expect(isTheAskOn(ask('maya', 'w-abc'), card)).toBe(false);
  });

  it('is not a task with no ask, or any task when no teammate thread is open', () => {
    expect(isTheAskOn({}, card)).toBe(false);
    expect(isTheAskOn({ ask: null }, card)).toBe(false);
    expect(isTheAskOn(ask('tony', 'w-abc'), null)).toBe(false);
  });
});

describe('the keys on a teammate thread', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const branch = app.slice(app.indexOf('if (openCard && teamShown) {'), app.indexOf('// On the page J and K move the keyboard'));

  it('L puts the ask off and E closes it, only when there is one on you', () => {
    expect(branch).toContain('const asked = askOnMe(items, team?.me ?? null, openCard.personId, openCard.threadId) as WorkItem | null;');
    // Swallowed here: the list behind the page counts as covered, so the guard lets L through and it was typed into the picker.
    expect(branch).toContain("else if ((e.key === 'l' || e.key === 'L') && asked) { e.preventDefault(); openSnooze(asked); }");
    expect(branch).toContain("else if ((e.key === 'e' || e.key === 'E') && asked) { e.preventDefault(); void markDone(asked); }");
  });

  it('leaving the ask closes its page and moves on, as from a task of your own', () => {
    expect(app).toMatch(/const leaveResolved = useCallback\(\(item: WorkItem\) => \{\n\s+noteAdvance\(item\);\n\s+setFocused\(null\);\n\s+if \(isTheAskOn\(item, openCard\)\) \{ setOpenCard\(null\); setTeamOpen\(false\); \}/);
    expect(app).toContain('fromTask: (!!focused || isTheAskOn(item, openCard)) && !isTourPractice(tourRef.current, item)');
  });
});
