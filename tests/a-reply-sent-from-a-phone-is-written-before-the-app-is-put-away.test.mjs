// A REPLY SENT FROM A PHONE IS WRITTEN BEFORE THE APP IS PUT AWAY (2026-10-13).
//
// "There have been several instances where I send a message on mobile then go
// back a bit later and the message isn't there."
//
// Every send in the app is held in the page for three seconds (UNDO_GRACE_MS
// in App.tsx) so Z can take it back, and only a timer in that page writes it.
// On a phone that is the wrong trade twice over, measured in the code:
// - a reply to a working agent says "Sending… press Z to undo", and a phone
//   has no Z and nothing to tap there, so the hold buys nothing;
// - the hold was written out only on `pagehide`, and iOS does not fire that
//   when you swipe home or switch apps. It fires `visibilitychange`, then
//   freezes the page, timers and all, and may throw it away while it is in the
//   background. A reply sent in the three seconds before leaving was gone.
//
// So on a phone a reply is written at once (a written reply can still be
// taken back, which is the Undo its toast offers), and anything else still
// held is written the moment the app is hidden. The desktop keeps its hold.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holdsReplies, writeHeldWhenHidden } from '../renderer/src/phone-holds.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

/** A page whose visibility the test sets, the way iOS does on a swipe home. */
function page() {
  const target = new EventTarget();
  target.visibilityState = 'visible';
  target.set = (state) => { target.visibilityState = state; target.dispatchEvent(new Event('visibilitychange')); };
  return target;
}

describe('who holds a reply', () => {
  it('a phone does not: the reply is written at once', () => {
    expect(holdsReplies(true)).toBe(false);
  });
  it('the desktop still does, for the three seconds Z can take it back', () => {
    expect(holdsReplies(false)).toBe(true);
  });
});

describe('putting the app away', () => {
  it('writes what is held the moment the page is hidden', () => {
    const doc = page();
    const write = vi.fn();
    writeHeldWhenHidden(doc, write);
    doc.set('hidden');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the page comes back into view', () => {
    const doc = page();
    const write = vi.fn();
    writeHeldWhenHidden(doc, write);
    doc.set('visible');
    expect(write).not.toHaveBeenCalled();
  });

  it('stops listening once let go', () => {
    const doc = page();
    const write = vi.fn();
    const off = writeHeldWhenHidden(doc, write);
    off();
    doc.set('hidden');
    expect(write).not.toHaveBeenCalled();
  });
});

describe('App.tsx uses both', () => {
  it('writes what it holds when a phone hides the page', () => {
    expect(app).toMatch(/onPhone\(\)\s*\?\s*writeHeldWhenHidden\(document,/);
  });
  it('hands a reply to a working agent over at once on a phone', () => {
    // Behind whatever was held before it, which is written first.
    expect(app).toMatch(/if \(!holdsReplies\(onPhone\(\)\)\) \{ void handOverAfter\(\); return; \}/);
  });
  it('and writes any other reply at once on a phone', () => {
    expect(app).toMatch(/holdsReplies\(onPhone\(\)\) \? UNDO_GRACE_MS : 0/);
  });
  it('a reply whose write fails comes back to the box, rather than going nowhere after "Sent"', () => {
    // Measured: a Mac asleep answers the phone "Your computer is not
    // connected", api.answer throws, and on this path the throw used to land
    // inside the hold's timer, where nothing heard it.
    expect(app).toMatch(/catch \(error\) \{\s*setSending\(\(q\) => q\.filter\(\(s\) => s !== mine\)\);\s*putBack\(error\);\s*return;\s*\}/);
  });
  it('and so does one to a working agent, through the same words', () => {
    expect(app).toMatch(/failed: \(error: Error\) => \{[\s\S]{0,200}putBack\(error\);/);
  });
});
