// A THREAD YOU JUST CLOSED IS NEVER COUNTED IN PROGRESS.
//
// Found in the power test of 2026-11-02 (seen 5 times by one tester): closing
// the last thread in Needs you with E made the In progress tab read one more
// than its rows for a moment ("IN PROGRESS 5" over 4 rows). Reproduced on a
// fresh copy: In progress empty, E on the last Needs you thread, and the tab
// read "IN PROGRESS 1" until the three-second undo window closed.
//
// Every action held for Z put its row in In progress, because a reply still in
// the window must not sit in Needs you looking unsent. Only an action that
// starts an agent on that row (a reply, an approval, a picked option) is that.
// A close, a clear, or a "do it in this thread" on a proposal starts nothing on
// the held row, so it leaves Needs you and appears nowhere else until it is
// written.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { heldRowStarts } from '../renderer/src/list-rules';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const row = { product: 'api', id: 'w-1' };

describe('a thread you just closed is never counted in progress', () => {
  it('a close, which answers nothing, does not start the held row', () => {
    expect(heldRowStarts(row, undefined)).toBe(false);
    expect(heldRowStarts(row, null)).toBe(false);
  });

  it('a reply, approval or pick on the row itself does', () => {
    expect(heldRowStarts(row, { product: 'api', id: 'w-1' })).toBe(true);
  });

  it('an answer that starts another row, as "do it in this thread" starts the parent, does not count the held one', () => {
    expect(heldRowStarts(row, { product: 'api', id: 'w-parent' })).toBe(false);
    expect(heldRowStarts(row, { product: 'web', id: 'w-1' })).toBe(false);
  });

  it('the In progress list counts only held rows that start, and every held row still leaves Needs you', () => {
    expect(app).toMatch(/holdRow\(item\.id, heldRowStarts\(item, goes\)\)/);
    expect(app).toMatch(/if \(startingIds\.has\(i\.id\) && deferredUntil <= now\) return true;/);
    expect(app).not.toMatch(/if \(pendingIds\.has\(i\.id\) && deferredUntil <= now\) return true;/);
    expect(app).toMatch(/if \(pendingIds\.has\(i\.id\)\) return false; \/\/ action held in the grace window/);
  });
});
