// A THREAD SHOWS A CLOUD HAND-BACK AS THE MOVE, NOT AS THE MARKED LINE.
//
// What broke (2026-10-17, seen in a real run through a test copy of the app):
// a cloud run that needed the computer ended on its marked line, and the
// thread drew it as a step, "Read files, [agentbox: needs the computer". A
// trace line that starts with a bracket is read as a tool call, and the
// marked line then started with one. The marker no longer does, and the
// thread draws the cloud's hand-back as one quiet step, "Moved to this Mac",
// once, however many times the trace repeats the line.
import { it, expect } from 'vitest';
import { runNodes } from '../renderer/src/item-thread.ts';
import { activitySummary } from '../renderer/src/activity-summary.ts';
import { HAND_BACK, handsBack } from '../shared/cloud-hand-back.mjs';

const T = new Date(2026, 9, 17, 10).getTime();
const trace = (text) => ({ startedAt: T, text });

it('draws the hand-back as one step that says the thread moved', () => {
  const nodes = runNodes(trace([
    '10:00:01  [Bash] cat /private/tmp/word.txt',
    `10:00:03  ${HAND_BACK} the file /private/tmp/word.txt is only on your computer`,
    '10:00:03  == RESULT (success · 2 turns) ==',
    `${HAND_BACK} the file /private/tmp/word.txt is only on your computer`,
  ].join('\n')));
  const moved = nodes.filter((n) => n.verb === 'moved');
  expect(moved).toHaveLength(1);
  expect(activitySummary(moved)).toBe('Moved to this Mac');
  // Folded with the steps before it, it still says where (seen in a real run
  // as "Ran commands, moved").
  expect(activitySummary(nodes.filter((n) => n.kind === 'work'))).toBe('Read files, moved to this Mac');
  expect(nodes.some((n) => /AGENTBOX|needs the computer/.test(`${n.text ?? ''} ${n.verb ?? ''} ${n.subject ?? ''}`))).toBe(false);
});

it('leaves an ordinary run, and one that only mentions the Mac, as it was', () => {
  const nodes = runNodes(trace('10:00:01  [Bash] uname -s\n10:00:02  It is on your Mac, not in the cloud.\n'));
  expect(nodes.map((n) => n.verb ?? 'said')).toEqual(['ran', 'said']);
});

it('the marked line is never read as a tool call', () => {
  expect(HAND_BACK.startsWith('[')).toBe(false);
  expect(handsBack(`${HAND_BACK} ffmpeg`)).toBe(true);
});
