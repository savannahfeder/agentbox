// A REPLY TO A PERSON IS ON THE SCREEN WHEN YOU SEND IT.
//
// Found 2026-10-01 messaging a teammate: a sent reply vanished for a moment
// before it appeared. Measured in the code: a reply on a row with no agent
// running goes through `deferCommit`, which holds the write for UNDO_GRACE_MS
// (3 seconds) so Z can take it back, and the conversation is drawn off the
// ledger. So for three seconds the reply box had closed and the words were
// nowhere. The running-
// agent path already drew a held message at once (`sending`, w-1ef03d6f27);
// a conversation with a person now does the same.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { itemThread } from '../renderer/src/item-thread.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
// The path taken when no agent is running on the row.
const quiet = app.slice(app.indexOf('// A REPLY IN A CONVERSATION IS ON THE SCREEN WHEN SHE SENDS IT'),app.indexOf('/* ------------------------ answering one of her agents'));

describe('a reply in a conversation', () => {
  it('goes into the sending queue, held, before the three second wait', () => {
    expect(quiet).toMatch(/if \(talking\) setSending\(\(q\) => \[\.\.\.q, mine\]\)/);
    expect(quiet.indexOf('setSending((q) => [...q, mine])')).toBeLessThan(quiet.indexOf('await deferCommit('));
    expect(quiet).toMatch(/const mine = \{ product: item\.product, id: item\.id, at: Date\.now\(\), text, held: true \}/);
  });

  it('comes off the screen again when Z takes it back', () => {
    expect(quiet).toMatch(/const restore = \(\): Restored => \{\s*setSending\(\(q\) => q\.filter\(\(s\) => s !== mine\)\)/);
  });

  it('is cleared once the written copy has landed', () => {
    expect(quiet).toMatch(/setTimeout\(\(\) => setSending\(\(q\) => q\.filter\(\(s\) => s !== mine\)\), LANDED_MS\)/);
  });

  it('is never there twice: the written copy replaces the held one', () => {
    const T = 1_000_000;
    const ledger = [
      { id: 'w-1', ts: T, source: 'founder', patch: { title: 'Hi', body: 'Hi from Riley', status: 'open' } },
      { id: 'w-1', ts: T + 3100, source: 'founder', patch: { answer: 'Hey!' } },
    ];
    const held = itemThread(ledger.slice(0, 1), [], null, { pending: [{ at: T + 100, text: 'Hey!', held: true }] });
    expect(held.events.filter((e) => e.text === 'Hey!').map((e) => e.pending)).toEqual([true]);
    const landed = itemThread(ledger, [], null, { pending: [{ at: T + 100, text: 'Hey!', held: true }] });
    expect(landed.events.filter((e) => e.text === 'Hey!')).toHaveLength(1);
    expect(landed.events.find((e) => e.text === 'Hey!').pending).toBeFalsy();
  });

  it('leaves a reply to an ordinary thread as it was', () => {
    // Only a conversation is drawn early; a task row still leaves the inbox.
    expect(quiet).not.toMatch(/^\s*setSending\(\(q\) => \[\.\.\.q, mine\]\);/m);
  });
});
