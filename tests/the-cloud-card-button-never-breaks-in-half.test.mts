// THE CLOUD CARD'S BUTTON NEVER BREAKS IN HALF (w-3e64dfa2cb).
//
// What broke: on the board, the dashed "This Mac is running all it can" card
// at the foot of In progress drew its button as "START IN THE" over "CLOUD"
// whenever the column was near its 260-point floor. Measured on the built
// renderer in a 1000-point window: the row needs about 246 points and the
// card's inside is 228, the count was `flex: none`, so the button's label
// was the one thing left to wrap. At 1512 points the card is 253 inside, so
// a fix must still keep the button on the right there.
//
// Now the label keeps to one line, and a card too narrow for both puts the
// whole button on a line of its own under the count.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const rule = (sel) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('the cloud card on the board', () => {
  it('keeps the button label on one line', () => {
    expect(rule('.th-offer-card-go')).toMatch(/white-space: nowrap/);
    expect(rule('.th-offer-card-go')).toMatch(/flex: none/);
  });
  it('lets the button move under the count rather than squeeze it', () => {
    expect(rule('.th-offer-card .m')).toMatch(/flex-wrap: wrap/);
  });
  it('keeps the button on the right on one line and at the left once it wraps', () => {
    // An auto margin would push a wrapped button to the right of its own line.
    expect(rule('.th-offer-card .m')).toMatch(/justify-content: space-between/);
    expect(rule('.th-offer-card-go')).not.toMatch(/margin-left: auto/);
  });
  it('holds the cloud and the count together, so space-between cannot pull them apart', () => {
    expect(rule('.th-offer-count')).toMatch(/display: inline-flex/);
    const tsx = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(tsx).toMatch(/<span className="th-offer-count"><CloudIcon \/><span className="p">/);
  });
  it('leaves the ordinary cards alone', () => {
    expect(rule('.th-card .m')).not.toMatch(/flex-wrap/);
  });
});
