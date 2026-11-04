// A RUN OF A REPEATING TASK KEEPS ITS CONVERSATION.
//
// A repeating task now opens as its latest run (w-5e3f2e047f), so a run has to
// behave as a thread: what was said on it is drawn, and a reply resumes it with
// the conversation so far. Neither held. Both readers of a row's ledger lines,
// `readHistory` (the thread view) and `readThread` (the brief a replying worker
// is handed), let through only ids shaped `w-` and hex, and a run is named
// `r-<rule>-<date>`. Measured 2026-10-13 against the daily analytics report's
// run r-0d6c38b457-20261012: both returned zero lines, so its page could only
// say nothing had been said, and a reply would have reached the agent with no
// thread behind it. The guard is there to keep anything that is not a row id
// out of a ledger read, and that part is kept.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { dateKey } from '../shared/repeats.mjs';

let root, store, runId;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  const dir = path.join(root, 'kestrel');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'kestrel' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
  const rule = store.composeRepeat('kestrel', { title: 'Daily signups report', every: 'day', at: '00:00' });
  const served = await store.repeats.serve(store.productDir('kestrel'), rule.id, dateKey());
  runId = served.occurrenceId;
  store.answerItem('kestrel', runId, { answer: 'can you do the report now for today please' });
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('what was said on a run', () => {
  it('is a run, named the way runs are', () => {
    expect(runId).toMatch(/^r-[0-9a-f]{10}-\d{8}$/);
  });

  it('reaches the thread view', () => {
    const lines = store.readHistory('kestrel', runId);
    expect(lines.some((l) => l.patch?.answer === 'can you do the report now for today please')).toBe(true);
  });

  it('reaches the agent a reply resumes', () => {
    const said = store.readThread('kestrel', runId);
    expect(JSON.stringify(said)).toContain('can you do the report now for today please');
  });

  it('still reaches them for an ordinary task', () => {
    const made = store.composeItem('kestrel', { title: 'Look at the slow download button' });
    store.answerItem('kestrel', made.id, { answer: 'any news?' });
    expect(store.readHistory('kestrel', made.id).some((l) => l.patch?.answer === 'any news?')).toBe(true);
  });
});

// A RUN A WORKER MARKED QUIET IS HIDDEN FROM THE INBOX (list-rules.ts), and
// opening a repeating task now lands on that run. A reply on it is a
// conversation, so the answer to it has to be able to reach her: her reply
// takes the quiet mark off, and the worker can still put it back on a later
// quiet run of its own.
describe('a reply on a run that finished quietly', () => {
  const mark = (labels) => store.modules.workItemsDisk.updateWorkItem(store.productDir('kestrel'), runId, { labels }, { source: 'agent' });

  it('makes it news again', () => {
    const before = store.readItem('kestrel', runId).labels.filter((l) => l !== 'clean');
    mark([...before, 'clean']);
    store.answerItem('kestrel', runId, { answer: 'and yesterday too?' });
    const after = store.readItem('kestrel', runId).labels;
    expect(after).not.toContain('clean');
    expect(after).toEqual(before);
  });

  it('leaves a run that was already news exactly as it was', () => {
    const before = store.readItem('kestrel', runId).labels;
    expect(before).not.toContain('clean');
    store.answerItem('kestrel', runId, { answer: 'thanks' });
    expect(store.readItem('kestrel', runId).labels).toEqual(before);
  });

  it('leaves the agent free to mark a later quiet finish', () => {
    const base = store.readItem('kestrel', runId).labels.filter((l) => l !== 'clean');
    mark([...base, 'clean']);
    store.answerItem('kestrel', runId, { answer: 'and yesterday too?' });
    mark([...base, 'clean']);
    expect(store.readItem('kestrel', runId).labels).toContain('clean');
  });

  it('touches no ordinary task that happens to carry the word', () => {
    const made = store.composeItem('kestrel', { title: 'Tidy the repo' });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('kestrel'), made.id, { labels: ['founder', 'clean'] }, { source: 'agent' });
    store.answerItem('kestrel', made.id, { answer: 'go on' });
    expect(store.readItem('kestrel', made.id).labels).toContain('clean');
  });
});

describe('what is not a row id', () => {
  for (const id of ['../work-items', 'r-0d6c38b457', 'r-0d6c38b457-2026101', 'r-0d6c38b457-20261012/x', 'x-0d6c38b457-20261012', '']) {
    it(`reads nothing for ${JSON.stringify(id)}`, () => {
      expect(store.readHistory('kestrel', id)).toEqual([]);
      expect(store.readThread('kestrel', id)).toEqual([]);
    });
  }
});
