// AN ANSWER WRITTEN WHILE SHE IS READING THE ROW REACHES HER SCREEN.
//
// A worker had written a result with three proposals onto that row at 15:15:16,
// six minutes earlier, while she sat on it.
//
// NOTHING WAS WRONG WITH THE DATA OR THE DRAWING, which is what made it so hard
// to see. The result was one line on the ledger. Replaying the row through the
// built renderer drew all seven paragraphs and the option strip with all three
// proposals in it, because a replay is a fresh mount and a fresh mount reads the
// store. What she had open was not a fresh mount.
//
// MEASURED in the real app, before this was fixed: with the row open, a
// `{status, result}` line appended to the ledger reached the main process
// within 5 seconds and the open pane had not changed ONE CHARACTER 25 seconds
// later. The pane holds the copy of the item she opened, and it only ever took
// a fresher one while she was following a `/usage`.
//
// TWO THINGS THIS FILE HOLDS DOWN, because both are a way to lose it again:
// that an ordinary open row now takes the newer copy at all, and that it only
// takes one when the row has really moved. A pane that swaps its item on every
// ten second poll is the complaint the old narrow scope was avoiding, and every
// snapshot hands back new objects, so identity alone cannot be the test.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshCopy } from '../renderer/src/stay-with-a-command';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

// The row as she opened it, and the same row after a worker finished it. Two
// objects, because that is what an IPC snapshot hands back every time.
const opened = { product: 'agentbox', id: 'w-ca2a64d560', status: 'open', result: '', updatedAt: 1789942454783 };
const answered = { product: 'agentbox', id: 'w-ca2a64d560', status: 'open', result: '**Pick how shells clean themselves up.**', updatedAt: 1789942516097 };

describe('a result written under the open row', () => {
  it('reaches the pane even though she is not following a command', () => {
    expect(freshCopy([answered], opened, null)).toBe(answered);
  });

  it('and the pane is handed the whole newer row, not a patch of it', () => {
    expect(freshCopy([answered], opened, null).result).toMatch(/Pick how shells/);
  });
});

describe('what does not move the pane', () => {
  it('a poll that found nothing new, however many new objects it built', () => {
    const sameAgain = { ...opened };
    expect(sameAgain).not.toBe(opened);
    expect(freshCopy([sameAgain], opened, null)).toBe(null);
  });

  it('a row she has not got open', () => {
    expect(freshCopy([answered], null, null)).toBe(null);
  });

  it('the same id in another product, which is another row', () => {
    expect(freshCopy([{ ...answered, product: 'zero' }], opened, null)).toBe(null);
  });

  it('a row that has left the list entirely', () => {
    expect(freshCopy([], opened, null)).toBe(null);
  });
});

describe('the row she is following a command on is unchanged', () => {
  const watched = { product: 'agentbox', id: 'w-ca2a64d560' };

  it('takes every copy it is handed, moment or no moment', () => {
    const sameAgain = { ...opened };
    expect(freshCopy([sameAgain], opened, watched)).toBe(sameAgain);
  });
});

describe('the app is wired to it', () => {
  it('the open pane asks freshCopy on every snapshot, with no following gate in front of it', () => {
    expect(app).toMatch(/const fresh = freshCopy\(items, focused, following\);\s*\n\s*if \(fresh\) setFocused\(fresh\);/);
    // The old shape returned early unless a command was being watched, which is
    // the whole of the bug. It must not come back.
    expect(app).not.toMatch(/if \(!following \|\| !focused\) return;/);
  });
});
