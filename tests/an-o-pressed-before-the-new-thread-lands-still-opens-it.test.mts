// AN O PRESSED BEFORE THE NEW THREAD LANDS STILL OPENS IT.
//
// w-7f2d5329a6: "quite often when i hit "o" after submitting an agent nothing
// happens. i have to hit it again for it to work." Send closes the card and
// says "Starting in <project>…" at once, but that line names no thread: the
// thread's id only arrives with the answer, a round trip later, on the second
// line. An O pressed in that gap met a toast with nowhere to go and did
// nothing; the second press, after the answer, worked. Read off App.tsx: the
// onSending toast is `showToast(sendingLine(...))` with no second argument.
//
// Same for a toast whose thread is not in the lists yet: openToastRow cleared
// the toast and returned, so O did nothing and the toast was gone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { O_WAITS_MS, oWaitsForTheSend, oWaitsFor } from '../renderer/src/toast-parts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const goes = { product: 'agentbox', id: 'w-1' };
const sending = { text: 'Starting in Agentbox…' };

describe('an O pressed while the send is in the air', () => {
  it('waits for the thread, in either case, straight after Send', () => {
    expect(oWaitsForTheSend('o', sending, 1000, 1200)).toBe(true);
    expect(oWaitsForTheSend('O', sending, 1000, 1200)).toBe(true);
  });

  it('up to the edge of the window and not past it', () => {
    expect(oWaitsForTheSend('o', sending, 1000, 1000 + O_WAITS_MS - 1)).toBe(true);
    expect(oWaitsForTheSend('o', sending, 1000, 1000 + O_WAITS_MS + 1)).toBe(false);
  });

  it('not with no send behind it', () => {
    expect(oWaitsForTheSend('o', null, 0, 50_000)).toBe(false);
  });

  it('not once a toast names somewhere: that O is the ordinary one', () => {
    expect(oWaitsForTheSend('o', { text: 'Started', goes }, 1000, 1200)).toBe(false);
  });

  it('only O', () => {
    for (const k of ['p', 'z', 'Enter', '0']) expect(oWaitsForTheSend(k, sending, 1000, 1200)).toBe(false);
  });
});

describe('what a waiting O does as the screen changes', () => {
  const none = () => false;
  const all = () => true;
  const w = { at: 1000, screen: 's' };

  it('opens the thread the next toast names, once it is in the lists', () => {
    expect(oWaitsFor(w, { text: 'Started', goes }, 1500, 's', all)).toEqual({ open: goes, keep: null });
  });

  it('keeps waiting while the toast names nothing yet', () => {
    expect(oWaitsFor(w, sending, 1500, 's', all)).toEqual({ open: null, keep: w });
  });

  it('remembers the thread while its row is still on its way', () => {
    const r = oWaitsFor(w, { text: 'Started', goes }, 1500, 's', none);
    expect(r).toEqual({ open: null, keep: { ...w, goes } });
    // and the toast fading does not lose it
    expect(oWaitsFor(r.keep, null, 1800, 's', all)).toEqual({ open: goes, keep: null });
  });

  it('gives up after the window rather than jumping somewhere later', () => {
    expect(oWaitsFor(w, { text: 'Started', goes }, 1000 + O_WAITS_MS + 1, 's', all)).toEqual({ open: null, keep: null });
  });

  it('gives up when the screen moved under it, so it never pulls you off what you opened since', () => {
    expect(oWaitsFor(w, { text: 'Started', goes }, 1500, 'elsewhere', all)).toEqual({ open: null, keep: null });
  });

  it('nothing waiting, nothing happens', () => {
    expect(oWaitsFor(null, { text: 'Started', goes }, 1500, 's', all)).toEqual({ open: null, keep: null });
  });
});

describe('the app is wired to it', () => {
  const handler = app.slice(app.indexOf('    const onKey = (e: KeyboardEvent) => {'), app.indexOf('      if (focused) {'));

  it('the key handler holds an O pressed during a send', () => {
    expect(handler).toMatch(/if \(goesTo\) \{ e\.preventDefault\(\); openToastRow\(goesTo\); return; \}\s*if \(oWaitsForTheSend\(e\.key, toast, sentAt\.current, Date\.now\(\)\)\) \{/);
  });

  it('any other key lets go of it', () => {
    expect(handler).toContain("if (!HOLDS_A_KEY.has(e.key) && e.key !== 'o' && e.key !== 'O') oWaits.current = null;");
  });

  it('Send starts the window and a failed send ends it', () => {
    expect(app).toMatch(/onSending=\{walkCard \? undefined : \(how\) => \{[\s\S]{0,900}sentAt\.current = Date\.now\(\);/);
    expect(app).toMatch(/onFailed=\{\(said, back\) => \{\s*doneSending\(\);\s*sentAt\.current = 0;\s*oWaits\.current = null;/);
  });

  it('a toast whose row is not in the lists yet keeps the O instead of dropping it', () => {
    const body = app.slice(app.indexOf('const openToastRow = useCallback('), app.indexOf('/* ------------------------------- keyboard'));
    expect(body).toMatch(/if \(!row\) \{ oWaits\.current = \{ at: Date\.now\(\), screen: screenWas\.current, goes: to \}; return; \}/);
  });
});
