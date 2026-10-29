// THE PHONE'S TOAST MOVES OFF WHAT YOU READ, AND CAN BE DISMISSED.
//
// What broke (2026-10-29, from the phone app): "The toast that tells me the
// item has sent often blocks important information. Not only is it poorly
// placed but I can't dismiss it." It sat under the top bar, over the first
// thing on the screen, for six seconds whatever she did. Now it sits at the
// foot, over a thread's reply box, and a cross or a short swipe takes it away
// (mobile/src/ui/Toast.tsx). Three placements were drawn for her to pick; the
// two she does not pick are deleted with this test's cases for them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { toastPlace, TOAST_LOOKS, TOAST_SWIPE_PX } from '../mobile/src/lib/overlays';

describe('where the toast sits', () => {
  it('at the foot by default, just over a thread\'s reply box, lower where there is none', () => {
    const thread = toastPlace(true);
    const inbox = toastPlace(false);
    expect(thread.edge).toBe('bottom');
    expect(thread.lift).toBeGreaterThan(inbox.lift);
    expect(inbox.lift).toBeGreaterThan(0);
  });

  it('each placement drawn for the pick', () => {
    expect(TOAST_LOOKS).toEqual(['bottom-bar', 'top-bar', 'bottom-pill']);
    expect(toastPlace(true, 'top-bar')).toMatchObject({ edge: 'top', pill: false });
    expect(toastPlace(true, 'bottom-pill')).toMatchObject({ edge: 'bottom', pill: true });
  });
});

describe('taking it away', () => {
  it('a short swipe is enough, and the cross is there to press', () => {
    expect(TOAST_SWIPE_PX).toBeLessThanOrEqual(30);
    const drawn = fs.readFileSync(new URL('../mobile/src/ui/Toast.tsx', import.meta.url), 'utf8');
    expect(drawn).toMatch(/accessibilityLabel="Dismiss" onPress=\{dismiss\}/);
    expect(drawn).toMatch(/PanResponder\.create/);
  });
});
