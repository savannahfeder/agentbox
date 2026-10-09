// THE TERMINAL DRAGS TALLER OR WIDER (w-16e47d0836, 2026-10-07).
//
// Her words: "it would be very nice to be able to expand the size of the
// terminal. In most apps you can drag it up or down in terms of sizing but in
// ours you can't." It was a fixed 280px at the bottom (capped at 45% of the
// window) and a fixed 44% at the side, with no edge to take hold of.
//
// Now its top edge (at the bottom) or its left edge (at the side) drags, the
// size is remembered across tasks and restarts, and a double-click puts it back.
// The sizes are clamped so the page above or beside it never disappears.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import postcss from 'postcss';
import { dragSize, readSavedSize, TERMINAL_MIN } from '../shared/terminal-size.mjs';

describe('dragging the edge', () => {
  it('grows by exactly as far as the edge moved', () => {
    expect(dragSize('height', 280, 100, 900)).toBe(380);
    expect(dragSize('width', 540, -40, 1400)).toBe(500);
  });
  it('stops at the smallest size that still shows a few lines', () => {
    expect(dragSize('height', 280, -400, 900)).toBe(TERMINAL_MIN.height);
    expect(dragSize('height', 280, -(280 - TERMINAL_MIN.height), 900)).toBe(TERMINAL_MIN.height);
    expect(dragSize('height', 280, -(280 - TERMINAL_MIN.height) + 1, 900)).toBe(TERMINAL_MIN.height + 1);
    expect(dragSize('width', 540, -900, 1400)).toBe(TERMINAL_MIN.width);
  });
  it('stops short of covering the page it sits in', () => {
    expect(dragSize('height', 280, 5000, 900)).toBe(900 - 120);
    expect(dragSize('height', 280, 900 - 120 - 280, 900)).toBe(780);
    expect(dragSize('height', 280, 900 - 120 - 280 + 1, 900)).toBe(780);
    expect(dragSize('width', 540, 5000, 1400)).toBe(1400 - 320);
  });
  it('a pane too small for both keeps the minimum rather than going negative', () => {
    expect(dragSize('height', 280, 50, 150)).toBe(TERMINAL_MIN.height);
  });
});

describe('the remembered size', () => {
  it('reads what was saved', () => {
    expect(readSavedSize('{"height":420,"width":600}')).toEqual({ height: 420, width: 600 });
    expect(readSavedSize('{"height":420}')).toEqual({ height: 420 });
  });
  it('ignores anything that is not a sensible size', () => {
    expect(readSavedSize(null)).toEqual({});
    expect(readSavedSize('not json')).toEqual({});
    expect(readSavedSize('{"height":-5,"width":"wide"}')).toEqual({});
    expect(readSavedSize('{"height":1e9}')).toEqual({});
    expect(readSavedSize('[1,2]')).toEqual({});
  });
});

describe('the panel', () => {
  const source = fs.readFileSync('renderer/src/components/TaskTerminal.tsx', 'utf8');
  const css = postcss.parse(fs.readFileSync('renderer/src/components/task-terminal.css', 'utf8'));
  const decl = (selector, prop) => {
    let out;
    css.walkRules((r) => { if (r.parent?.type !== 'atrule' && r.selectors.includes(selector)) r.walkDecls(prop, (d) => { out = d.value; }); });
    return out;
  };
  it('has an edge to drag, named for a screen reader, that a double-click resets', () => {
    expect(source).toContain('className="task-terminal-grip"');
    expect(source).toContain('role="separator"');
    expect(source).toContain('onDoubleClick=');
  });
  it('the edge says what it does with the pointer over it', () => {
    expect(decl('.task-terminal-bottom > .task-terminal-grip', 'cursor')).toBe('row-resize');
    expect(decl('.task-terminal-side > .task-terminal-grip', 'cursor')).toBe('col-resize');
  });
  it('draws no handle on the edge, only a hairline (her call: "we want it clean")', () => {
    let handles = 0;
    css.walkRules((r) => { if (r.selectors.some((s) => s.includes('task-terminal-grip') && s.includes('::after'))) handles++; });
    expect(handles).toBe(0);
    expect(decl('.task-terminal-bottom > .task-terminal-grip::before', 'height')).toBe('1px');
    expect(decl('.task-terminal-side > .task-terminal-grip::before', 'width')).toBe('1px');
  });
  it('a dragged size replaces the fixed one, at the bottom and at the side', () => {
    expect(decl('.task-terminal-bottom', 'height')).toContain('var(--task-terminal-h');
    expect(decl('.task-terminal-side', 'width')).toContain('var(--task-terminal-w');
    // The conversation gives up the same width the side terminal takes.
    expect(decl('.focus-pane:has(> .task-terminal-side)', 'padding-right')).toContain('var(--task-terminal-w');
  });
});
