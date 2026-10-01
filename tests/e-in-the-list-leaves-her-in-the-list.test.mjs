// E IN THE LIST LEAVES HER IN THE LIST.
//
// It was never a walk bug. Resolving something has advanced to the next task
// since 2026-08-03, which is right from INSIDE a task and wrong from the list,
// and nothing had ever told the two apart. So every E on a row, every Close
// from the palette and every approval taken with no task open closed one thing
// and then opened another.
//
// Measured on the built app before and after, three examples in the inbox and E
// pressed once per row: a reading pane
// was up after two of the three presses before, and after none of them now,
// with the three rows leaving the list one at a time.
//
// AND THE FLOW SHE ALREADY HAS IS NOT THE PRICE OF IT. The same script opens a
// task and presses E in it, and that still lands on the next task; both halves
// have to pass or the script fails.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceAfter } from '../renderer/src/advance.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

describe('closing something from the list', () => {
  it('does not open anything', () => {
    expect(advanceAfter({ fromTask: false, index: 0, id: 'w-ex1' })).toBe(null);
  });

  it('does not open anything wherever the row sat', () => {
    for (const index of [0, 1, 2, 17]) {
      expect(advanceAfter({ fromTask: false, index, id: 'w-x' })).toBe(null);
    }
  });
});

describe('closing something from inside a task', () => {
  it('opens whatever takes its place', () => {
    expect(advanceAfter({ fromTask: true, index: 2, id: 'w-ex1' }))
      .toEqual({ index: 2, excludeId: 'w-ex1' });
  });

  // An agent row closed from the panel, or a row already on its way out of the
  // fold, is in no slot at all, and there is nothing to advance to.
  it('opens nothing when the item was not in the inbox', () => {
    expect(advanceAfter({ fromTask: true, index: -1, id: 'agent:412' })).toBe(null);
  });
});

describe('the app', () => {
  // ONE PLACE, NOT EIGHT. Eight branches resolve something (E on a row, E in a
  // task, a reply, an option, an approval, the palette's Close, a bulk close,
  // an agent row), and they all go through deferCommit → noteAdvance. The rule
  // is asked once, there, for the same reason keys.ts exists.
  it('asks the rule whether a task was open, in the one place that advances', () => {
    expect(app).toContain("import { advanceAfter, nextAfterAdvance, type Advance } from './advance'");
    expect(app).toMatch(/advanceRef\.current = advanceAfter\(\{ fromTask: !!focused, index, id: item\.id \}\)/);
    // And the answer has to be able to change when she opens or leaves a task,
    // or narrows the inbox (the filtered inbox, w-27759abd33).
    expect(app).toMatch(/const noteAdvance = useCallback\([\s\S]*?\}, \[shownInbox, focused\]\);/);
  });
});
