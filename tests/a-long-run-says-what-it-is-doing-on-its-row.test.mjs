// A LONG RUN SAYS WHAT IT IS DOING ON ITS ROW.
//
// Round one: the Quality lead's triage and the API agent went quiet for 15 to 25
// minutes with nothing on the row but "Working". The step was known, in the
// session's activity, and only the open thread and the teammate's chat drew it.
//
// Measured: a row's aside never reads `session.activity`. A row with nothing to
// say must stay as it was: no line for a run just started, and none once it ends.
//
// The row reached the line through `toApproveWords(...) ?? doing`, and
// toApproveWords answers '' for no tasks, so the line was never drawn.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { doingWords } from '../renderer/src/live-line';
import { toApproveWords } from '../renderer/src/threads-made.ts';

const min = 60_000;
const session = (over) => ({ startedAt: 0, activity: [], ...over });

describe('the row\'s one line', () => {
  it('names the step the run is on', () => {
    const line = doingWords(session({ activity: [{ id: 'a', label: 'Reading checkout.ts', detail: '', startedAt: 10 * min }] }), 15 * min);
    expect(line).toBe('Reading checkout.ts, 5m');
  });

  it('takes the newest step of several', () => {
    const line = doingWords(session({ activity: [
      { id: 'a', label: 'Reading a', detail: '', startedAt: 0 },
      { id: 'b', label: 'Editing b', detail: '', startedAt: 14 * min },
    ] }), 15 * min);
    expect(line).toMatch(/^Editing b/);
  });

  it('says Thinking, with how long, when a long run has named no step', () => {
    expect(doingWords(session({ startedAt: 0 }), 20 * min)).toBe('Thinking, 20m');
  });

  it('stays quiet on a run just started with nothing to name', () => {
    expect(doingWords(session({ startedAt: 0 }), 30_000)).toBeNull();
  });

  it('a step just begun has no time on it', () => {
    expect(doingWords(session({ activity: [{ id: 'a', label: 'Reading a', detail: '', startedAt: 0 }] }), 10_000)).toBe('Reading a');
  });

  it('says nothing with no session', () => {
    expect(doingWords(null, 20 * min)).toBeNull();
    expect(doingWords(undefined, 20 * min)).toBeNull();
  });

  it('cuts a long step to one line', () => {
    const line = doingWords(session({ activity: [{ id: 'a', label: 'x'.repeat(200), detail: '', startedAt: 0 }] }), 1000);
    expect(line.length).toBeLessThanOrEqual(80);
  });
});

describe('the row', () => {
  it('draws the line when no task waits to be approved', () => {
    expect(toApproveWords(undefined)).toBe('');
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/toApproveWords\(waiting\.get\(`\$\{item\.product\}\/\$\{item\.id\}`\)\) \|\| doing\)/);
  });
});
