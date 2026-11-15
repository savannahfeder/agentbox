// NEEDS YOU STARTS THE KEYS ON ITS TOP ROW.
//
// A tester opened the app with "Sofia: @Maya can you confirm the launch date?"
// at the top of Needs you and two agent threads under it. The keyboard's mark
// sat on the second row, so the first J went to the third and Enter opened the
// wrong thread first. A mention or an invitation is drawn above the threads and
// is first in J and K's walk (pageStops), but the mark started on the first
// thread because nothing put it on the row above.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');

describe('arriving on Needs you', () => {
  it('puts the mark on the first row above the threads when there is one', () => {
    expect(app).toMatch(/const firstLead = view === 'inbox' && search === null && !focused \? heldLeads\.rows\[0\] \?\? null : null;/);
    expect(app).toMatch(/if \(firstLead && firstLead\.key !== leadStartedOn\.current && cardSel === null && selected === 0\) setCardSel\(`lead\/\$\{firstLead\.key\}`\);/);
  });
  it('only once for that row, so J off it is not pulled back', () => {
    expect(app).toMatch(/leadStartedOn\.current = firstLead\?\.key \?\? null;\n\s+\}, \[firstLead\?\.key\]\);/);
  });
});
