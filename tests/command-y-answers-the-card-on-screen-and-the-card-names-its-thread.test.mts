// ⌘Y did nothing from the Inbox, three times running:
// Dev pressed it with the card "... asks to use Test tracker / create_issue"
// over the Today page, waited 3 seconds, then clicked Allow, which worked. The
// chord is answered in the main process, ahead of the page, and only for a key
// the window itself received; a key that reaches the page any other way (the
// keys sent by a script, a remote keyboard) was answered by nobody, while the card kept
// printing "⌘Y / ⌘N". The same card named its thread by Dev's first sentence
// cut off ("Write a small Python function ... (2 to..."), not by the thread's
// name, and its body stopped after a few lines.
//
// Now the page answers ⌘Y and ⌘N itself when main did not (main takes the key
// away when it does, so one press is one answer), the card says the thread's
// name, and the body has room for a whole ask before it scrolls.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardChord } from '../renderer/src/approval-stage.ts';

const key = (k, o = {}) => ({ key: k, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...o });

describe('a chord the page hears', () => {
  it('⌘Y allows and ⌘N denies the card on screen', () => {
    expect(cardChord(key('y'), 'c1')).toEqual({ id: 'c1', allow: true });
    expect(cardChord(key('N'), 'c1')).toEqual({ id: 'c1', allow: false });
    expect(cardChord(key('y', { metaKey: false, ctrlKey: true }), 'c1')).toEqual({ id: 'c1', allow: true });
  });
  it('answers nothing with no card on screen, or for another chord', () => {
    expect(cardChord(key('y'), null)).toBe(null);
    expect(cardChord(key('y', { shiftKey: true }), 'c1')).toBe(null);
    expect(cardChord(key('y', { altKey: true }), 'c1')).toBe(null);
    expect(cardChord(key('y', { metaKey: false }), 'c1')).toBe(null);
    expect(cardChord(key('k'), 'c1')).toBe(null);
  });
});

describe('the page wiring', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('answers the chord the way Allow and Deny do, ahead of every other key', () => {
    const onKey = app.slice(app.indexOf('const onKey = (e: KeyboardEvent) => {'));
    const chord = onKey.indexOf('cardChord(e, cardOnStage.current,');
    expect(chord).toBeGreaterThan(0);
    expect(chord).toBeLessThan(onKey.indexOf("e.key.toLowerCase() === 'k'"));
  });
  it('names the asking thread by its name, not its first message', () => {
    expect(app).toMatch(/approvalAsker\(row \? rowTitle\(row\) : null,/);
    expect(app).not.toMatch(/approvalAsker\(row\?\.title/);
  });
  it('gives the ask room before it scrolls', () => {
    const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    const rule = /\.approval-cmd \{[^}]*\}/.exec(css)[0];
    expect(rule).toMatch(/overflow-y: auto/);
    expect(rule).not.toMatch(/max-height: 120px/);
  });
});
