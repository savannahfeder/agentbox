// A REPLY THAT KEEPS YOU ON THE THREAD IS ON THE SCREEN THE MOMENT YOU SEND IT
// (w-461fbd8d2d).
//
// "for a good half second after I sent the word "testing" ... then everything
// showed up, including the word "testing" along with "thinking." I feel like
// only when the agent starts thinking does it actually show my message."
//
// Since 131ce59 a reply to an agent that has finished keeps you on the thread
// (unless you are working through Needs you). Only a message to a teammate was
// put in the `sending` queue, so a reply to an agent closed the reply box and
// drew nothing: the conversation is read off the ledger, and the write waits
// out the undo window (3 s on the desktop) or a round trip (a phone). Measured
// in the screenshot on this thread: the box empty, the thread ending on the
// agent's last answer, no sign of the word just sent.
//
// Pinned here: a reply that stays draws its copy at once and lets it go once
// the ledger has it. A reply that moves on is drawn at once too now
// (./a-reply-is-in-the-thread-the-moment-you-send-it.test.mjs).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { itemThread } from '../renderer/src/item-thread.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const quiet = app.slice(app.indexOf('// A REPLY IN A CONVERSATION IS ON THE SCREEN WHEN SHE SENDS IT'), app.indexOf('/* ------------------------ answering one of her agents'));

describe('the wiring', () => {
  it('a stay that is still a reply to an agent keeps the reply box clear and goes through the undo window', () => {
    expect(quiet.indexOf('setSending((q) => [...q, mine])')).toBeLessThan(quiet.indexOf('await deferCommit('));
  });
});

describe('on an agent thread', () => {
  const T = 1_800_000_000_000;
  const ledger = [
    { id: 'w-1', ts: T, source: 'founder', patch: { title: 'Fix the send', body: 'Fix the send', status: 'open' } },
    { id: 'w-1', ts: T + 60_000, source: 'agent', patch: { result: 'Could you screen-record it?', status: 'open' } },
    { id: 'w-1', ts: T + 120_500, source: 'founder', patch: { answer: 'testing', status: 'open' } },
  ];
  const pending = [{ at: T + 120_000, text: 'testing', held: true }];

  it('the reply is the last thing in the thread before the ledger has it', () => {
    const before = itemThread(ledger.slice(0, 2), [], null, { pending });
    const last = before.events[before.events.length - 1];
    expect(last.text).toBe('testing');
    expect(last.pending).toBe(true);
  });

  it('once the ledger has it, it is drawn once, as written', () => {
    const after = itemThread(ledger, [], null, { pending });
    const mine = after.events.filter((e) => e.text === 'testing');
    expect(mine).toHaveLength(1);
    expect(mine[0].pending).toBeFalsy();
  });

  it('an earlier identical reply does not swallow the new one', () => {
    const earlier = [...ledger.slice(0, 2), { id: 'w-1', ts: T + 30_000, source: 'founder', patch: { answer: 'testing' } }];
    const drawn = itemThread(earlier.sort((a, b) => a.ts - b.ts), [], null, { pending });
    expect(drawn.events.filter((e) => e.text === 'testing').map((e) => !!e.pending)).toEqual([false, true]);
  });
});
