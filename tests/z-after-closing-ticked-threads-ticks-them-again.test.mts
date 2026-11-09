// E AFTER Z CLOSED A THREAD NOBODY TICKED.
//
// A tester ticked three threads in Needs you, pressed E (all three closed), Z
// (all three came back) and E again. The three stayed, and a fourth thread went
// to Done. The close had emptied the ticks, so the second E had no ticks to act
// on and fell through to the keyboard's place. That place follows its thread
// (cursor-follows.ts): when the three left, it settled on the row that slid up
// under it, and when they came back it stayed on that row, now fourth.
//
// Measured through the real cursor rule on a six-row list: closing rows 1-3
// with the cursor on row 1 leaves it on row 4 after the Z. So a Z that puts
// back a ticked close now ticks the same rows again, and the next E closes
// them, as the first did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cursorIndex, cursorMark } from '../renderer/src/cursor-follows.ts';
import { ticksAfterUndo } from '../renderer/src/undo-window.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const row = (id) => ({ id, product: 'p' });
const all = ['a', 'b', 'c', 'd', 'e', 'f'].map(row);
const ticked = ['a', 'b', 'c'];

// The keyboard's place across one change of list, as App.tsx works it out each render.
const settle = (list, selected, last) => {
  const at = cursorIndex({ list, selected, last });
  return { at, mark: cursorMark(list, at) };
};

describe('closing ticked rows and taking it back with Z', () => {
  it('leaves the keyboard on a row nobody ticked, which is why the ticks have to come back', () => {
    let s = settle(all, 0, null);
    expect(all[s.at].id).toBe('a');
    const without = all.filter((r) => !ticked.includes(r.id));
    s = settle(without, s.at, s.mark);
    s = settle(all, s.at, s.mark);
    expect(all[s.at].id).toBe('d');
  });

  it('ticks the three it put back, so the next E closes those three', () => {
    expect([...ticksAfterUndo(ticked, new Set())]).toEqual(ticked);
  });

  it('ticks only what that close took, not a row still ticked beside it', () => {
    // One of four was kept open (its work never reached main) and stayed ticked.
    expect([...ticksAfterUndo(ticked, new Set(['k']))]).toEqual(ticked);
  });

  it('leaves the ticks alone when the Z was not a ticked close', () => {
    const now = new Set(['x']);
    expect(ticksAfterUndo(undefined, now)).toBe(now);
    expect(ticksAfterUndo([], now)).toBe(now);
    expect(ticksAfterUndo(undefined, new Set()).size).toBe(0);
  });
});

describe('App.tsx carries the ticks from the close to the Z', () => {
  const batch = app.slice(app.indexOf('const batchDone = useCallback'), app.indexOf('const working = useCallback'));
  const undo = app.slice(app.indexOf('const undo = useCallback'), app.indexOf('const openRepeatRef'));

  it('the ticked close names the rows it closed on its undo entry', () => {
    expect(batch).toMatch(/pushUndo\(\{[^\n]*ticks: targets\.map\(\(i\) => i\.id\)/);
  });

  it('the Z ticks them once they are back, and E over ticks is the ticked close', () => {
    expect(undo).toContain('setMultiSel((m) => ticksAfterUndo(last.ticks, m));');
    expect(undo.indexOf('ticksAfterUndo(last.ticks')).toBeGreaterThan(undo.indexOf('await refresh();'));
    expect(app).toContain('else if (multiSel.size) batchDone(multiSel);');
  });

  it('a single close names no ticks, so its Z leaves them as they are', () => {
    const single = app.slice(app.indexOf('const markDone = useCallback'), app.indexOf('const reopenDone = useCallback'));
    expect(single).not.toMatch(/ticks:/);
  });
});
