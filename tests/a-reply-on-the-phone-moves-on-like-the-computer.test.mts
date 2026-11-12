// A reply sent on the phone stayed on its thread (w-0e77857f54, 2026-10-29).
// "In mobile for some reason when I send a task it doesn't auto move to the
// next one, just stays on it." It was not a slip: b43d4400 on 2026-10-28 put a
// phone-only "stay" into the shared reply rule, with no thread asking for it,
// so every reply sent through the phone door kept her on the thread while the
// same reply on the computer moved on. Asked whether to turn it back on, the
// answer was: "Turn it back on, so the phone moves on after a reply just like
// the computer." So the phone and the computer read one rule again, and these
// pin it from both sides: the phone moves on where the computer does, and
// stays where the computer stays.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { replyMovesOn } from '../renderer/src/advance.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('a reply on the phone moves on like the computer', () => {
  it('moves on from Needs you on the phone', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, phone: true })).toBe(true);
  });
  it('moves on from the last thread in Needs you on the phone', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 4, phone: true })).toBe(true);
  });
  it('moves on from the board on the phone', () => {
    expect(replyMovesOn({ view: 'all', onBoard: true, index: 0, phone: true })).toBe(true);
  });
  it('gives the phone and the computer the same answer everywhere', () => {
    for (const view of ['inbox', 'progress', 'all', 'done']) {
      for (const onBoard of [false, true]) {
        for (const index of [-1, 0, 3]) {
          for (const searching of [false, true]) {
            const p = { view, onBoard, index, searching };
            expect(replyMovesOn({ ...p, phone: true })).toBe(replyMovesOn({ ...p, phone: false }));
          }
        }
      }
    }
  });
});

describe('where a reply still keeps you on the thread, on the phone too', () => {
  it('stays when the thread was opened from In progress', () => {
    expect(replyMovesOn({ view: 'progress', onBoard: false, index: 0, phone: true })).toBe(false);
  });
  it('stays when the thread was opened from search', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, searching: true, phone: true })).toBe(false);
  });
  it('stays when the thread is not in Needs you', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: -1, phone: true })).toBe(false);
  });
});

describe('the app asks one rule, not a phone rule', () => {
  it('does not hand the reply rule a phone switch', () => {
    const call = app.slice(app.indexOf('const movesOn = useCallback'), app.indexOf('const movesOn = useCallback') + 300);
    expect(call).toContain('replyMovesOn(');
    expect(call).not.toContain('onPhone()');
  });
});
