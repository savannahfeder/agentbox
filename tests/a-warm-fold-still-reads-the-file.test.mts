// The fold is kept between calls now (: the inbox was refolding 21 MB of
// ledger several times a second and the main process sat at 69% of a core).
// Two things could quietly break, and they are the two things here: an answer
// must never be older than the file, and a lease must still lapse off a fold
// that was taken before it did.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { LEASE_MS } from '../shared/work-items.mjs';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-fold-'));
  disk._internals.forgetFolds();
});

it('sees a line appended after the fold was taken', () => {
  const item = disk.createWorkItem(dir, { title: 'first' });
  expect(disk.readWorkItem(dir, item.id).title).toBe('first');
  disk.updateWorkItem(dir, item.id, { title: 'second' });
  expect(disk.readWorkItem(dir, item.id).title).toBe('second');
  expect(disk.readWorkItems(dir).map((i) => i.title)).toEqual(['second']);
});

it('sees a line another process appended', () => {
  const item = disk.createWorkItem(dir, { title: 'ours' });
  const file = disk._internals.ledgerPath(dir);
  // Exactly what a second server does: one append onto the same file, with no
  // way to tell this process about it.
  disk._internals.appendLine(file, { id: item.id, ts: Date.now() + 1, source: 'founder', patch: { title: 'theirs' } });
  expect(disk.readWorkItem(dir, item.id).title).toBe('theirs');
});

it('lapses a lease that expires while the fold sits warm', async () => {
  const item = disk.createWorkItem(dir, { title: 'held' });
  const { claimed } = await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-1' });
  expect(claimed).toBe(true);

  const held = disk.readWorkItem(dir, item.id);
  expect(held.status).toBe('claimed');
  expect(held.claimExpired).toBe(false);

  // Same file, same fold, a clock past the lease. Nothing on disk moved.
  const later = disk.readWorkItem(dir, item.id, Date.now() + LEASE_MS + 1);
  expect(later.claimExpired).toBe(true);
  expect(later.status).toBe('open');

  // And the warm fold was not aged by that call: the present is still held.
  expect(disk.readWorkItem(dir, item.id).status).toBe('claimed');
});

it('hands every caller its own copy', () => {
  const item = disk.createWorkItem(dir, { title: 'shared', labels: ['one'] });
  const mine = disk.readWorkItem(dir, item.id);
  mine.title = 'scribbled on';
  mine.labels.push('two');
  mine.wrote.title = { ts: 0, source: 'nobody' };

  const yours = disk.readWorkItem(dir, item.id);
  expect(yours.title).toBe('shared');
  expect(yours.labels).toEqual(['one']);
  expect(yours.wrote.title.source).toBe('agent');
});

it('reads an absent ledger as no items, then sees the first one', () => {
  expect(disk.readWorkItems(dir)).toEqual([]);
  expect(disk.readWorkItem(dir, 'w-abcdef')).toBe(null);
  const item = disk.createWorkItem(dir, { title: 'the first' });
  expect(disk.readWorkItems(dir).map((i) => i.id)).toEqual([item.id]);
});
