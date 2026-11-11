// A SECOND CLOSE ON A ROW STILL CLOSING DOES NOTHING (w-7f80ab49bf).
//
// Reported 2026-10-16: "eyes" typed with the emoji row open closed a team
// conversation, and Z "didn't even bring back this task". Its activity read, in
// one minute: Marked it done, Undid closing it, Marked it done.
//
// Replayed on the built renderer (a headless copy, a team conversation, keys
// dispatched in the page). On the board the row being closed stays drawn in
// In progress under the keyboard cursor, so the second "e" closed it AGAIN.
// That second close first writes the held one (flushPending), and a Z landing
// during that write found nothing held, so it reopened the row from the undo
// pile. The second close was held behind it and wrote done three seconds
// later. With a 300 ms store it gave exactly the three lines above; with an
// instant one, "Marked it done, Undid closing it", still closed.
//
// A close on the row a close is already holding is the same press again, so it
// is dropped and the first one stays the only thing Z has to take back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closesAgain, UNDID_CLOSING } from '../renderer/src/undo-window.ts';

const row = (product, id) => ({ product, id });
const held = (item, words = UNDID_CLOSING) => ({ item, undid: [{ product: item.product, id: item.id, words }] });

describe('a close pressed while a close is held', () => {
  it('on the same row is the same press again', () => {
    expect(closesAgain(held(row('team', 'w-chat')), row('team', 'w-chat'))).toBe(true);
  });

  it('on another row is a close of its own', () => {
    expect(closesAgain(held(row('team', 'w-chat')), row('team', 'w-other'))).toBe(false);
  });

  it('on the same id in another project is a close of its own', () => {
    expect(closesAgain(held(row('team', 'w-chat')), row('personal', 'w-chat'))).toBe(false);
  });

  it('with nothing held is a close of its own', () => {
    expect(closesAgain(null, row('team', 'w-chat'))).toBe(false);
  });

  // A reply held on the row and then E is "send this, then close it", which
  // must still go through.
  it('on a row that is holding a reply rather than a close still closes', () => {
    expect(closesAgain(held(row('team', 'w-chat'), 'Undid replying'), row('team', 'w-chat'))).toBe(false);
    expect(closesAgain({ item: row('team', 'w-chat') }, row('team', 'w-chat'))).toBe(false);
  });
});

describe('the close path asks before it holds anything', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const markDone = app.slice(app.indexOf('const markDone = useCallback'), app.indexOf('const resolve = useCallback'));

  it('markDone drops a repeat before deferCommit can write the first close', () => {
    const asks = markDone.indexOf('closesAgain(pendingRef.current, item)');
    expect(asks).toBeGreaterThan(-1);
    expect(asks).toBeLessThan(markDone.indexOf('await deferCommit('));
  });

  it('markDone names its undo with the words the check looks for', () => {
    expect(markDone).toMatch(/words: UNDID_CLOSING/);
  });
});
