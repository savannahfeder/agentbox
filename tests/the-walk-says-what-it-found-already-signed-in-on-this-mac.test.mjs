// THE WALK SAYS WHAT IT FOUND ALREADY SIGNED IN ON THIS MAC (w-e217e577e5,
// 2026-10-07).
//
// From a session with a new user: "He didn't realize it auto-connected to
// Claude/Codex; he wasn't sure how it was even running."
//
// The silence was deliberate and it was right as far as it went. `needsPlan`
// (renderer/src/plan-setup.ts) skips the plan question AND the setup card on any
// Mac where one tool is found and signed in, because there is nothing to ask;
// what nobody noticed is that those two screens were the only place the walk had
// ever named the subscription, so the person it works perfectly for is the only
// one who is never told.
//
// So the folder screen says it once, in the note slot it already has. Three
// things this pins, and the third is the one that would rot quietly:
//   - the line is there on a Mac that was already set up;
//   - it is NOT there on a Mac that gets the plan question, which says all of
//     this out loud already, and not on a payload with no reading in it;
//   - a refused folder still wins that slot. Two quiet lines under one card is
//     the clutter the welcome screen lost its third line for (w-ec62ab6b38), and
//     a folder somebody just picked and had turned down is the more urgent of
//     the two by a distance.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Onboarding } from '../renderer/src/components/Onboarding';
import { START } from '../renderer/src/onboarding';

const noop = () => {};

const walk = (extra = {}) => renderToStaticMarkup(createElement(Onboarding, {
  run: { ...START, step: 'folder' },
  claude: { missing: false, url: 'https://example.test' },
  home: '/Users/example',
  onEvent: noop, onStep: noop, onSkipToApp: noop, onPractice: noop, onDone: noop,
  onFiled: noop, onProjectMade: noop, onLeave: noop, onShut: noop, onSkipStep: noop,
  ...extra,
}));

describe('the folder screen on a Mac that was already set up', () => {
  it('says it found an account of yours, and names no plan', () => {
    const html = walk({ runsOn: { engine: 'claude' } });
    expect(html).toContain('Your agents will run on the Claude account already signed in on this Mac.');
    // THE TIER NEVER REACHES THIS SCREEN EITHER. The sidebar row that printed
    // one was taken out the day it shipped ("very critically, I want to get rid
    // of that Claude Max 20x plan"), and a line here that quietly kept saying
    // it would be the same mistake on a different screen. Handed one anyway, on
    // an old payload or by a caller that has not caught up, it is ignored.
    const withTier = walk({ runsOn: { engine: 'claude', plan: 'Max 20x' } });
    expect(withTier).not.toContain('Max 20x');
    expect(withTier).toContain('Your agents will run on the Claude account already signed in on this Mac.');
  });

  it('says ChatGPT for a Mac signed into Codex', () => {
    const html = walk({ runsOn: { engine: 'codex' } });
    expect(html).toContain('Your agents will run on the ChatGPT account already signed in on this Mac.');
    expect(html).not.toContain('Codex');
  });

  it('says nothing at all on a Mac with nothing signed in', () => {
    for (const runsOn of [null, undefined, { engine: null }]) {
      const html = walk({ runsOn });
      expect(html).not.toContain('already signed in on this Mac');
    }
  });

  it('gives the one quiet line to a folder that was turned down', () => {
    // The screen only refuses a folder it was handed, so this is driven through
    // the only door there is: a pick the app says no to. With no main process
    // behind it the pick cannot happen here, so the claim this test can make is
    // the structural one -- there is ONE note element, not two.
    const html = walk({ runsOn: { engine: 'claude' } });
    expect(html.match(/class="fr-note/g) ?? []).toHaveLength(1);
  });
});
