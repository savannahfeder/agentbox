// 2026-10-07: one echo command read "Ran commands, It stopped and asked you,
// wrote files". Delivery status and the app's saved diff are not agent actions.
import { it, expect } from 'vitest';
import { runNodes, itemThread } from '../renderer/src/item-thread.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { groupWork } from '../shared/work-lines.mjs';
import { filesFromRuns } from '../renderer/src/run-files.ts';

const T = new Date(2026, 9, 7, 10).getTime();
const trace = text => ({ startedAt: T, text });
const saved = '/docs/runs/w-test/the-change-it-made.change';
const lines = [
  { id: 'w-test', ts: T, source: 'founder', patch: { title: 'Print the path', body: 'echo $PATH', status: 'open' } },
  { id: 'w-test', ts: T + 3000, source: 'agent', patch: { result: 'Here is the path.' } },
];

it('keeps the command but excludes the automatic saved diff from activity', () => {
  const session = trace(`10:00:01  [Bash] echo $PATH\n10:00:02  [Write] ${saved}\n`);
  expect(runNodes(session).map(n => n.verb)).toEqual(['ran']);
  expect(filesFromRuns([session], ['/docs'])).toEqual(['runs/w-test/the-change-it-made.change']);
});

it('keeps real document writes, including other change files', () => {
  const session = trace('10:00:01  [Write] /docs/designs/proposal.html\n10:00:02  [Write] /docs/custom.change\n');
  expect(runNodes(session).map(n => n.verb)).toEqual(['wrote', 'wrote']);
});

it('does not say a delivered answer stopped to ask a question', () => {
  const events = threadEvents([...lines, { id: 'w-test', ts: T + 4000, source: 'system', patch: { status: 'blocked' } }]);
  expect(events.some(e => e.said === 'It stopped and asked you')).toBe(false);
});

it('keeps a real request for help separate from commands around it', () => {
  const status = { id: 'w-test', ts: T + 4000, source: 'agent', patch: { status: 'blocked' } };
  const built = itemThread([...lines, status], [trace('10:00:01  [Bash] echo $PATH\n10:00:05  [Read] README.md\n10:00:06  [Write] notes.md\n')]);
  const groups = groupWork([...built.events, ...(built.after ?? [])], { min: 1 });
  expect(groups.some(n => n.kind === 'work' && n.verb === 'It stopped and asked you')).toBe(true);
  expect(groups.filter(n => n.kind === 'run').flatMap(n => n.items).some(n => n.verb === 'It stopped and asked you')).toBe(false);
});

it('keeps a system stop visible when there was no delivered answer', () => {
  const events = threadEvents([lines[0], { id: 'w-test', ts: T + 4000, source: 'system', patch: { status: 'blocked' } }]);
  expect(events.some(e => e.said === 'It stopped and asked you')).toBe(true);
});
