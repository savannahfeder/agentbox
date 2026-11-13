// A TESTER'S LOOK SAYS WHICH ROW IS TICKED (w-d19fcb9309).
//
// Fourth synthetic team run, 2026-11-09: Maya picked Lena under Share… ›
// Chosen people… three times and logged "no visible selected state". Lena
// could open the thread each time; the row carried its tick and
// aria-current, but browse.mjs listed every row by its words alone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');

describe('what a tester reads of a menu', () => {
  it('marks a row that is chosen, current, pressed or selected', () => {
    expect(browse).toContain("const ticked = ['aria-current', 'aria-checked', 'aria-pressed', 'aria-selected'].some((a) => el.getAttribute(a) === 'true');");
    expect(browse).toContain("(ticked ? '  (ticked)' : '')");
  });
});
