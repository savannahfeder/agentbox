// A KEPT REPLY ON THE PHONE OPENS WITH THE CURSOR AFTER ITS WORDS.
//
// 2026-11-08 product-loop workday, issue 12: a half-typed reply was kept when
// the tester left the thread, but tapping Reply put the cursor before it, so
// " time" went on the front and the agent got " timeand add a regression test
// ...". Reproduced in the phone preview on 2026-11-09 ("nowand add a test").
// The box is native, so this pins the code that places the cursor; the
// preview run is the check that it lands.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');

describe('the reply box', () => {
  it('opens from Reply with the cursor at the end of the kept draft', () => {
    expect(SRC).toMatch(/const openReply = \(\) => \{ setCaret\(\{ start: draft\.text\.length, end: draft\.text\.length \}\); setOpen\(true\); \};/);
    expect(SRC).toMatch(/onPress=\{openReply\} accessibilityRole="button" accessibilityLabel="Reply"/);
  });

  it('gives the cursor back once the box has it, so a tap can move it', () => {
    expect(SRC).toMatch(/selection=\{caret\} onFocus=\{\(\) => setTimeout\(\(\) => setCaret\(undefined\), 0\)\}/);
  });
});
