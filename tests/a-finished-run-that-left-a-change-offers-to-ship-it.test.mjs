// A THREAD THAT FINISHED WITH ITS WORK COMMITTED OFFERED NO WAY TO SHIP IT.
//
// Found on the Linux QA box (F-47 on w-51ed2609b0). A thread that had offered
// three receipt layouts and had one picked finished saying "Committed as
// 799c193 on this task's branch; the working tree is clean", sat in Waiting,
// and drew no options at all. The thread beside it in the same project, which
// used no design options, offered "Ship it" and "Discard the change" a minute
// later. The only difference between them was that the second agent remembered
// to write an Options section and the first did not: the offer was read off the
// agent's own words and nowhere else, so a run that forgot left its commits on
// a branch with no way out of the thread but typing a sentence.
//
// So the app asks when the run did not. A run that has ended, left a change and
// is the newest word on its row offers the decision itself, in the same strip,
// answered by the same keys.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIP_ASK, SHIP_LABEL, SHIP_OFFER, shipOfferLive } from '../renderer/src/ship-offer.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// The reported thread, as the pane reads it: the pick at 1:14, the result at
// 1:17, two files changed and nothing else said since.
const finished = {
  status: 'open',
  labels: [],
  body: 'Make the receipt output nicer. Give me 3 layouts first.',
  note: 'Presented three layouts; waiting on your pick.',
  answer: 'Option 1: Simple columns (recommended)',
  result: 'Simple columns are implemented and tested. Committed as 799c193 on this task\'s branch.',
  wrote: { body: { ts: 100 }, note: { ts: 200 }, answer: { ts: 300 }, result: { ts: 400 } },
};
const left = { change: true, running: false };

describe('the decision a finished run left behind', () => {
  it('is offered when the run ended with a change and asked nothing', () => {
    expect(shipOfferLive(finished, left)).toBe(true);
  });

  it('is "Ship it" or "Discard the change", and shipping is the one recommended', () => {
    expect(SHIP_OFFER.map((o) => o.text)).toEqual(['Ship it', 'Discard the change']);
    expect(SHIP_OFFER.filter((o) => o.recommended).map((o) => o.n)).toEqual([1]);
    expect(SHIP_OFFER.map((o) => o.n)).toEqual([1, 2]);
    expect(SHIP_ASK).toBe('Ship this change?');
  });

  it('is not offered while the run is still going', () => {
    expect(shipOfferLive(finished, { change: true, running: true })).toBe(false);
  });

  it('is not offered when the run changed no code', () => {
    expect(shipOfferLive(finished, { change: false, running: false })).toBe(false);
  });

  // The thread beside it in the same project. Its agent asked, so the app has
  // nothing to add: its own words win and are drawn as they always were.
  it('is not offered when the agent offered a pick of its own', () => {
    const asked = { ...finished, result: `Ship the currency option?\n\n## Options\n1. Ship it (recommended)\n2. Discard the change` };
    expect(shipOfferLive(asked, left)).toBe(false);
  });

  it('is not offered once the work has shipped', () => {
    const shipped = { ...finished, note: 'Shipped to main as 3e4d813.', wrote: { ...finished.wrote, note: { ts: 500 } } };
    expect(shipOfferLive(shipped, left)).toBe(false);
  });

  it('is not offered while it waits its turn to ship', () => {
    expect(shipOfferLive({ ...finished, labels: [SHIP_LABEL] }, left)).toBe(false);
  });

  it('is not offered once you have answered it, because a run is on its way', () => {
    const answered = { ...finished, answer: 'Ship it', wrote: { ...finished.wrote, answer: { ts: 500 } } };
    expect(shipOfferLive(answered, left)).toBe(false);
  });

  it('is not offered on a thread you have finished with', () => {
    expect(shipOfferLive({ ...finished, status: 'done' }, left)).toBe(false);
  });

  it('is not offered where no run has ended', () => {
    expect(shipOfferLive({ ...finished, result: '' }, left)).toBe(false);
    expect(shipOfferLive({ ...finished, result: '   ' }, left)).toBe(false);
  });

  // A checkpoint written after the result would mean the app, or the agent, has
  // said something since; the strip's own rule is the same (format.ts).
  it('is not offered when something was written after the run ended', () => {
    const later = { ...finished, note: 'It did not ship, and it went back to its agent: push refused.', wrote: { ...finished.wrote, note: { ts: 500 } } };
    expect(shipOfferLive(later, left)).toBe(false);
  });

  it('calls the label what the ship queue calls it', async () => {
    const { SHIP_LABEL: queue } = await import('../main/ship-queue.mjs');
    expect(SHIP_LABEL).toBe(queue);
  });
});

// A COMPONENT THAT DRAWS IN THE RIGHT PLACE CANNOT BE CHECKED BY RENDERING IT
// ALONE, so the wiring is read the way the other options tests read it.
describe('where the app asks it', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const app = read('renderer/src/App.tsx');

  // The strip is drawn off `stripShown`, which is the seam that already exists
  // for exactly this: `showOptions` stays the whole question of whether the
  // agent offered, because it is also what takes the list out of the message.
  it('stands in the same strip as an offer the agent wrote', () => {
    expect(focus).toContain('const shipOffer = shipOfferLive(item,');
    expect(focus).toContain('const stripShown = showOptions || shipOffer;');
    expect(focus).toContain('const showOptions = offerIsLive(item);');
  });

  it('never draws beside the agent\'s own offer', () => {
    expect(focus).toContain('const options = showOptions ? itemOptions(item) : shipOffer ? SHIP_OFFER : [];');
  });

  it('is answered by the same keys and the same pick', () => {
    expect(app).toContain('const offerNow = useCallback((item: WorkItem): ParsedOption[] => (');
    expect(app).toContain('const opts = offerNow(focused);');
    expect(app).toContain('const option = liveOption(item, n) ?? offerNow(item).find((o) => o.n === n) ?? null;');
  });
});
