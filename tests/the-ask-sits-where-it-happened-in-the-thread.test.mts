// THE ASK SITS WHERE IT HAPPENED IN THE THREAD (w-f702d60afe, bug 8).
//
// On Theo's copy, the ask ("Sam asked you to help 7:25am") was always drawn at
// the bottom of Sam's thread, under Theo's own later reply and under the result
// Sam's agent wrote after it, so the page read as if Sam had asked last.
// Measured on two copies by writing to the agent after the ask and letting the
// agent finish. The ask now goes after what came before it and above what came
// later; the box that answers it stays at the bottom.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { whereTheAskGoes } from '../renderer/src/threads/teammate-thread';

const said = (...ats: number[]) => ats.map((at) => ({ at, who: 'it' as const, text: `at ${at}` }));

describe('where the ask is drawn', () => {
  it('after the messages before it and above the first one after it', () => {
    expect(whereTheAskGoes(said(10, 20, 40, 50), null, 30)).toEqual({ after: 1 });
  });
  it('above everything when it came first', () => {
    expect(whereTheAskGoes(said(40, 50), null, 30)).toBe('top');
  });
  it('at the foot when nothing came after it', () => {
    expect(whereTheAskGoes(said(10, 20), null, 30)).toBe('foot');
    expect(whereTheAskGoes(said(10, 20), { at: 25 }, 30)).toBe('foot');
  });
  it('above a result written after it, even with every message before it', () => {
    expect(whereTheAskGoes(said(10, 20), { at: 40 }, 30)).toEqual({ after: 1 });
    expect(whereTheAskGoes([], { at: 40 }, 30)).toBe('top');
  });
  it('a message at the same moment as the ask counts as before it', () => {
    expect(whereTheAskGoes(said(10, 30, 40), null, 30)).toEqual({ after: 1 });
  });
  it('reads the first later message even when a comment was added out of order', () => {
    // A teammate's comment the owner has not taken in yet is read after the owner's lines.
    expect(whereTheAskGoes(said(10, 40, 20), null, 30)).toEqual({ after: 0 });
  });
  it('at the foot when the ask has no time', () => {
    expect(whereTheAskGoes(said(10, 20), null, null)).toBe('foot');
  });
});

describe('the page', () => {
  const src = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('draws the ask in its place and keeps the box at the bottom', () => {
    expect(src).toMatch(/whereTheAskGoes\(events, built\.outcome, ask\?\.createdAt \?\? null\)/);
    expect(src).toMatch(/tail=\{\(i\) => \(askGoes !== 'top' && askGoes !== 'foot' && i === askGoes\.after \? askBar : null\)\}/);
    expect(src.indexOf("{askGoes === 'top' && askBar}")).toBeLessThan(src.indexOf('<Thread events={events}'));
    expect(src.indexOf("{askGoes === 'foot' && askBar}")).toBeGreaterThan(src.indexOf('{built.outcome && ('));
    expect(src.indexOf("{askGoes === 'foot' && askBar}")).toBeLessThan(src.indexOf('<form className="th-comment"'));
  });
});
