// Taking a reply back has to put the ROW back, not just the words.
//
// she typed a reply, pressed Z, and typed it again. The second send was written
// to her store at 16:31:49 and no session ever claimed it. Her row looked
// exactly as it had before.
//
// The words were never the problem; `drafts` gives those back and has its own
// test. What broke is underneath them. The withdraw kills the session, and
// killing one parks the row `blocked` (ipc `zero:stop-session`, 16:31:14). The
// undo then restored the old status only when the reply had CHANGED one, and
// `statusForReply` returns nothing for a row that was already open. So nothing
// wrote `open` back and the row stayed blocked, and the continuation pass
// walks past anything that is not open. Her next send landed in a ledger no
// worker reads.
//
// The option button never had this: its undo always wrote `status: 'open'`,
// which is why the same withdraw at 15:00 that day worked.
//
// AND THE RE-SEND COULD NOT SAVE HER. `statusForReply` would have reopened a
// blocked row, so in principle the second send should have healed it. It did
// not, and the store says why: the append at 16:31:49 carries `answer` and NO
// `status` at all. The composer replies against the row as the app last handed
// it over, which is the row from BEFORE the withdraw, and that one was open, so
// the rule was asked about `open` and correctly returned nothing. The undo is
// therefore the only place this can be fixed, and that is where the fix went.
//
// This is the whole sequence, end to end: send, Z, send again, and a worker on it.
// It is driven through the same three pieces the app uses — the reply rules the
// composer calls, the store write the stop handler makes, and the real
// supervisor tick — so it fails if any one of them stops agreeing.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { statusForReply, withdrawReply } from '../renderer/src/list-rules';
import { Name } from '../shared/product-name.mjs';

const NOW = 1_787_010_000_000;

let items;
let sup;
let clock;

// What the store does to an item on `answerItem`, in the shape the supervisor
// reads: the answer, its moment (source founder), and a status when one is
// given. Every write below goes through here, exactly as the ipc handlers do.
function answerItem(_product, id, patch) {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  if (patch.answer !== undefined) {
    item.answer = patch.answer;
    item.wrote = { ...item.wrote, answer: { ts: (clock += 1000), source: 'founder' } };
  }
  if (patch.status) item.status = patch.status;
  item.updatedAt = clock;
  return item;
}

// The three moves the app makes, named as she would say them.

// She types and sends. App.tsx `answerWith`, which reads the status off the row
// AS THE RENDERER HOLDS IT — `seen` — not off the store. That distinction is
// the whole of the second half of this bug, so it is a parameter here rather
// than something the test quietly gets right.
function send(item, text, seen = item.status) {
  const status = statusForReply(seen);
  answerItem(item.product, item.id, { answer: text, ...(status ? { status } : {}) });
  return status;
}

// She presses Z past the grace window. The kill first, which is the ipc
// handler's own write, then the withdraw.
function withdraw(item, statusWhenReplied) {
  answerItem(item.product, item.id, { status: 'blocked' }); // zero:stop-session
  answerItem(item.product, item.id, withdrawReply(statusWhenReplied));
}

beforeEach(() => {
  clock = NOW;
  items = [{
    id: 'w-82e8991d7a', product: 'agentbox', status: 'open', kind: 'question',
    title: 'Round 8 of the landing page', labels: [], priority: 5,
    createdAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, wrote: {},
  }];
  sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items,
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: '/tmp/nowhere' }],
      isDue: () => true,
      answerItem,
    },
    '/nonexistent-app',
  );
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => { sup.spawned.push({ id: item.id, answer: item.answer, ...opts }); };
});

const carried = (sup) => sup.spawned.filter((s) => s.id === 'w-82e8991d7a');

describe('her reply, withdrawn, and typed again', () => {
  it('reaches a worker the second time', async () => {
    const item = items[0];
    // 16:31:03. The row is open, so the send writes no status. Her store's
    // append at that moment carries `answer` only, and this is why.
    const seen = item.status;
    expect(send(item, 'I love the engineer grid.', seen)).toBeUndefined();

    // 16:31:14. Z. The kill parks it blocked; the withdraw is what puts it back.
    withdraw(item, seen);

    // 16:31:49. She types it again into the same open composer, which is still
    // holding the row it was given: `seen`, not whatever the store now says.
    send(item, 'I love the engineer grid, with the halftone turned up.', seen);
    await sup.tick();

    // THE BUG, AND THE WHOLE POINT OF THE ROW: this was zero. The row was
    // blocked, so the continuation pass walked straight past it and her words
    // sat in the ledger.
    expect(carried(sup).map((s) => s.answer))
      .toEqual(['I love the engineer grid, with the halftone turned up.']);
    expect(carried(sup)[0].continuation).toBe(true);
  });

  it('leaves the row open, which is where the reply found it', () => {
    const item = items[0];
    send(item, 'G, and warm it a little.');
    withdraw(item, 'open');
    expect(item.status).toBe('open'); // it was 'blocked'
  });

  it('does not reopen a thread that was finished before she replied', () => {
    const item = items[0];
    item.status = 'done';
    const status = send(item, 'Actually, one more round.');
    expect(status).toBe('open');       // her reply reopens a done thread
    expect(item.status).toBe('open');
    withdraw(item, 'done');
    // Taking the reply back puts it back in Done, rather than parking a
    // finished thread in her inbox as blocked or leaving it open as unresolved.
    expect(item.status).toBe('done');
  });

  it('puts a blocked row back to blocked, which is the case that always worked', () => {
    const item = items[0];
    item.status = 'blocked';
    expect(send(item, 'Go on then.')).toBe('open');
    withdraw(item, 'blocked');
    expect(item.status).toBe('blocked');
  });

  it('spawns nothing on the withdrawn reply itself, so Z is still a cancel', async () => {
    const item = items[0];
    send(item, 'G, and warm it a little.');
    withdraw(item, 'open');
    await sup.tick();
    expect(carried(sup)).toEqual([]);
    expect(item.answer).toBe('(withdrawn)');
  });
});
