// A THREAD YOU FINISHED LEAVES NEEDS YOU, AND A FINISHED ONE STOPS ASKING TO SHIP.
//
// Dev. Three separate causes, each read off the code:
// - "I pressed 1 (Keep it as sent and close this task)" and the row stayed, DONE,
//   in Needs you. The option did not start with "close", so it went out as a reply;
//   the agent then closed the thread, and an agent's done is news to you.
// - "After I pressed 2 Keep it on the branch the thread stayed in Needs you." Same
//   road: a run to be told to do nothing, then its answer waiting on you.
// - Jordan's row said DONE at the top in Needs you: a note on a file held the thread
//   there, and pressing E did not settle the note.
// And "Merged ... nothing is left for you to decide" drew "1 Ship it (recommended)"
// under it, because the app's offer read only that the run left a change.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closesTheTask, leavesItOnTheBranch } from '../renderer/src/format.ts';
import { fileNewsFor } from '../shared/artifact-marks.mts';
import { shipOfferLive } from '../renderer/src/ship-offer.ts';

describe('an option that asks for no work closes the thread without a run', () => {
  it.each([
    'Keep it as sent and close this task',
    'Keep it as is and close the task (recommended)',
    'Leave it as it is, and close this thread',
    'Keep it and close this task',
  ])('%s', (o) => expect(closesTheTask(o)).toBe(true));

  it.each([
    'Keep it on the branch',
    'Keep on branch',
    'Keep it on this branch for now',
    'Leave the change on its branch',
    'Keep the work in the branch (recommended)',
  ])('%s closes it, keeping the branch', (o) => expect(leavesItOnTheBranch(o)).toBe(true));
});

describe('what stays a reply', () => {
  it.each([
    'Ship it, then close the task',
    'Keep the first layout and close this task',
    'Keep going',
    'Close this task, then file the follow-up',
  ])('%s does not close', (o) => expect(closesTheTask(o)).toBe(false));

  it.each([
    'Keep it on the branch and rebase onto main',
    'Keep going on the branch',
    'Keep the first layout on the branch',
    'Merge it',
  ])('%s does not close', (o) => expect(leavesItOnTheBranch(o)).toBe(false));
});

it('the press goes the way E does, naming that its work stays off main', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/leavesItOnTheBranch\(option\.text\)\) \{ await markDone\(item, \{ unshippedOk: true \}\); return; \}/);
});

describe('a note on a file, and your Done', () => {
  const ME = 'jordan';
  const note = (ts) => ({ id: `n${ts}`, by: 'sofia', ts, file: 'cut.mp4', text: 'Redo 0:07', owner: ME });
  const row = (status, close, ...notes) => ({ status, createdBy: ME, wrote: close ? { status: close } : {}, artifacts: { notes } });

  it('waits on you while the thread is open', () => {
    expect(fileNewsFor(row('open', null, note(100)), ME)).toHaveLength(1);
  });
  it('is settled by your Done', () => {
    expect(fileNewsFor(row('done', { ts: 200, by: ME }, note(100)), ME)).toEqual([]);
  });
  it('a note after your Done comes back', () => {
    expect(fileNewsFor(row('done', { ts: 200, by: ME }, note(100), note(300)), ME).map((n) => n.ts)).toEqual([300]);
  });
  it('someone else\'s Done settles nothing for you', () => {
    expect(fileNewsFor(row('done', { ts: 200, by: 'dev' }, note(100)), ME)).toHaveLength(1);
  });
});

describe('the app\'s ship offer', () => {
  const finished = (result) => ({ status: 'open', labels: [], result, wrote: { result: { ts: 10 } } });
  const live = (result) => shipOfferLive(finished(result), { change: true, running: false });

  it('is not drawn when the agent says nothing is left', () => {
    expect(live('Merged the cancel dialog into the branch, and nothing is left for you to decide.')).toBe(false);
    expect(live('Merged into main.')).toBe(false);
    expect(live('It is done. No decision needed from you.')).toBe(false);
  });
  it('is still drawn over a run that left its work on a branch', () => {
    expect(live('Committed as 799c193 on this task\'s branch; the working tree is clean.')).toBe(true);
    expect(live('The two branches can be merged once you say so.')).toBe(true);
    expect(live('Nothing is left to test. Ready to merge.')).toBe(true);
  });
});
