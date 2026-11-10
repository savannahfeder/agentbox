// AN OPTION TO CLOSE THE TASK WITH A REASON STILL CLOSES IT (w-4465054f04, 2026-10-22).
//
// In the cloud power test an agent offered "Close this task, since this project
// is only a test project". The tester pressed it and it went out as a reply
// ("Option 2: ..."), which on a finished thread starts another run; he pressed
// Z a quarter of a second later. `closesTheTask` matched only the bare words.
// A reason after the words is still a close; another step after them is not.
import { it, expect } from 'vitest';
import { closesTheTask } from '../renderer/src/format.ts';

it('closes on the option the tester pressed', () => {
  expect(closesTheTask('Close this task, since this project is only a test project')).toBe(true);
});

it('closes on the other ways a reason gets added', () => {
  for (const option of [
    'Close this task because the fix is already on main',
    'Close the thread: nothing is left to do',
    'Close this task (recommended), since it shipped',
    'Close this task — it shipped',
    'Close this task as it is done',
  ]) expect(closesTheTask(option), option).toBe(true);
});

it('still closes on the bare words', () => {
  expect(closesTheTask('Close this task')).toBe(true);
  expect(closesTheTask('Close the task.')).toBe(true);
});

it('does not close when another step comes after the words', () => {
  for (const option of [
    'Close this task, then open a follow-up for the docs',
    'Close this task and file the follow-up',
    'Close this task, and ship the other branch',
    'Ship it, then close the task',
    'Close this tasking window',
    'Close the gap in the sidebar first',
  ]) expect(closesTheTask(option), option).toBe(false);
});
