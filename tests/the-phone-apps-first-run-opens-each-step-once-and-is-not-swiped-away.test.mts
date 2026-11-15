// THE PHONE APP'S FIRST RUN OPENS EACH STEP ONCE, AND IS NOT SWIPED AWAY.
//
// The founder, 2026-11-08, signing in to App Store build 20 on an iPhone:
// "Upon logging in, it opened the first screen twice, the one where your
// messages go. I accidentally swiped left to try to go left, and it very
// buggily showed me the Needs You page." The inbox opens each first-run step
// with router.push, guarded by a ref held by that copy of the inbox. On iOS
// the sign-in's redirect to "/" can leave two inboxes on the stack, each with
// its own ref, so each pushed the step. The browser build keeps one inbox,
// which is why it did not show there. The guard is now one for the app, reset
// on signing out. And the steps are not swiped back from: underneath is an
// inbox the person has not reached yet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { firstRunStep } from '../mobile/src/lib/first-run';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

describe('one opening per step for the whole app', () => {
  it('a step is opened once, however many inboxes ask', () => {
    const guard = firstRunStep();
    expect(guard.take('messages')).toBe(true);
    expect(guard.take('messages')).toBe(false);
  });
  it('the next step still opens', () => {
    const guard = firstRunStep();
    guard.take('messages');
    expect(guard.take('alerts')).toBe(true);
  });
  it('signing out lets the next account be asked again', () => {
    const guard = firstRunStep();
    guard.take('messages');
    guard.reset();
    expect(guard.take('messages')).toBe(true);
  });
  it('the inbox uses the one guard, not a ref of its own', () => {
    const inbox = read('app/index.tsx');
    expect(inbox).toMatch(/FIRST_RUN\.take\(next\)/);
    expect(inbox).not.toMatch(/asked\.current === next/);
  });
});

describe('not swiped away', () => {
  it('the notice and the alerts step are not closed by the back swipe', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/<Stack\.Screen name="ai-notice" options=\{\{ gestureEnabled: false \}\} \/>/);
    expect(layout).toMatch(/<Stack\.Screen name="alerts" options=\{\{ gestureEnabled: false \}\} \/>/);
  });
});
