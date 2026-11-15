// A thread Sofia closed came back into Needs you labelled "Done".
// She pressed the agent's option 1, "Looks right, close this task".
// `closesTheTask` only knew options that begin with "Close", so the press went
// out as a reply: the agent ran, closed the thread itself, and an agent's Done
// on her thread is news, so it sat in Needs you and the badge until she pressed
// E. Measured by feeding the option she pressed to closesTheTask: false.
import { it, expect } from 'vitest';
import { closesTheTask } from '../renderer/src/format.ts';

it('closes on the option Sofia pressed', () => {
  expect(closesTheTask('Looks right, close this task')).toBe(true);
  expect(closesTheTask('Looks right, close this task (recommended)')).toBe(true);
});

it('closes on the other ways of saying it is right first', () => {
  for (const option of [
    'Looks good, close this task',
    'Looks fine. Close the thread',
    'That looks right, close this task',
    'All good, close this task',
    'Looks right and close this task',
  ]) expect(closesTheTask(option), option).toBe(true);
});

it('does not close when the lead asks for work', () => {
  for (const option of [
    'Fix the heading, then close this task',
    'Looks right, merge it and close this task',
    'Looks right, close this task, then file the follow-up',
    'Mostly right, change the button and close this task',
  ]) expect(closesTheTask(option), option).toBe(false);
});
