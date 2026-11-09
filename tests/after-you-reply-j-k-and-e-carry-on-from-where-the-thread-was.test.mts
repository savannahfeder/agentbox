// AFTER YOU REPLY, J, K AND E CARRY ON FROM WHERE THE THREAD WAS (w-0d55a2b160).
//
// In the person's words: "if I respond to somebody, that should move the task
// to Done in my inbox until they respond ... It shouldn't automatically move
// your focus though, because I'll often follow up multiple times in a single
// thread. I should still be able to hit E and have it move me to the next one.
// The same applies to J and K: I should still be able to move around, hit
// Escape, and have it bring me back to the Needs You list."
//
// The first half already held: a reply to a person keeps you on the thread
// (App.tsx, `talking`) and takes it out of Needs you (`iSpokeLast`). The keys
// did not. Measured in a headless copy of the built app with Needs you reading
// Jun, Pricing page copy, Theo, Maya: open Theo's, reply, wait out the
// three-second hold, then press one key from the thread.
//   J      stayed on Theo's thread (nothing happened)
//   E      closed it and dropped you on the list instead of opening Maya's
//   K      opened Pricing page copy, the row above, but only by way of the
//          list's own cursor rather than the thread's place
//   Escape back to Needs you, which was already right
// The keys asked where the open thread sat in the list, and a thread your
// reply has just taken out of the list sits nowhere. Now the place it sat is
// remembered while you stay on it. Measured again after: J opened Maya's, E
// closed Theo's and opened Maya's, K opened Pricing page copy, and J then K K
// walked Maya, Pricing page copy, Jun.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stepStop, stepFromPlace, stopKey } from '../renderer/src/threads/walk-rules.ts';

const row = (id) => ({ item: { id, product: 'p' } });
// Needs you after the reply: Theo's (place 1) is gone.
const after = [row('jun'), row('maya'), row('pricing')];

describe('a step from a thread that has left the list', () => {
  it('J opens the one that slid into its place', () => {
    expect(stopKey(stepFromPlace(after, 1, 1))).toBe('item/p/maya');
  });

  it('K opens the one that was above it', () => {
    expect(stopKey(stepFromPlace(after, 1, -1))).toBe('item/p/jun');
  });

  // THE BOUNDARIES EITHER SIDE.
  it('stops at the ends rather than wrapping round', () => {
    expect(stepFromPlace(after, 0, -1)).toBeNull();          // it was the top row
    expect(stopKey(stepFromPlace(after, 0, 1))).toBe('item/p/jun');
    expect(stepFromPlace(after, 3, 1)).toBeNull();           // it was the bottom row
    expect(stopKey(stepFromPlace(after, 3, -1))).toBe('item/p/pricing');
    expect(stepFromPlace([], 0, 1)).toBeNull();               // nothing left waiting
  });

  // THE CASE THAT MUST NOT CHANGE: a thread still in the list walks from
  // where it is, exactly as before.
  it('leaves a step from a thread still in the list as it was', () => {
    const before = [row('jun'), row('theo'), row('maya')];
    expect(stopKey(stepStop(before, row('theo'), 1))).toBe('item/p/maya');
    expect(stopKey(stepStop(before, row('theo'), -1))).toBe('item/p/jun');
  });
});

describe('the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  it('walks J and K from the remembered place when the open thread is not on the page', () => {
    expect(app).toMatch(/stepFromPlace\(stops, /);
  });

  it('advances E from the remembered place too', () => {
    const note = app.slice(app.indexOf('const noteAdvance = useCallback'), app.indexOf('const leaveResolved = useCallback'));
    expect(note).toMatch(/inboxPlace\.current/);
  });

  it('still keeps you on the thread after a reply to a person', () => {
    expect(app).toMatch(/const stay = staysOnTheTask\(item, text, engine\) \|\| talking \|\| !movesOn\(item\);/);
  });
});
