// A CARD DRAWN UNDER A MOUSE THAT HAS NOT MOVED LIGHTS NOTHING.
//
// A tester ran the setup on Linux on 2026-10-25 and photographed "Pick a folder
// for your first project" with "I do not have one, skip for now" lit and
// wearing the Return hint, on a screen they had just arrived at. Nothing had
// been pressed on it and nothing had been pointed at: the plan card before it
// puts a row in the same place, so the mouse that pressed Return there was
// standing over where the skip row landed, and `mouseenter` fires on an
// element drawn under a still pointer. Return skips the folder, so somebody
// walking the setup with Return alone ended it with no project of their own.
//
// The plan card has the same fault one screen earlier and it costs more there:
// a row lit by a mouse nobody moved takes Return off the plan that is already
// signed in and opens a browser sign-in for the other one.
//
// `hoverLit` is the rule both cards ask: the pointer has to have moved on this
// screen before what is under it counts as a choice.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hoverLit } from '../renderer/src/onboarding.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/** The source without its essays, so a paragraph quoting the fault cannot
 *  pass for the fix. The same guard `the-walk-holds-her-to-the-beat` uses. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const folders = strip(read('renderer/src/components/Onboarding.tsx'));
const plans = strip(read('renderer/src/components/PlanSetup.tsx'));

describe('what the mouse may light', () => {
  // THE REPORTED CASE. Nothing lit, the card appears under the pointer, and
  // the row it appears under asks to be lit.
  it('lights nothing on a screen the pointer has not moved on', () => {
    expect(hoverLit(-1, 2, false)).toBe(-1);
  });

  // THE BOUNDARY ON THE OTHER SIDE: the keyboard lit a row, and a card redrawn
  // under the still pointer must not take Return off it.
  it('leaves the row the keyboard lit where it is', () => {
    expect(hoverLit(0, 2, false)).toBe(0);
  });

  // AND THE CASE THAT MUST STILL MATCH: a mouse somebody really moved.
  it('lights the row under a pointer that has moved', () => {
    expect(hoverLit(-1, 2, true)).toBe(2);
    expect(hoverLit(0, 2, true)).toBe(2);
  });
});

describe('both cards ask it', () => {
  it('lights a folder row only through the rule', () => {
    expect(folders).toMatch(/const light = \(row: number, how: 'mouse' \| 'key'\)/);
    expect(folders).toMatch(/how === 'mouse' \? hoverLit\(l, row, stirred\.current\) : row/);
    // No row lights itself on hover any more.
    expect(folders).not.toMatch(/onMouseEnter=\{\(\) => setLit\(/);
    expect(folders).toMatch(/onMouseEnter=\{\(\) => light\(/);
  });

  it('lights a plan row only through the rule', () => {
    expect(plans).toMatch(/onMouseEnter=\{\(\) => setLit\(\(l\) => hoverLit\(/);
    expect(plans).not.toMatch(/onMouseEnter=\{\(\) => setLit\([^(]/);
  });

  // The flag is what the rule reads, and only a movement of the mouse may set
  // it. Reading it off `mouseover` or `mouseenter` would be the same bug with
  // another name on it. It is taken in the capture phase, so the first
  // movement has counted before the row under the pointer asks to be lit.
  it('only a movement of the mouse ends the stillness', () => {
    for (const code of [folders, plans]) {
      expect(code).toMatch(/addEventListener\('mousemove', on, \{ capture: true \}\)/);
      expect(code).toMatch(/stirred\.current = true/);
    }
    expect(folders).toMatch(/stirred\.current = false/);
  });

  // AND A POINTER ALREADY INSIDE THE ROW STILL LIGHTS IT. `mouseenter` fires
  // once, when the pointer crosses into the row, which for a card drawn
  // underneath it has already happened; the rows listen for the movement too,
  // so the first time the mouse really moves the row lights.
  it('lights the row the pointer is already inside once it moves', () => {
    for (const code of [folders, plans]) expect(code).toMatch(/onMouseMove=\{\(\) =>/);
  });

  // Tab still lights the row it lands on: that IS somebody choosing, and the
  // walk's own rule is that the arrows and the keyboard never disagree about
  // which row Return takes.
  it('leaves focus lighting the row it lands on', () => {
    expect(folders).toMatch(/onFocus=\{\(\) => light\([^)]*'key'\)\}/);
  });
});

/*
 * AND THE OTHER HALF OF THE SAME SCREENSHOT. Whatever lit that row, Return
 * took it: the walk was photographed on "Pick a folder for your first
 * project" with the skip row lit and the Return hint on it, and the tester's
 * note says what that costs. "Users moving through onboarding with Enter end
 * up with no project of their own."
 *
 * So skipping the folder is the keyboard's alone. The mouse may light the row
 * and click it, which is somebody saying they have no folder; a hand resting
 * on the mouse is not. The cap goes with the promise: on a row the mouse lit,
 * Return is not drawn there, so nothing on the screen says it would work.
 */
describe('the row that skips the folder', () => {
  it('answers Return only when the keyboard lit it', () => {
    expect(folders).toMatch(/e\.key === 'Enter' && lit > rows\) \{ e\.preventDefault\(\); if \(!byMouse\) skipFolder\(\); return; \}/);
  });

  it('draws no Return cap while the mouse is what lit it', () => {
    expect(folders).toContain('{lit === (recent?.length ?? 0) + 1 && !byMouse && <Cap cap="↵" />}');
  });

  // THE CASE THAT MUST STILL WORK: the arrows and Tab are the keyboard, so the
  // row they light is a row Return takes.
  it('leaves the keyboard its way out', () => {
    expect(folders).toMatch(/ArrowDown'\) \{ e\.preventDefault\(\); setByMouse\(false\);/);
    expect(folders).toMatch(/ArrowUp'\) \{ e\.preventDefault\(\); setByMouse\(false\);/);
  });

  // And a click is a click: the row still does what it says when it is pressed.
  it('still skips when the row itself is clicked', () => {
    expect(folders).toMatch(/onClick=\{skipFolder\}/);
  });
});
