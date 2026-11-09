// THE CONNECTIONS PAGE PUTS WHAT IS CONNECTED FIRST, AND ITS SEARCH IN THE HEADER.
//
// What was wrong (2026-11-02, the light-mode picture of the page): the search
// sat on a row of its own under the title, and "Add any tool by its address"
// was a bare full-width field at the foot of the page that read like part of
// the last group. Measured here: the groups the page draws and their order,
// the search and Add by address landing in the header's corner, and the field
// only appearing once Add by address is pressed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pageGroups } from '../renderer/src/connections/connections-shown';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const groups = [{ id: 'docs', name: 'Documents' }, { id: 'work', name: 'Tracking and code' }];
const tiles = [
  { id: 'notion', name: 'Notion', group: 'docs', connected: false },
  { id: 'linear', name: 'Linear', group: 'work', connected: true },
  { id: 'drive', name: 'Google Drive', group: 'docs', connected: true },
  { id: 'github', name: 'GitHub', group: 'work', connected: false },
  { id: 'mine', name: 'mcp.example.com', group: 'added', connected: false },
];

describe('the order', () => {
  it('what is connected comes first, in a group of its own, then each catalogue group', () => {
    const out = pageGroups(tiles, groups, '');
    expect(out.map((g) => g.name)).toEqual(['Connected', 'Documents', 'Tracking and code', 'Added by address']);
    expect(out[0].tiles.map((t) => t.id)).toEqual(['linear', 'drive']);
    expect(out[1].tiles.map((t) => t.id)).toEqual(['notion']);
  });

  it('with nothing connected there is no empty Connected group', () => {
    const out = pageGroups(tiles.map((t) => ({ ...t, connected: false })), groups, '');
    expect(out[0].name).toBe('Documents');
  });

  it('a search keeps the order and drops a group with nothing left', () => {
    expect(pageGroups(tiles, groups, 'notion').map((g) => g.name)).toEqual(['Documents']);
    expect(pageGroups(tiles, groups, 'zzz')).toEqual([]);
  });
});

describe('the header', () => {
  const src = read('renderer/src/connections/ConnectionsPlace.tsx');
  const app = read('renderer/src/App.tsx');
  it('the search and Add by address are drawn in the page header, not on a row of their own', () => {
    expect(src).toMatch(/createPortal\(/);
    expect(src).not.toMatch(/cn-bar/);
    expect(app).toMatch(/connectionsShown && <span[^>]*ref=\{setConnectionsCorner\}/);
    expect(app).toMatch(/<ConnectionsPlace [^>]*corner=\{connectionsCorner\}/);
  });

  it('Add by address is a small control that opens its field, not a bare field on the page', () => {
    expect(src).toContain('>Add by address<');
    expect(src).not.toContain('Add any tool by its address');
    expect(src).toMatch(/adding && <AddByAddress/);
  });
});
