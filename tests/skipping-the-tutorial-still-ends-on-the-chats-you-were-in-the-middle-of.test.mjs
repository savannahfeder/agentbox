// SKIPPING THE TUTORIAL STILL ENDS ON THE CHATS YOU WERE IN THE MIDDLE OF.
//
// Setup's last screen is "Pick up where you left off" (w-62228098e6, R1). The
// tutorial hand-off's "Skip the tutorial" ended the walk outright, so it went
// past that screen: a power tester playing a first-day user who already lives
// in Claude Code skipped the tutorial, landed on an empty inbox, and only found
// their sixteen chats later through ⌘K. People who already use Claude Code are
// the ones most likely to skip a tutorial, and the ones the screen is for.
//
// So the hand-off's Skip goes to the last screen, which closes itself when
// there is nothing to bring in. The corner's quiet way out still leaves at
// once, and a walk that skipped the tutorial is still not counted as practised.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stepTo } from '../renderer/src/onboarding';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const block = (open) => app.slice(app.indexOf(open), app.indexOf('/>', app.indexOf(open)));

describe('skipping the tutorial', () => {
  it('moves the walk to its last screen instead of ending it', () => {
    const walk = block('<Onboarding');
    expect(walk).toContain("onLeave={() => setRun((r) => (r ? stepTo(r, 'done') : r))}");
    expect(stepTo({ step: 'hand', practice: null }, 'done').step).toBe('done');
  });

  it('leaves the corner way out as a way straight out', () => {
    expect(block('<WayOut')).toContain('onLeave={() => finishRun([], { celebrate: false })}');
  });

  // Checked on a copy: skip, bring in eight, and the landing said "You
  // finished the tutorial." to somebody who had skipped it.
  it('counts and celebrates the walk only when the practice round was made', () => {
    const walk = block('<Onboarding');
    expect(walk).toContain('onDone={(chosen) => { const practised = !!runRef.current?.practice; finishRun(chosen, { practised, celebrate: practised }); }}');
    expect(walk).toContain('finishRun([], { filed: added, practised, celebrate: practised });');
  });
});
