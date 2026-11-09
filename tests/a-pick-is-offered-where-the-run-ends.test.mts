// SHE HAS TO TYPE "MERGE IT" BECAUSE THE OFFER HAD NOWHERE TO LIVE.
//
// The offer was read off the BODY alone. The store folds patches per field with
// the founder outranking an agent, so on a task she composed the body is the
// one field a worker cannot write, and the end of a run is exactly where a pick
// is worth the most. Measured on her store that morning: of 77 results written
// in the three days to then, 41 sat on rows she wrote herself, and exactly one
// row in the whole window could draw the strip at all. Of all 163 results ever
// written on Agentbox, not one carried an offer, because writing one there did
// nothing at all.

import { describe, it, expect } from 'vitest';
import { itemOptions, offerIsLive, optionsFrom } from '../renderer/src/format';
import { statusForReply, withdrawReply } from '../renderer/src/list-rules';

const OFFER = ['## Options', '1. Merge it (recommended)', '2. Leave it on the branch'].join('\n');

describe('a pick is offered where the run ends', () => {
  it('reads the offer off a result, on a row whose ask is hers', () => {
    const item = { body: 'Her own directive, which no worker may rewrite.', result: `Done and green.\n\n${OFFER}` };
    expect(optionsFrom(item)).toBe('result');
    expect(itemOptions(item)).toHaveLength(2);
    expect(itemOptions(item)[0]).toMatchObject({ n: 1, recommended: true });
  });

  it('reads it off a checkpoint when the run has not finished', () => {
    const item = { body: 'Hers.', note: `Half way.\n\n${OFFER}` };
    expect(optionsFrom(item)).toBe('note');
    expect(itemOptions(item)).toHaveLength(2);
  });

  it('still reads the body, so nothing that offered a pick loses one', () => {
    const item = { body: `An agent's own ask.\n\n${OFFER}`, result: 'Finished, nothing to pick.' };
    expect(optionsFrom(item)).toBe('body');
    expect(itemOptions(item)).toHaveLength(2);
  });

  it('prefers the newest word: a result outranks an offer left in the body', () => {
    const stale = ['## Options', '1. The old set'].join('\n');
    const item = { body: `Old ask.\n\n${stale}`, result: `New word.\n\n${OFFER}` };
    expect(itemOptions(item).map((o) => o.text)).toEqual(['Merge it (recommended)', 'Leave it on the branch']);
  });

  it('offers nothing when nobody offered anything', () => {
    expect(itemOptions({ body: 'Prose.', result: 'More prose.' })).toHaveLength(0);
  });

  // The half of the reply path a pick never had. It could not bite while the
  // strip only drew off the body, because that meant a pick was only ever
  // offered on a row still open. A finished row can offer one now.
  it('a pick on a finished row reopens it, the way a typed reply does', () => {
    expect(statusForReply('done')).toBe('open');
    expect(statusForReply('blocked')).toBe('open');
    expect(statusForReply('open')).toBeUndefined();
  });

  it('undoing a pick puts the row back where the pick found it', () => {
    expect(withdrawReply('done')).toEqual({ answer: '(withdrawn)', status: 'done' });
    expect(withdrawReply('open')).toEqual({ answer: '(withdrawn)', status: 'open' });
  });
});

// HER REPLY FROM TUESDAY USED TO BURY AN OFFER WRITTEN ON FRIDAY.
//
// `answer` is never cleared, and the picker hid whenever it held anything, so
// every thread she had spoken in once was a thread no worker could offer her a
// pick in again. Of 78 rows finished in the three days to 2026-08-21, 67 already
// carried an answer, and in 65 of the 67 the result came after she spoke.
describe('an offer is live when it is newer than her last word', () => {
  const live = { body: 'Hers.', result: `Built it.\n\n${OFFER}`, answer: 'do the first one',
    wrote: { answer: { ts: 100 }, result: { ts: 200 }, body: { ts: 50 } } };

  it('draws an offer a worker wrote after she spoke', () => {
    expect(offerIsLive(live)).toBe(true);
  });

  it('hides one she has already answered', () => {
    expect(offerIsLive({ ...live, wrote: { ...live.wrote, result: { ts: 90 } } })).toBe(false);
  });

  it('draws on a row she has never replied to, as it always did', () => {
    expect(offerIsLive({ body: `Ask.\n\n${OFFER}` })).toBe(true);
    expect(offerIsLive({ body: `Ask.\n\n${OFFER}`, answer: '(withdrawn)' })).toBe(true);
  });

  it('draws nothing when nothing was offered', () => {
    expect(offerIsLive({ body: 'Prose.', result: 'More prose.' })).toBe(false);
  });
});
