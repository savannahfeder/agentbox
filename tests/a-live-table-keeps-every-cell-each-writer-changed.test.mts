// A LIVE TABLE KEEPS EVERY CELL EACH WRITER CHANGED.
//
// A table used to be written whole over its file, refused when the file had
// moved: measured on 2026-11-06 by replaying N saves through it,
// any number of writers past one kept exactly one edit. In a live table each
// cell is its own entry under a row and a column that keep their ids, so edits
// to different cells all land, a row added or taken away does not move anyone's
// edit to another row, and two edits to one cell settle on one value everywhere.
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { gridOf, putGrid, seedGrid } from '../renderer/src/live/table-doc.ts';

const grid = [['Name', 'Stage', 'Owner'], ['Acme', 'Lead', 'Ana'], ['Birch', 'Call', 'Ben'], ['Cove', 'Lead', 'Cy']];

function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  seedGrid(a, grid);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const sync = () => {
    const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
    const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
    Y.applyUpdate(b, ua);
    Y.applyUpdate(a, ub);
  };
  return { a, b, sync };
}
const edit = (doc, fn) => { const before = gridOf(doc); const next = before.grid.map((r) => [...r]); fn(next); putGrid(doc, before, next); };

describe('a live table', () => {
  it('reads back the grid it was seeded with', () => {
    const { a, b } = pair();
    expect(gridOf(a).grid).toEqual(grid);
    expect(gridOf(b).grid).toEqual(grid);
  });

  it('keeps two writers changing different cells of one row', () => {
    const { a, b, sync } = pair();
    edit(a, (g) => { g[1][1] = 'Won'; });
    edit(b, (g) => { g[1][2] = 'Bo'; });
    sync();
    expect(gridOf(a).grid[1]).toEqual(['Acme', 'Won', 'Bo']);
    expect(gridOf(b).grid).toEqual(gridOf(a).grid);
  });

  it('keeps an edit on its row when another writer deletes a row above it', () => {
    const { a, b, sync } = pair();
    edit(a, (g) => { g.splice(1, 1); });
    edit(b, (g) => { g[3][1] = 'Signed'; });
    sync();
    expect(gridOf(a).grid).toEqual([['Name', 'Stage', 'Owner'], ['Birch', 'Call', 'Ben'], ['Cove', 'Signed', 'Cy']]);
    expect(gridOf(b).grid).toEqual(gridOf(a).grid);
  });

  it('keeps rows two writers each added', () => {
    const { a, b, sync } = pair();
    edit(a, (g) => { g.push(['Dune', 'Lead', 'Di']); });
    edit(b, (g) => { g.push(['Elm', 'Call', 'Ed']); });
    sync();
    const names = gridOf(a).grid.slice(1).map((r) => r[0]);
    expect(names).toEqual(expect.arrayContaining(['Acme', 'Birch', 'Cove', 'Dune', 'Elm']));
    expect(names).toHaveLength(5);
    expect(gridOf(b).grid).toEqual(gridOf(a).grid);
  });

  it('settles one cell changed two ways on the same value everywhere', () => {
    const { a, b, sync } = pair();
    edit(a, (g) => { g[2][1] = 'Won'; });
    edit(b, (g) => { g[2][1] = 'Lost'; });
    sync();
    expect(['Won', 'Lost']).toContain(gridOf(a).grid[2][1]);
    expect(gridOf(b).grid[2][1]).toBe(gridOf(a).grid[2][1]);
  });

  it('adds and renames a column without touching the cells under the others', () => {
    const { a, b, sync } = pair();
    edit(a, (g) => { g[0][1] = 'Status'; });
    edit(b, (g) => { g.forEach((r, i) => r.push(i ? '' : 'Notes')); g[1][3] = 'call back'; });
    sync();
    expect(gridOf(a).grid[0]).toEqual(['Name', 'Status', 'Owner', 'Notes']);
    expect(gridOf(a).grid[1]).toEqual(['Acme', 'Lead', 'Ana', 'call back']);
  });

  it('writes nothing for an edit that changed nothing', () => {
    const { a } = pair();
    let updates = 0;
    a.on('update', () => { updates += 1; });
    edit(a, () => {});
    expect(updates).toBe(0);
  });
});
