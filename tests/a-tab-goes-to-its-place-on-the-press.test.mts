// A TAB GOES TO ITS PLACE ON THE PRESS.
//
// The sidebar's places (Home, Inbox, Team, Connections, Files) and the Inbox's
// state tabs (Needs you, In progress, Later, Done) switched on `click`, which
// fires when the button comes up: every move between places waited for the
// release, about 90 ms of a normal click, before any work began. Superhuman
// and Cron switch on the press. Measured in Chromium with the built renderer:
// mousedown at 0 ms, the place changed only after mouseup.
//
// A tab now acts on the press of the main button. A click that the press
// already handled does nothing more, and a click with no press before it
// (Enter or Space on a focused tab, a modifier click) still acts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { actsOnPress } from '../renderer/src/press.ts';

const tab = {};
const down = (over: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, currentTarget: tab, ...over });
const click = (detail: number) => ({ detail, currentTarget: tab });

describe('actsOnPress', () => {
  it('acts once for a mouse click: on the press, not again on the release', () => {
    let n = 0;
    const p = actsOnPress(() => { n++; });
    p.onMouseDown(down());
    expect(n).toBe(1);
    p.onClick(click(1));
    expect(n).toBe(1);
  });

  it('acts on a click from the keyboard, which has no press', () => {
    let n = 0;
    actsOnPress(() => { n++; }).onClick(click(0));
    expect(n).toBe(1);
  });

  it('acts on every one of two quick clicks', () => {
    let n = 0;
    const p = actsOnPress(() => { n++; });
    p.onMouseDown(down()); p.onClick(click(1));
    p.onMouseDown(down()); p.onClick(click(2));
    expect(n).toBe(2);
  });

  it('leaves a right or middle press alone', () => {
    let n = 0;
    const p = actsOnPress(() => { n++; });
    p.onMouseDown(down({ button: 2 }));
    p.onMouseDown(down({ button: 1 }));
    expect(n).toBe(0);
  });

  it('leaves a press with a modifier to its click', () => {
    let n = 0;
    const p = actsOnPress(() => { n++; });
    p.onMouseDown(down({ metaKey: true }));
    expect(n).toBe(0);
    p.onClick(click(1));
    expect(n).toBe(1);
  });

  it('a press dragged off the tab does not swallow the next modifier click', () => {
    let n = 0;
    const p = actsOnPress(() => { n++; });
    p.onMouseDown(down());
    p.onMouseDown(down({ shiftKey: true }));
    p.onClick(click(1));
    expect(n).toBe(2);
  });
});

const nav = readFileSync(new URL('../renderer/src/components/WorkspaceNavigation.tsx', import.meta.url), 'utf8');
const pages = readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');

describe('the tabs that move you between places', () => {
  it('every sidebar place acts on the press', () => {
    const tabs = [...nav.matchAll(/<button data-tab="(\w+)"[^\n]*/g)];
    expect(tabs.map((t) => t[1]).sort()).toEqual(['connections', 'files', 'home', 'inbox', 'team']);
    for (const [tag] of tabs) {
      expect(tag).toMatch(/\{\.\.\.actsOnPress\(/);
      expect(tag).not.toMatch(/onClick=/);
    }
  });

  it('every state tab acts on the press', () => {
    const tabs = [...pages.matchAll(/<button type="button"[^\n]*className=\{`tm-tab[^\n]*/g)];
    expect(tabs.length).toBeGreaterThanOrEqual(4);
    for (const [tag] of tabs) {
      expect(tag).toMatch(/\{\.\.\.actsOnPress\(/);
      expect(tag).not.toMatch(/onClick=/);
    }
  });
});
