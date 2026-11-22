// A BOARD CARD'S SHADOW IS NOT CUT OFF AT ITS COLUMN'S SIDES.
//
// What broke (iOS Simulator, redesign, 2026-11-22): on Everything else → Board
// each card's shadow stopped in a hard vertical line at both sides of its
// column, because an iOS scroll view clips to its bounds and the cards filled
// the column's scroll view edge to edge. Read from `Board` in app/index.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const index = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const board = index.slice(index.indexOf('function Board('), index.indexOf('function Board(') + 4000);
const column = board.slice(board.indexOf('<ScrollView key={c.state}'), board.indexOf('>', board.indexOf('<ScrollView key={c.state}')));

describe("a board column's scroll view", () => {
  it('is wider than its cards by the shadow, on both sides', () => {
    expect(column).toMatch(/width: col \+ SHADE \* 2/);
    expect(column).toMatch(/paddingHorizontal: SHADE/);
  });
  it('gives the extra width back, so the columns still sit and snap where they did', () => {
    expect(column).toMatch(/marginHorizontal: -SHADE/);
    expect(board).toMatch(/snapToInterval=\{col \+ 12\}/);
  });
  it("leaves room for the whole of a card's shadow", () => {
    expect(index).toMatch(/const SHADE = 16;/);
    const theme = fs.readFileSync('mobile/src/ui/theme.ts', 'utf8');
    expect(theme).toMatch(/shadowRadius: far \? 32 : 16/);
  });
});
