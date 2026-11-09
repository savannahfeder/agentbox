// A THREAD THAT ASKS YOU SAYS SO WHEREVER IT IS DRAWN.
//
// Reported (QA batch 005, F-120): the same thread read ASKING in the phone's
// list and WORKING in phone search. Traced through statusCell and liveLine,
// there is no snapshot that produces both: `asking` is tested above the
// session, above stalled and above the In-progress gate, and one FleetContext
// feeds every surface, so the only way the two words differ is the two
// readings being taken at different moments. Nothing was changed for it. This
// holds the invariant instead, so a later tidy-up of those branches cannot
// quietly make the reported bug real.
//
// It also pins the half of F-120 that read as a disagreement and is not one:
// a thread with a card waiting belongs in Needs you, so In progress saying
// "nothing is running" beside it is the two lists agreeing, not differing.
import { describe, it, expect } from 'vitest';
import { statusCell } from '../renderer/src/status-word';
import { liveLine } from '../renderer/src/live-line';
import { belongsInInbox, belongsInProgress, inProgressTab } from '../renderer/src/list-rules';

const item = (extra = {}) => ({
  id: 'w-1', product: 'p', status: 'open', kind: 'directive', title: 't',
  labels: [], priority: 5, createdAt: 0, updatedAt: 0, ...extra,
});
const session = { itemId: 'w-1', product: 'p', startedAt: Date.now() - 120_000, tail: [] };

describe('the word on a thread with a card waiting', () => {
  it('is the same in the list and in search, which draw it with different tabs', () => {
    const facts = { asking: true, session, queued: [], now: Date.now() };
    const inList = statusCell(item(), { ...facts, inProgress: true });
    const inSearch = statusCell(item(), { ...facts, inProgress: false });
    expect(inList.word).toBe('Asking');
    expect(inSearch.word).toBe(inList.word);
    expect(inSearch.mark).toBe(inList.mark);
  });

  // The boundary that made the word wrong before it had its own branch: a
  // worker waiting on a card is a live session in every list the supervisor
  // keeps, so "Working" won unless asking is tested first.
  it('outranks the live session underneath it', () => {
    expect(liveLine(item(), { asking: true, session, inProgress: true }).state).toBe('asking');
    expect(liveLine(item(), { asking: false, session, inProgress: true }).state).toBe('working');
  });

  // And the case that must not match: no card, no Asking.
  it('is not said on a thread nothing is asking about', () => {
    expect(statusCell(item(), { asking: false, session, queued: [], inProgress: true }).word).toBe('Working');
  });
});

describe('which list it is in', () => {
  it('is Needs you, so In progress is right to say nothing is running', () => {
    const asking = item();
    expect(belongsInInbox(asking, { asking: true, live: true })).toBe(true);
    // A live session really is on it, so both rules hold it — and Needs you
    // wins, which is why the In-progress tab was empty while a card waited.
    expect(belongsInProgress(asking, { live: true })).toBe(true);
    expect(inProgressTab([asking], [asking])).toEqual([]);
  });
});
