// A LONG STATUS LINE STAYS INSIDE ITS BOARD CARD.
//
// What broke (overnight Cloud testers, 2026-11-16): on the board, a Later card
// waiting on a long free-typed name ("Waits on the signed vendor contract and
// the legal review of part 4") ran its status line out of the card and over the
// Done column. The line's state word was `flex: none` and `nowrap`, so it could
// neither shrink nor wrap. Measured in the built renderer at 1440 by 900 with
// the `longwait` fixture: the line ran about 210 points past the card's edge.
//
// Now the words shrink and end in an ellipsis, as the project name beside them
// already did, and the marks and the divider keep their size.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const tsx = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('the state words on a board card', () => {
  it('may shrink, so a long wait cannot push past the card (the reported case)', () => {
    expect(rule('.th-card .m .s')).not.toMatch(/flex: none/);
    expect(rule('.th-card .m .s')).toMatch(/min-width: 0/);
  });

  it('end in an ellipsis, as the project name does', () => {
    for (const sel of ['.th-card .m .s .sw', '.th-card .m .p']) {
      expect(rule(sel)).toMatch(/overflow: hidden/);
      expect(rule(sel)).toMatch(/text-overflow: ellipsis/);
      expect(rule(sel)).toMatch(/white-space: nowrap/);
    }
  });

  it('are held in that span on every kind of line the card draws', () => {
    const line = tsx.slice(tsx.indexOf('<div className="m">{e.task'), tsx.indexOf('{withOthers && <Face'));
    for (const said of ['{e.task.word}', '{onThem}', '{waitWord}', 'Shipped', '{status.word}']) {
      expect(line).toContain(`<span className="sw">${said}</span>`);
    }
  });

  it('do not squeeze the marks or the divider beside them', () => {
    expect(rule('.th-card .m .s::after')).toMatch(/flex: none/);
    expect(rule('.th-card .m .s > :not(.sw)')).toMatch(/flex: none/);
  });
});
