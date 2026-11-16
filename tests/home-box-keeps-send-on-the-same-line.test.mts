// Home's box let its row of controls wrap, so on a team (the Private chip on)
// Send fell onto a line of its own under Claude Code, Opus 5.5, the project,
// Agent Decides and Private. Measured on 2026-11-15 in a 1752 by 986 window:
// the box is 760 wide with the sidebar open or folded, and the row needed more.
// The row now stays on one line and hides its least needed parts first.
import { describe, it, expect } from 'vitest';
import { DROP_ORDER, dropRank, fitRow } from '../renderer/src/threads/fit-row';

type Part = { name: string; width: number; drop?: number };

// A row as a browser lays it out without wrapping: what it shows is the sum of
// the parts not hidden, with an 8px gap between them.
function row(parts: Part[], room: number) {
  const items = parts.map((p) => {
    const attrs = new Map<string, string>(p.drop ? [['data-drop', String(p.drop)]] : []);
    return {
      name: p.name, width: p.width,
      getAttribute: (n: string) => attrs.get(n) ?? null,
      setAttribute: (n: string, v: string) => { attrs.set(n, v); },
      removeAttribute: (n: string) => { attrs.delete(n); },
      shown: () => !attrs.has('data-dropped'),
      droppable: () => attrs.has('data-drop'),
    };
  });
  const used = () => {
    const on = items.filter((i) => i.shown());
    return on.reduce((s, i) => s + i.width, 0) + Math.max(0, on.length - 1) * 8;
  };
  return {
    items,
    clientWidth: room,
    get scrollWidth() { return Math.max(room, used()); },
    querySelectorAll: () => items.filter((i) => i.droppable()),
    hidden: () => items.filter((i) => !i.shown()).map((i) => i.name),
  };
}

const HOME_ON_A_TEAM: Part[] = [
  { name: 'to', width: 98, drop: dropRank('to') },
  { name: 'model', width: 72, drop: dropRank('model') },
  { name: 'project', width: 96 },
  { name: 'priority', width: 128, drop: dropRank('priority') },
  { name: 'private', width: 88 },
  { name: 'attach', width: 24, drop: dropRank('attach') },
  { name: 'send-keys', width: 76, drop: dropRank('send-keys') },
  { name: 'send', width: 92 },
];
const needed = (parts: Part[]) => parts.reduce((s, p) => s + p.width, 0) + (parts.length - 1) * 8;

describe('Home\'s box on one line', () => {
  // Chosen on 2026-11-15: "Agent Decides ... can go first."
  it('hides the priority first', () => {
    expect(DROP_ORDER[0]).toBe('priority');
  });

  it('hides nothing when everything fits', () => {
    const r = row(HOME_ON_A_TEAM, 900);
    expect(fitRow(r)).toBe(0);
    expect(r.hidden()).toEqual([]);
  });

  it('hides nothing when the row fits to the pixel', () => {
    const r = row(HOME_ON_A_TEAM, needed(HOME_ON_A_TEAM));
    expect(fitRow(r)).toBe(0);
  });

  it('hides the least needed part first when one pixel short', () => {
    const r = row(HOME_ON_A_TEAM, needed(HOME_ON_A_TEAM) - 1);
    expect(r.hidden()).toEqual([]);
    fitRow(r);
    expect(r.hidden()).toEqual([DROP_ORDER[0]]);
  });

  it('hides in order, and only as much as it must', () => {
    const r = row(HOME_ON_A_TEAM, 520);
    fitRow(r);
    const hidden = r.hidden().sort((a, b) => dropRank(a as never) - dropRank(b as never));
    expect(hidden.length).toBeGreaterThan(1);
    expect(hidden).toEqual(DROP_ORDER.slice(0, hidden.length));
    expect(r.scrollWidth).toBeLessThanOrEqual(520);
  });

  it('never hides the project, who sees it, or Send', () => {
    const r = row(HOME_ON_A_TEAM, 100);
    fitRow(r);
    expect(r.hidden()).not.toContain('project');
    expect(r.hidden()).not.toContain('private');
    expect(r.hidden()).not.toContain('send');
  });

  it('brings parts back when the room comes back', () => {
    const narrow = row(HOME_ON_A_TEAM, 400);
    fitRow(narrow);
    expect(narrow.hidden().length).toBeGreaterThan(0);
    const wide = { ...narrow, clientWidth: 2000, get scrollWidth() { return 2000; } };
    fitRow(wide);
    expect(narrow.hidden()).toEqual([]);
  });
});
