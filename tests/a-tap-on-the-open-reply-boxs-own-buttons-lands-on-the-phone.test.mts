// A TAP ON THE OPEN REPLY BOX'S OWN BUTTONS LANDS ON THE PHONE.
//
// The 2026-11-07 phone workday (issue 4):
// in an open, empty reply box, Stop and the paperclip folded the box instead of
// working. The field folds the box when it loses focus and nothing is typed,
// and a tap on a button inside the box takes the focus first, so the button
// was gone before the tap ended. Measured in the phone preview: Reply, then
// Stop on a queued task; the box folded, still Queued, no toast.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('the open reply box', () => {
  const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
  it('notes a touch that starts inside it', () => {
    expect(page).toMatch(/onTouchStartCapture=\{\(\) => \{ pressInside\.current = true; \}\}/);
    expect(page).toMatch(/onTouchEnd=\{\(\) => setTimeout\(\(\) => \{ pressInside\.current = false; \}, 400\)\}/);
  });
  it('does not fold on that touch, and still folds empty on any other blur', () => {
    expect(page).toMatch(/onBlur=\{\(\) => \{ if \(!ready && !sheet && !talk\.active\(\) && !pressInside\.current\) setOpen\(false\); \}\}/);
  });
});
