// IT SAID "SHIPPED" AND STILL ASKED WHETHER TO SHIP.
//
// Reported 2026-10-05 (w-1df18b337a), with a screenshot of the thread: "it'll
// say 'shipped' but act as though it's not shipped ... I might think, 'Okay,
// ship it,' and then it'll be like, 'Oh, you already shipped it,' so that
// wastes time for the agents and the person as well."
//
// What the screenshot showed: the newest message on the row was a checkpoint
// reading "Shipped to main as e4707e4.", and under it stood the options from
// the run BEFORE, headed "Re-queued to ship — let it go, or change how an
// untouched chip behaves first?". The offer came off the older result because
// `optionsFrom` takes the first field that HAS options, and `offerIsLive` only
// asked whether that offer was newer than her own last reply. Nobody asked
// whether an agent had said something newer since, without offering anything.
//
// So an offer is spent the moment an agent's newer message on the same row
// carries no options of its own: whatever the offer asked about has been acted
// on. A body's offer is the agent's standing ask, so only a finished run (a
// newer result) spends it; a checkpoint written mid-run does not.

import { describe, it, expect } from 'vitest';
import { closesTheTask, itemOptions, offerIsLive, optionsFrom } from '../renderer/src/format';

const OFFER = ['## Options', '1. Let it ship as built (recommended)', '2. Change the chip first'].join('\n');

describe('a newer word from the agent takes the old options away', () => {
  it('her screenshot: a "shipped" checkpoint after the offer hides the offer', () => {
    const item = {
      body: 'Her own directive.',
      result: `Re-queued to ship. Let it go, or change the chip first?\n\n${OFFER}`,
      note: 'Shipped to main as e4707e4.',
      wrote: { body: { ts: 10 }, result: { ts: 200 }, note: { ts: 300 } },
    };
    expect(offerIsLive(item)).toBe(false);
  });

  it('a newer result that offers nothing hides an older checkpoint offer', () => {
    const item = {
      body: 'Hers.',
      note: `Half way, which way?\n\n${OFFER}`,
      result: 'Done, it is shipped.',
      wrote: { body: { ts: 10 }, note: { ts: 100 }, result: { ts: 200 } },
    };
    expect(offerIsLive(item)).toBe(false);
  });

  it('an agent ask in the body is spent once a run finishes without re-offering', () => {
    const item = {
      body: `Pick one.\n\n${OFFER}`,
      result: 'Built the first one and shipped it.',
      wrote: { body: { ts: 100 }, result: { ts: 200 } },
    };
    expect(offerIsLive(item)).toBe(false);
  });

  // The cases that must NOT change.
  it('a checkpoint written BEFORE the offer leaves it live', () => {
    const item = {
      body: 'Hers.',
      note: 'Working on it.',
      result: `Built it.\n\n${OFFER}`,
      wrote: { body: { ts: 10 }, note: { ts: 100 }, result: { ts: 200 } },
    };
    expect(offerIsLive(item)).toBe(true);
  });

  it('a checkpoint after an agent ask in the body leaves the ask live', () => {
    const item = {
      body: `Pick one.\n\n${OFFER}`,
      note: 'Waiting on your pick.',
      wrote: { body: { ts: 100 }, note: { ts: 200 } },
    };
    expect(offerIsLive(item)).toBe(true);
  });

  it('a message written in the same instant as the offer does not spend it', () => {
    const item = {
      body: 'Hers.',
      note: 'Shipped.',
      result: `Shipped.\n\n${['## Options', '1. Close the task (recommended)'].join('\n')}`,
      wrote: { body: { ts: 10 }, note: { ts: 200 }, result: { ts: 200 } },
    };
    expect(offerIsLive(item)).toBe(true);
  });

  it('a newer message that offers its own options is the live one', () => {
    const item = {
      body: 'Hers.',
      result: `Old round.\n\n${OFFER}`,
      note: `New round.\n\n${['## Options', '1. Close the task (recommended)'].join('\n')}`,
      wrote: { body: { ts: 10 }, result: { ts: 100 }, note: { ts: 200 } },
    };
    // optionsFrom used to prefer the result field whatever its age, so the
    // older round was drawn here. The newer one has to win.
    expect(offerIsLive(item)).toBe(true);
    expect(optionsFrom(item)).toBe('note');
    expect(itemOptions(item).map((o) => o.text)).toEqual(['Close the task (recommended)']);
  });

  it('a row with no timestamps at all behaves as it always did', () => {
    expect(offerIsLive({ body: 'Hers.', result: `Built it.\n\n${OFFER}`, note: 'Shipped.' })).toBe(true);
  });

  it('a single option is a real offer', () => {
    const item = {
      body: 'Hers.',
      result: `Shipped to main.\n\n${['## Options', '1. Close the task (recommended)'].join('\n')}`,
      wrote: { body: { ts: 10 }, result: { ts: 200 } },
    };
    expect(offerIsLive(item)).toBe(true);
  });
});

// "What I would expect is that it just ends with 'shipped' and the options
// might be 'Close the task.'" A pick is a reply, and a reply on a finished row
// reopens it and starts a run, so "Close the task" sent as a reply would spend
// a whole agent run on closing a row. Picked, it closes the row the way E does.
describe('the option to close the task closes it', () => {
  it('reads the wordings an agent is told to use', () => {
    expect(closesTheTask('Close this task (recommended)')).toBe(true);
    expect(closesTheTask('Close the task')).toBe(true);
    expect(closesTheTask('close this thread.')).toBe(true);
  });

  it('does not close on an option that only mentions closing', () => {
    expect(closesTheTask('Close the gap in the sidebar first')).toBe(false);
    expect(closesTheTask('Ship it, then close the task')).toBe(false);
    expect(closesTheTask('Close this task and file the follow-up')).toBe(false);
    expect(closesTheTask('Ship it')).toBe(false);
  });
});
