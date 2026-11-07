// THE PHONE'S TOAST MOVES OFF WHAT YOU READ, AND CAN BE DISMISSED.
//
// What broke (2026-10-29, from the phone app): "The toast that tells me the
// item has sent often blocks important information. Not only is it poorly
// placed but I can't dismiss it." It sat under the top bar, over the first
// thing on the screen, for six seconds whatever she did. Three placements were
// drawn and she picked "toast-1 bottom bar": at the foot, just over a thread's
// reply box, with a cross and a short swipe down to take it away
// (mobile/src/ui/Toast.tsx). The other two were deleted.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { toastLift, TOAST_SWIPE_PX } from '../mobile/src/lib/overlays';

const drawn = fs.readFileSync(new URL('../mobile/src/ui/Toast.tsx', import.meta.url), 'utf8');

describe('where the toast sits', () => {
  it('at the foot, just over a thread\'s reply box, lower where there is none', () => {
    expect(toastLift(true)).toBeGreaterThan(toastLift(false));
    expect(toastLift(false)).toBeGreaterThan(0);
  });

  it('never at the top again, and no other placement is left to switch to', () => {
    expect(drawn).not.toMatch(/topBar/);
    expect(drawn).not.toMatch(/pill|agentboxToastLook/);
  });
});

describe('taking it away', () => {
  it('a short swipe down is enough, and the cross is there to press', () => {
    expect(TOAST_SWIPE_PX).toBeLessThanOrEqual(30);
    expect(drawn).toMatch(/accessibilityLabel="Dismiss" onPress=\{dismiss\}/);
    expect(drawn).toMatch(/PanResponder\.create/);
  });
});
