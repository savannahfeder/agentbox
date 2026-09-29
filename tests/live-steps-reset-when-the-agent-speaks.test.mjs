// w-dc98b53395, 2026-09-26: the list under "Running…" held every step of up to
// twenty runs, so 38 minutes in it was a wall of commands. Like Codex, it holds
// only the steps since the agent last said something.
import { it, expect } from 'vitest';
import { runNodes } from '../renderer/src/item-thread';
import { stepsSinceLastSaid, LIVE_STEPS_SHOWN } from '../renderer/src/activity-summary';

const trace = lines => ({ startedAt: Date.now(), text: lines.join('\n') });

it('starts a fresh group each time the agent speaks', () => {
  const nodes = runNodes(trace([
    '12:00:00  [Bash] git status',
    '12:00:01  [Read] src/a.ts',
    '12:00:02  Waiting for the live test video to finish.',
    '12:00:03  [Bash] npm test',
    '12:00:04  [Edit] src/b.ts',
  ]));
  expect(stepsSinceLastSaid(nodes).map(n => n.subject)).toEqual(['npm test', 'src/b.ts']);
});

it('is empty right after the agent speaks, and whole when it has not spoken', () => {
  const said = runNodes(trace(['12:00:00  [Bash] ls', '12:00:01  Done looking.']));
  expect(stepsSinceLastSaid(said)).toEqual([]);
  const quiet = runNodes(trace(['12:00:00  [Bash] ls', '12:00:01  [Read] a.md']));
  expect(stepsSinceLastSaid(quiet)).toHaveLength(2);
});

it('shows a handful, not a wall', () => {
  expect(LIVE_STEPS_SHOWN).toBeLessThanOrEqual(5);
});
