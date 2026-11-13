// A RUN THAT STOPPED PARTWAY IS NOT OFFERED FOR SHIPPING.
//
// What broke (2026-11-11, the outreach films thread). An app update ended a
// Codex run 17 minutes into a reply, with its edits loose in the folder, and
// every run after it was refused. The row's last word was the app's own "Codex
// was signed out partway through, so this task is not finished", and under it
// the thread drew "This change was
// never committed. Commit it and ship (recommended)". Pressing that ships half
// a change; discarding it throws away the work the next run picks up from.
// The task is not finished, so there is no ship decision yet.
import { describe, expect, it } from 'vitest';
import { shipOfferLive } from '../renderer/src/ship-offer.ts';
import { deadRunSentence, stoppedStartingSentence } from '../shared/spawn-trouble.mts';

const left = { change: true, running: false };
const ended = (result: string) => ({
  status: 'open',
  labels: [],
  body: 'Make the outreach films.',
  answer: 'verify there are no issues',
  result,
  wrote: { body: { ts: 100 }, answer: { ts: 200 }, result: { ts: 300 } },
});

describe('the ship card under a run that did not finish', () => {
  it('is not drawn under the sentence the screenshot showed', () => {
    const said = deadRunSentence({ engineWord: 'Codex', cause: 'signed-out', partway: true, gaveUp: true });
    expect(said).toMatch(/^Codex was signed out partway through/);
    expect(shipOfferLive(ended(said), left)).toBe(false);
  });

  it('is not drawn under any cause the app says stopped a run', () => {
    for (const cause of ['signed-out', 'interrupted', 'at-limit', 'unknown']) {
      for (const partway of [true, false]) {
        expect(shipOfferLive(ended(deadRunSentence({ engineWord: 'Codex', cause, partway })), left)).toBe(false);
      }
    }
  });

  it('is not drawn once the app stops starting the thread', () => {
    const said = stoppedStartingSentence({ said: 'Error running remote compact task: workspace routing discovery unauthorized (401)', next: Date.now() + 1800000 });
    expect(shipOfferLive(ended(said), left)).toBe(false);
  });

  it('is still drawn under an agent that finished and asked nothing', () => {
    expect(shipOfferLive(ended('The films are rebuilt from the approved cut and pass the frame scan.'), left)).toBe(true);
    expect(shipOfferLive(ended('I stopped partway through the list on purpose: the rest need your pick.'), left)).toBe(true);
  });
});
