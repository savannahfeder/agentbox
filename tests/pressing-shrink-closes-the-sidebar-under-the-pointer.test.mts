// PRESSING SHRINK CLOSES THE SIDEBAR, EVEN WITH THE POINTER ON IT.
//
// The owner, 2026-11-24: "My sidebar won't seem to close. I'll click the
// sidebar close button and it just won't close." The button sits inside the
// sidebar, and the sidebar stays open while it is pointed at, so a press only
// turned off "keep open" and the sidebar stayed until the pointer left it.
// ⌘\ pressed with the pointer over the sidebar did the same. Now a press that
// shrinks it lets go of the pointer as well, and the sidebar forgets the
// pointer was in it, so it opens again only for a pointer that leaves and
// comes back.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SIDEBAR_SHRINKS_KEY, hoverIntent, pressKeepOpen, shrinksFrom, sidebarFolded } from '../renderer/src/sidebar-shrinks.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('a press with the pointer on the sidebar', () => {
  const kept = new Map<string, string>();
  let pointedAt = true;
  const folded = () => sidebarFolded({ phone: false, shrinks: shrinksFrom(kept.get(SIDEBAR_SHRINKS_KEY) ?? null), pointedAt });
  beforeEach(() => {
    kept.clear(); pointedAt = true;
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, String(v)); } };
  });
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

  it('closes a sidebar kept open, there and then', () => {
    kept.set(SIDEBAR_SHRINKS_KEY, '0');
    expect(folded()).toBe(false);
    expect(pressKeepOpen(() => { pointedAt = false; })).toBe(true);
    expect(folded()).toBe(true);
  });
  it('keeps open a sidebar that was only open for the pointer, and leaves the pointer be', () => {
    let letGo = false;
    expect(pressKeepOpen(() => { letGo = true; })).toBe(false);
    expect(letGo).toBe(false);
    expect(folded()).toBe(false);
  });
  it('closes it again on the next press', () => {
    pressKeepOpen(() => { pointedAt = false; });
    pointedAt = true;
    pressKeepOpen(() => { pointedAt = false; });
    expect(folded()).toBe(true);
  });
});

describe('after it closes', () => {
  const open = { left: 14, top: 32, right: 300, bottom: 878 };
  it('a pointer still moving over it does not open it again', () => {
    const intent = hoverIntent();
    expect(intent.move({ x: 320, y: 80 }, { x: 290, y: 80, t: 0 }, open)).toBe(true);
    intent.left();
    expect(intent.move({ x: 290, y: 80, t: 0 }, { x: 288, y: 80, t: 16 }, open)).toBe(false);
  });
});

describe('the app', () => {
  const app = read('renderer/src/App.tsx');
  const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
  it('lets go of the pointer on the button and on ⌘\\', () => {
    expect(app).toContain('const keepOpenPressed = () => pressKeepOpen(() => setRailOpen(false));');
    expect(app).toContain('onKeepOpen={keepOpenPressed}');
    expect(app).toMatch(/e\.key === '\\\\' && !onPhone\(\)\) \{ e\.preventDefault\(\); keepOpenPressed\(\); return; \}/);
    expect(app).not.toMatch(/toggleSidebarShrinks/);
  });
  it('forgets the pointer was in the sidebar once it stops being kept open', () => {
    expect(nav).toMatch(/useEffect\(\(\) => \{\s*if \(keptOpen\) return;\s*intent\.left\(\);/);
  });
});
