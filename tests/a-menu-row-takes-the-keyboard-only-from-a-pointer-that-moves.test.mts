// A MENU ROW TAKES THE KEYBOARD ONLY FROM A POINTER THAT MOVES.
//
// A tester clicked "Claude Code" in the new thread box, pressed ArrowDown onto
// Codex and then Enter, and the box still said Claude Code. The mouse worked;
// the project menu worked with the same keys.
//
// Measured on a live copy (verify-agentbox live.mjs, real codex present) with
// every focus, pointer and key event logged. The press went: focus on Claude
// Code, ArrowDown moved it to Codex, then a pointerover landed on the Claude
// Code row and that row took focus back, so Enter picked Claude Code. Nothing
// moved the pointer: the page moved under it. Chrome sends pointerover and
// pointerenter when a layout change puts another element under a still
// pointer, and sends no pointermove. Every row took focus on pointerenter. It
// failed 2 times in 4 in the box on the empty inbox and 1 in 4 in the dialog.
// The menus that drop below their word (To, Model) open just under the
// pointer, so a small shift puts a row beneath it; the menus that rise above
// their chip (project, priority) open away from it.
//
// The page moved because the test harness resizes the window between
// commands (its viewport is 900 px tall while it drives and 813 px between),
// but a menu scrolled by the arrows moves rows under a resting pointer the same
// way. So the rows follow the pointer on pointermove, which only a real move
// sends.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const card = read('threads/ThreadComposer.tsx');
const menu = read('threads/ModelMenu.tsx');
const count = (text, s) => text.split(s).length - 1;

describe('the new thread box’s menus', () => {
  it('no row takes focus when the page moves under a resting pointer', () => {
    expect(card).not.toMatch(/onPointerEnter=\{hover\}/);
    expect(menu).not.toMatch(/onPointerEnter=\{onHover\}/);
  });

  it('every row still follows a pointer that moves over it', () => {
    expect(count(card, 'onPointerMove={hover}')).toBeGreaterThanOrEqual(20);
    expect(count(menu, 'onPointerMove={onHover}')).toBe(4);
    expect(card).toMatch(/onHover=\{hover\}/);
  });

  it('a row the keyboard is already on is not focused again', () => {
    expect(card).toContain('if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });');
  });

  it('the arrows still walk the rows and Enter is the row’s own press', () => {
    expect(card).toContain("if (e.key === 'ArrowDown') { e.preventDefault(); rows[(at + 1) % rows.length]?.focus(); return; }");
    expect(card).toContain("if (e.key === 'ArrowUp') { e.preventDefault(); rows[at <= 0 ? rows.length - 1 : at - 1]?.focus(); return; }");
    expect(card).toContain('onClick={() => { chooseAgent(a.id); chooseTo(\'agent\'); }}');
  });
});
