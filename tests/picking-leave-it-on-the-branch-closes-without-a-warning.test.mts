// Picking "Leave it on the branch for now" was refused with "This agent is
// waiting on your answer, and marking it done leaves it stuck. Press again to
// go ahead." Overnight Cloud test, round five, seen twice: the pick is the
// answer the warning asks for, and the second press closed the thread with
// no sign the option had been taken. "Close this task" passed `chosen` to
// markDone, which skips that warning; the leave-it-on-the-branch pick did not.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { leavesItOnTheBranch } from '../renderer/src/format';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('picking leave it on the branch closes without a warning', () => {
  it('closes as a chosen option, as Close this task does', () => {
    const line = app.split('\n').find((l) => l.includes('if (leavesItOnTheBranch(option.text))'));
    expect(line).toBeDefined();
    expect(line).toMatch(/markDone\(item, \{[^}]*chosen: true/);
    expect(line).toMatch(/unshippedOk: true/);
  });

  it('is the option the tester picked, and not one that asks for a change', () => {
    expect(leavesItOnTheBranch('Leave it on the branch for now')).toBe(true);
    expect(leavesItOnTheBranch('Leave it on the branch and fix the time zone check')).toBe(false);
  });
});
