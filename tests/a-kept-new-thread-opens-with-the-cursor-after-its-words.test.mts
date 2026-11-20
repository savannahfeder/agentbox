// A KEPT NEW-THREAD DRAFT ON THE PHONE OPENS WITH THE CURSOR AFTER ITS WORDS.
//
// 2026-11-19 product-loop workday, issues 11 and 14: a tester closed New
// thread with "check this screenshot for the white flash" typed, reopened it
// (the draft was back, cursor before it), typed a new task and sent
// "explain this error: import cycle not allowedcheck this screenshot for the
// white flash". The reply box was fixed the same way on 2026-11-09. The box is
// native, so this pins the code that places the cursor.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
const box = SRC.slice(SRC.indexOf('<TextInput ref={box}'));
const input = box.slice(0, box.indexOf('/>'));

describe('the New thread box', () => {
  it('starts with the cursor at the end of the kept draft', () => {
    expect(SRC).toMatch(/useState<\{ start: number; end: number \} \| undefined>\(\(\) => \(\{ start: draft\.text\.length, end: draft\.text\.length \}\)\)/);
    expect(input).toMatch(/selection=\{caret\}/);
  });

  it('gives the cursor back once the box has it, and still tells the page it has focus', () => {
    expect(input).toMatch(/onFocus=\{\(\) => \{ setTimeout\(\(\) => setCaret\(undefined\), 0\); onFocus\?\.\(\); \}\}/);
  });
});
