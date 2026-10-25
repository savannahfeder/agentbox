// E NEVER WAITS FOR THE APP.
//
// What broke (w-1b1a14000a, 2026-10-21): "When I hit E it shouldn't be visible
// to me anymore, even if that activity hasn't fully been processed." A close is
// held three seconds for Z, and a second action inside those seconds writes the
// held one first. `deferCommit` AWAITED that write, and the snapshot after it,
// before it moved on. Replayed on the built window against a main process
// answering in 4 s (scripts/probe-e-with-a-slow-app.mts):
//
// - rapid: the second E left the task on screen for about 9 s.
// - paced (Es 3.5 s apart): the second E opened the task the first one had
//   closed, because only one held id was hidden and the first was still being
//   written; the third closed that task a second time.
// - impatient: pressing E again while it seemed stuck did the same.
//
// After this change, in the same replays, every E moved on within 400 ms, no
// closed row came back, all three closes were written in order, and Z inside
// the window still took back the held close while the earlier one was written.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

function body(start, end = '\n  }, [') {
  const from = app.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = app.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return app.slice(from, to);
}

describe('a close inside the grace window of the last one', () => {
  const defer = () => body('const deferCommit = useCallback(async (');

  it('moves on to the next task before anything is waited for', () => {
    const b = defer().slice(defer().indexOf(') => {'));
    const firstAwait = b.indexOf('await ');
    expect(b.indexOf('leaveResolved(item)')).toBeGreaterThan(-1);
    expect(b.indexOf('holdRow(item.id)')).toBeGreaterThan(-1);
    expect(b.indexOf('leaveResolved(item)')).toBeLessThan(firstAwait);
    expect(b.indexOf('holdRow(item.id)')).toBeLessThan(firstAwait);
    expect(b).not.toContain('await flushPending()');
  });

  it('still writes the held one first, so the writes keep their order', () => {
    const b = defer();
    expect(b).toMatch(/const flushed = flushPending\(\)/);
    expect(b).toMatch(/const afterTheLast = async \(\) => \{ await flushed; await run\(\); \}/);
    expect(b).toMatch(/run: afterTheLast/);
  });

  it('lets its row go only after the snapshot that carries the write', () => {
    const b = defer();
    const write = b.slice(b.indexOf('const write = async () => {'));
    expect(write.indexOf('await refresh()')).toBeLessThan(write.indexOf('letRowGo(item.id)'));
    expect(write).toMatch(/finally \{\s*letRowGo\(item\.id\);/);
  });
});

describe('the write of a held action', () => {
  const flush = () => body('const flushPending = useCallback(async () => {');

  it('does not wait for the redraw, only for the write', () => {
    const b = flush();
    expect(b).toContain('await pending.run();');
    expect(b).not.toMatch(/await refreshRef/);
  });

  it('keeps the row out of the list until that redraw is in', () => {
    expect(flush()).toMatch(/refreshRef\.current\?\.\(\)\)[\s\S]*\.finally\(\(\) => letRowGo\(pending\.item\.id\)\)/);
  });

  it('puts the row back when the write fails, rather than hiding it for good', () => {
    expect(flush()).toMatch(/catch \(err\) \{\s*letRowGo\(pending\.item\.id\);\s*throw err;/);
  });
});

describe('the rows on their way out', () => {
  it('are a set, so two closes in flight both stay out of the list', () => {
    expect(app).toMatch(/useState<ReadonlySet<string>>\(\(\) => new Set\(\)\)/);
    expect(app).not.toMatch(/\bpendingId\b(?!s)/);
    expect(app).toMatch(/if \(pendingIds\.has\(i\.id\)\) return false;/);
  });

  it('come back one at a time when Z takes one back', () => {
    const undo = body('const undo = useCallback(async () => {');
    expect(undo).toContain('letRowGo(pending.item.id);');
  });
});
