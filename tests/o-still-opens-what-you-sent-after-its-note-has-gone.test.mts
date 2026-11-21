// O STILL OPENS WHAT YOU SENT AFTER ITS NOTE HAS GONE.
//
// w-cf5b7d8642: "I find myself continuously wanting to hit O ... to open a
// thread that I sent far after the window closes ... I normally find myself
// wanting to reopen it within even 1 minute, typically not more than 30
// seconds, though it can vary ... if it's 30 minutes, you might just
// accidentally hit O and then end up in a random thread, which is no good."
//
// Measured on the browser copy (bin/agentbox.mjs) before the fix, with real key
// presses: a thread sent from the inbox raised "Started in Sandbox · O Open ·
// Z Undo", which went 6.1 s after the send. O at 2 s opened the thread; O at
// 6.1 s and at 10 s left the inbox as it was, because opensTheToast only
// answers while a toast is up.
//
// Now the thread the last note named stays O's for two minutes from when it
// was named. Anything on screen that answers O comes first, and an undo
// forgets it. The rule is pure (renderer/src/toast-parts.ts); the wiring is
// checked by excerpt because there is no render harness for App.tsx.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { O_STILL_OPENS_MS, oIsTheToasts, opensTheLastToast } from '../renderer/src/toast-parts';
import { SHORTCUTS } from '../renderer/src/shortcuts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const goes = { product: 'agentbox', id: 'w-1' };
const named = { goes, at: 1_000 };

describe('an O pressed after the note has gone', () => {
  it('opens the thread the note named, at ten seconds, thirty and a minute', () => {
    for (const s of [10, 30, 60]) expect(opensTheLastToast('o', named, 1_000 + s * 1_000)).toEqual(goes);
    expect(opensTheLastToast('O', named, 11_000)).toEqual(goes);
  });

  it('up to two minutes after it was named, and not from then on', () => {
    expect(O_STILL_OPENS_MS).toBe(120_000);
    expect(opensTheLastToast('o', named, 1_000 + O_STILL_OPENS_MS - 1)).toEqual(goes);
    expect(opensTheLastToast('o', named, 1_000 + O_STILL_OPENS_MS)).toBeNull();
    expect(opensTheLastToast('o', named, 1_000 + 30 * 60_000)).toBeNull();
  });

  it('nothing named, nothing opened', () => {
    expect(opensTheLastToast('o', null, 5_000)).toBeNull();
  });

  it('not from the thread itself, where it would go nowhere', () => {
    expect(opensTheLastToast('o', named, 5_000, { product: 'agentbox', id: 'w-1' })).toBeNull();
    expect(opensTheLastToast('o', named, 5_000, { product: 'agentbox', id: 'w-2' })).toEqual(goes);
    expect(opensTheLastToast('o', named, 5_000, { product: 'other', id: 'w-1' })).toEqual(goes);
  });

  it('a repeating task opens as itself', () => {
    const rule = { goes: { product: 'agentbox', id: 'r-1', repeat: true }, at: 1_000 };
    expect(opensTheLastToast('o', rule, 5_000)).toEqual(rule.goes);
  });

  it('only O', () => {
    for (const k of ['p', 'i', '0', 'z', 'Z', 'Enter', 'Escape']) expect(opensTheLastToast(k, named, 5_000)).toBeNull();
  });

  it('gets past the pages that keep the keyboard, inside the two minutes only', () => {
    expect(oIsTheToasts('o', null, 0, 5_000, named)).toBe(true);
    expect(oIsTheToasts('o', null, 0, 1_000 + O_STILL_OPENS_MS, named)).toBe(false);
    expect(oIsTheToasts('o', null, 0, 5_000, null)).toBe(false);
    expect(oIsTheToasts('p', null, 0, 5_000, named)).toBe(false);
  });
});

describe('the app remembers the thread each note names', () => {
  const show = app.slice(app.indexOf('const showToast = useCallback('), app.indexOf('showToastRef.current = showToast;'));

  it('from every note with somewhere to go, and a note with nowhere to go leaves it', () => {
    expect(show).toContain('if (goes && !goes.warns) lastToast.current = { goes, at: Date.now() };');
  });

  it('but not from a warning about a thread, which is not something you sent', () => {
    // The first E on an agent that waits for you names it and holds the press;
    // the second E closes it. Measured on the browser copy with the warning
    // remembered: send S and T, open S, E, E, then O. O did nothing, and five
    // seconds later the app jumped to S, the thread just closed. Now O opens T.
    expect(app).toContain('showToast(held.say, { ...held.goes, warns: true });');
  });

  it('and forgets it when an undo goes through, so O never opens a thread Z took back', () => {
    const undo = app.slice(app.indexOf('const undo = useCallback('), app.indexOf('// INTO THE ROW THE TOAST IS ABOUT'));
    const grace = undo.slice(undo.indexOf('if (pending) {'), undo.indexOf('return \'done\' as const;'));
    expect(grace).toContain('lastToast.current = null;');
    const stacked = undo.slice(undo.indexOf('return { failed: outcome.refused };'));
    expect(stacked).toContain('lastToast.current = null;');
    // A late Z that only asks, a Z that fails, or one refused changes nothing and keeps it.
    expect(undo.slice(0, undo.indexOf('if (pending) {'))).not.toContain('lastToast.current = null;');
    const asks = undo.slice(undo.indexOf('return \'done\' as const;'), undo.indexOf('return { failed: outcome.refused };'));
    expect(asks).not.toContain('lastToast.current = null;');
  });
});

describe('the key handler answers it', () => {
  const handler = app.slice(app.indexOf('    const onKey = (e: KeyboardEvent) => {'), app.indexOf('      if (focused) {'));
  const at = (s: string) => handler.indexOf(s);
  const late = at('const lastGoesTo = opensTheLastToast(e.key, lastToast.current, Date.now(), focused ? { product: focused.product, id: focused.id } : null);');

  it('opening the thread the way the note would have', () => {
    expect(late).toBeGreaterThan(-1);
    expect(handler).toContain('if (lastGoesTo) { e.preventDefault(); openToastRow(lastGoesTo); return; }');
  });

  it('after everything drawn on screen that answers O: the note, an O held for a send, an urgent thread', () => {
    expect(late).toBeGreaterThan(at('if (goesTo) { e.preventDefault(); openToastRow(goesTo); return; }'));
    expect(late).toBeGreaterThan(at('if (oWaitsForTheSend(e.key, toast, sentAt.current, Date.now())) {'));
    expect(late).toBeGreaterThan(at("if ((e.key === 'o' || e.key === 'O') && urgentShownRow) {"));
  });

  it('after the typing and modal guard, so an O typed in a box stays an O', () => {
    expect(late).toBeGreaterThan(at('if (modal || inInput) {'));
  });

  it('from the Files, Connections and Teammates pages too', () => {
    expect(handler).toContain('const toastsO = oIsTheToasts(e.key, toast, sentAt.current, Date.now(), lastToast.current);');
  });
});

describe('the shortcuts page', () => {
  it('says how long O keeps working', () => {
    const o = SHORTCUTS.flatMap((g) => g.keys).find((k) => k.keys.includes('O'));
    expect(o?.what).toBe('Open the task you sent or answered in the last two minutes.');
  });
});
