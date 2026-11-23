// A cloud thread the app merged into main kept offering "Ship it" and "Discard
// the change" under its own "**Merged into main.**" answer. Two overnight
// testers hit it 13 times on 2026-11-16, and some picked Ship it again. The
// rule that ends the offer read `^merged`, and the app's sentence opens in bold.
import { describe, it, expect } from 'vitest';
import { shipOfferLive } from '../renderer/src/ship-offer.ts';
import { mergedSentence } from '../main/cloud/merge-home.mts';

const finished = (result: string) => ({
  status: 'open',
  result,
  wrote: { result: { ts: 2000 }, note: { ts: 1000 } },
});
const live = (result: string) => shipOfferLive(finished(result), { change: true, running: false });

describe('a thread the app merged into main', () => {
  it('stops offering Ship it once the app merged it here', () => {
    expect(live(mergedSentence({ commits: 2 }))).toBe(false);
  });

  it('stops offering Ship it once the app merged and pushed it', () => {
    expect(live(mergedSentence({ commits: 1, pushedTo: 'origin' }))).toBe(false);
  });

  it('stops offering Ship it when its work was on main already', () => {
    expect(live(mergedSentence({ commits: 0 }))).toBe(false);
  });

  it('still stops on an agent answer that opens with Merged, bold or not', () => {
    expect(live('Merged the fix into main.')).toBe(false);
    expect(live('**Merged.** The branch is on main.')).toBe(false);
  });

  it('still offers Ship it on a finished change that merged nothing', () => {
    expect(live('**Fixed the date bug.** The test is green.')).toBe(true);
    expect(live('**Ready to merge.** The change is committed.')).toBe(true);
  });
});
