// WORDS THAT LAND DURING A RUN REACH ITS AGENT EVEN WHEN THE RUN CLOSES THE
// THREAD (w-0e21f73f90).
//
// A message one agent leaves on a thread whose agent is working waits on that
// thread for the run to end, and the run's exit starts the next turn on it
// (`deliverMidflightReply`). But an agent-filed thread is closed by its own
// agent when the work is done, and a closed thread cannot be claimed: the
// next run was started, refused its own thread as "already done", and ended
// without a word, so the message sat unanswered on a closed thread. Measured
// on the exit path with the store's own claim. Now a thread the run closed
// opens again for words it never heard, and one you closed stays closed.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Supervisor } from '../main/supervisor.mts';
import { isDue } from '../shared/work-items.mts';

it('a closed thread refuses its next run, and opened again it takes it', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'closed-by-its-run-')), 'calls');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'calls', name: 'calls' }));
  const row = disk.createWorkItem(dir, { title: 'A demo copy of the app' }, { source: 'agent' });
  disk.updateWorkItem(dir, row.id, { status: 'done' }, { source: 'agent' });
  expect(await disk.claimWorkItem(dir, { id: row.id, holder: 'next-run' })).toMatchObject({ claimed: false, reason: 'already done' });
  disk.updateWorkItem(dir, row.id, { status: 'open' }, { source: 'founder' });
  expect((await disk.claimWorkItem(dir, { id: row.id, holder: 'next-run' })).claimed).toBe(true);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

function exitWith(after) {
  const s = Object.create(Supervisor.prototype);
  const writes = [];
  s.store = {
    listItems: () => [after],
    isDue,
    answerItem: (product, id, patch) => { writes.push({ product, id, ...patch }); Object.assign(after, patch); return after; },
  };
  s.pausedProducts = new Set(); s.sessions = new Map();
  s._handledAnswers = new Set(); s._saveState = () => {}; s.spawned = [];
  s.spawnWorker = (item, options) => s.spawned.push({ item: { ...item }, options });
  return { s, writes };
}
const before = { id: 'w-demo', product: 'calls', status: 'open', answer: 'Approved. Run it.', wrote: { answer: { ts: 100, source: 'founder' } } };
const fromAgent = { ts: 200, source: 'system', from: 'The agent on "Plan the calls"', teammate: 'agent' };

it('opens a thread its run closed and starts the next turn on the message', () => {
  const after = { ...before, status: 'done', answer: 'Rename the demo company.', wrote: { answer: fromAgent, status: { ts: 300, source: 'agent' } } };
  const { s, writes } = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(writes).toEqual([{ product: 'calls', id: 'w-demo', status: 'open' }]);
  expect(s.spawned).toHaveLength(1);
  expect(s.spawned[0].item.status).toBe('open');
  expect(s.spawned[0].options).toEqual({ continuation: true });
});

it('does the same for your own reply that the run never heard', () => {
  const after = { ...before, status: 'done', answer: 'Also check the phone.', wrote: { answer: { ts: 200, source: 'founder' }, status: { ts: 300, source: 'agent' } } };
  const { s, writes } = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(writes).toEqual([{ product: 'calls', id: 'w-demo', status: 'open' }]);
  expect(s.spawned).toHaveLength(1);
});

it('leaves a thread you closed closed, and starts nothing on it', () => {
  const after = { ...before, status: 'done', answer: 'Rename the demo company.', wrote: { answer: fromAgent, status: { ts: 300, source: 'founder' } } };
  const { s, writes } = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(writes).toEqual([]);
  expect(s.spawned).toHaveLength(0);
});

it('writes nothing more when the run left the thread open', () => {
  const after = { ...before, status: 'open', answer: 'Rename the demo company.', wrote: { answer: fromAgent } };
  const { s, writes } = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(writes).toEqual([]);
  expect(s.spawned).toHaveLength(1);
});
