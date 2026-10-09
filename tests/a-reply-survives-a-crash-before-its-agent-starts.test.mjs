// Restart recovery review, 2026-10-08: the graceful quit path puts pending
// replies back, but a crash cannot run it. The saved delivery mark stranded a
// reply in all three setup waits: folder creation, checkout snapshot, and
// leftover cleanup. Reconstruct the supervisor from its actual state file
// without calling stop(), then exercise its real queue. No agent or build runs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

vi.mock('../main/task-folders-offthread.mjs', () => ({ folderJob: vi.fn(() => new Promise(() => {})) }));
vi.mock('../main/git-change-offthread.mjs', () => ({ gitJob: vi.fn(() => new Promise(() => {})) }));

let root, item, product, supervisors;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-crash-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  item = {
    id: 'w-1111111111', product: 'sample', status: 'open', title: 'Continue the change',
    answer: 'continue', wrote: { answer: { ts: 1000, source: 'founder' } },
  };
  product = { slug: 'sample', dir: repo, repoPath: repo };
  supervisors = [];
});
afterEach(() => {
  for (const sup of supervisors) sup.stop();
  fs.rmSync(root, { recursive: true, force: true });
});
function make() {
  const sup = new Supervisor(
    { home: root, storeRoot: root, authProfiles: ['default'] },
    { listItems: () => [item], listProducts: () => [product], isDue: () => true }, root,
  );
  supervisors.push(sup);
  return sup;
}
async function preparing(stage) {
  const sup = make();
  if (stage === 'snapshot') {
    product.repoPath = null;
    fs.writeFileSync(path.join(product.dir, '.git'), 'fake checkout');
  }
  if (stage === 'leftovers') sup._leftoverCleaner = { holdMs: () => 60_000 };
  await sup.tick();
  expect(sup._preparing.has(item.id)).toBe(true);
  expect(sup._answerDelivered(item)).toBe(true);
  return sup;
}
function recordStarts(sup) {
  const started = [];
  sup.spawnWorker = (row, opts) => {
    started.push({ id: row.id, ...opts });
    sup.sessions.set(row.id, { itemId: row.id });
  };
  return started;
}

describe.each(['folder', 'snapshot', 'leftovers'])('a crash during %s setup', (stage) => {
  it('puts the reply back in the queue without a graceful shutdown', async () => {
    await preparing(stage);
    const after = make(); // the first instance did not get to run stop()
    const started = recordStarts(after);
    await after.tick();
    expect(started).toEqual([{ id: item.id, continuation: true }]);
    await after.tick();
    expect(started).toHaveLength(1);
  });

  it('still honors a later Stop', async () => {
    await preparing(stage);
    item = { ...item, status: 'blocked', wrote: { ...item.wrote, status: { ts: 2000, source: 'founder' } } };
    const after = make();
    const started = recordStarts(after);
    await after.tick();
    expect(started).toEqual([]);
  });

  it('does not clear the mark for a newer reply that was delivered', async () => {
    const before = await preparing(stage);
    item = { ...item, answer: 'a newer reply', wrote: { answer: { ts: 2000, source: 'founder' } } };
    before._handledAnswers.add(before._answerKey(item));
    before._saveState();
    const after = make();
    const started = recordStarts(after);
    await after.tick();
    expect(after._answerDelivered(item)).toBe(true);
    expect(started).toEqual([]);
  });
});

it('keeps a delivered reply when no start was waiting', async () => {
  const before = make();
  before._handledAnswers.add(before._answerKey(item));
  before._saveState();
  const after = make();
  const started = recordStarts(after);
  await after.tick();
  expect(after._answerDelivered(item)).toBe(true);
  expect(started).toEqual([]);
});
