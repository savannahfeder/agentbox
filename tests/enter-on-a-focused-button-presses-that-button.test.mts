// ENTER ON A FOCUSED BUTTON PRESSES THAT BUTTON (w-fbe5e95dea, 2026-11-10).
//
// Two power testers, three times each: on the setup's folder and found-on-this-
// computer screens, Tab put focus on Back and Enter went forward instead; on
// the tutorial's hand-off, Tab focused "Skip the tutorial" and Enter started
// it. Each screen listens for Enter on the window and calls preventDefault,
// which also cancels the focused button's own click. Measured from the run
// reports of 2026-11-10T08-32 and 08-34.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { enterIsTheButtons } from '../renderer/src/focused-button.ts';

const key = (k: string, target: unknown) => ({ key: k, target }) as unknown as KeyboardEvent;
const button = (visible: boolean) => ({ matches: (s: string) => s === ':focus-visible' && visible });
const el = (inButton: boolean, visible = true) => ({ closest: (s: string) => (inButton && s.includes('button') ? button(visible) : null) });

describe('enterIsTheButtons', () => {
  it('is true for Enter and Space on a focused button', () => {
    expect(enterIsTheButtons(key('Enter', el(true)))).toBe(true);
    expect(enterIsTheButtons(key(' ', el(true)))).toBe(true);
  });
  it('is false for Enter with nothing focused', () => {
    expect(enterIsTheButtons(key('Enter', el(false)))).toBe(false);
    expect(enterIsTheButtons(key('Enter', null))).toBe(false);
    expect(enterIsTheButtons(key('Enter', {}))).toBe(false);
  });
  it('is false on a button focused by a mouse click', () => {
    expect(enterIsTheButtons(key('Enter', el(true, false)))).toBe(false);
  });
  it('is false for other keys on a button', () => {
    expect(enterIsTheButtons(key('ArrowDown', el(true)))).toBe(false);
    expect(enterIsTheButtons(key('Escape', el(true)))).toBe(false);
  });
});

const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/components/${f}`, import.meta.url), 'utf8');

describe('every setup screen that takes Enter on the window', () => {
  it('lets a focused button have it', () => {
    for (const f of ['PlanSetup.tsx', 'Onboarding.tsx']) {
      const src = read(f);
      const handlers = src.split(/addEventListener\('keydown'/).length - 1;
      const enterOnWindow = [...src.matchAll(/const on = \(e: KeyboardEvent\) => \{([\s\S]*?)\n {4}\};/g)]
        .map((m) => m[1]).filter((body) => /'Enter'/.test(body));
      expect(handlers).toBeGreaterThan(0);
      for (const body of enterOnWindow) expect(body, `${f}: ${body.slice(0, 80)}`).toMatch(/enterIsTheButtons\(e\)/);
    }
  });
});

describe("Home's keys", () => {
  // Round six: a tester tabbed from Home's New thread box onto its Claude Code
  // button and pressed Enter, twice, and a thread from Needs you opened instead
  // of the agent menu.
  it('leave Enter on a focused button to the button', () => {
    const home = fs.readFileSync(new URL('../renderer/src/home/HomePage.tsx', import.meta.url), 'utf8');
    expect(home).toMatch(/if \(enterIsTheButtons\(e\)\) return;/);
  });
});

describe("Home's J, K and Enter", () => {
  // Round seven: Enter on the project menu of Home's New thread box opened an
  // unrelated thread from Needs you, twice; with the folder picker open the
  // same Enter would reach Home through it.
  const home = fs.readFileSync(new URL('../renderer/src/home/HomePage.tsx', import.meta.url), 'utf8');
  it('stand aside while a dialog, a menu or a list of choices is open', () => {
    expect(home).toMatch(/document\.querySelector\('\.modal-backdrop, \.proj-menu, \[role="listbox"\], \[role="menu"\]'\)/);
  });
  it('stand aside for every control in the New thread box', () => {
    expect(home).toMatch(/if \(t\?\.closest\('\.hm-start'\)\) return;/);
  });
});
