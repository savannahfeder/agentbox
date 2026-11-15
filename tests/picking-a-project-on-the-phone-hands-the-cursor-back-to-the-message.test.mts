// PICKING A PROJECT ON THE PHONE HANDS THE CURSOR BACK TO THE MESSAGE.
//
// 2026-11-08 product-loop workday, issue 23, seen twice: in New thread, after
// picking Website the cursor stayed on the Project row, so what the tester
// typed went nowhere (and a space pressed the row and opened the sheet again).
// Reproduced in the phone preview on 2026-11-09. The sheet keeps focus while
// it fades, so the box takes it back after the fade. The box is native, so
// this pins the code; the preview run is the check that it lands.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');

describe('the New thread form', () => {
  it('focuses the message box when a picker sheet closes', () => {
    expect(SRC).toMatch(/if \(sheet !== null \|\| !was \|\| was === 'later'\) return;/);
    expect(SRC).toMatch(/setTimeout\(\(\) => box\.current\?\.focus\(\), 350\)/);
  });

  it('gives the message box that ref', () => {
    expect(SRC).toMatch(/<TextInput ref=\{box\} multiline/);
  });

  it('leaves Send later alone, which sends rather than going back to typing', () => {
    expect(SRC).toMatch(/was === 'later'\) return/);
  });
});
