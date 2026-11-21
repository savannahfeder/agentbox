// A CELL TYPED IN KEEPS ITS WORDS WHEN YOU CLICK ANOTHER.
//
// A synthetic tester on 2026-11-21 (w-a1c984116b) typed a name into a new
// table's first cell, clicked away, and the cell was blank; pressing Enter
// kept it. A press on another cell ends the edit with the draft the table
// holds for the open edit, and typing only ever changed the draft drawn on
// screen, so the press wrote back what the cell held when the edit began.
// Asserted on the source, as the other table tests are, and seen in the app.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../renderer/src/components/TableView.tsx', import.meta.url), 'utf8');
const box = src.slice(src.indexOf('className="tbl-edit-box"'), src.indexOf('onPaste=', src.indexOf('className="tbl-edit-box"')));

it('typing in a cell keeps the open edit\'s draft, which a press elsewhere saves', () => {
  expect(box).toMatch(/onChange=\{\(v\) => \{[^}]*open\.current = \{ \.\.\.open\.current, draft: v \}/);
});

it('a press on another cell still saves the open edit\'s draft, not one from an older render', () => {
  const onDown = src.slice(src.indexOf('const onDown = '), src.indexOf('const onContext = '));
  expect(onDown).toMatch(/endEdit\(editing\.pop === 'tag' \? null : open\.current\?\.draft \?\? editing\.draft\)/);
});
