// A TOAST AFTER A SEND LEAVES THE NEW THREAD BUTTON FREE.
//
// What broke (phone testers, 2026-11-08, all three of them): the toast after
// every send ran the width of the inbox at its foot, over the round New thread
// button, so sending tasks back to back cost a tap on the cross each time.
// Measured in the browser preview at 390pt wide: the toast spanned 12 to 378
// and the pen 314 to 370, both within 20pt of the foot.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PEN, penOnScreen, toastPlace } from '../mobile/src/lib/overlays';

const inbox = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
const toast = fs.readFileSync(new URL('../mobile/src/ui/Toast.tsx', import.meta.url), 'utf8');

// The first fix stopped the toast short of the pen, level with it, so it ran
// from 12 to 302 on a screen 390 wide: "the little toast messages that come up
// don't seem to be centered" (2026-11-22). It now keeps the screen's width and
// sits above the pen instead.
describe('on the inbox, where the pen is', () => {
  const foot = 34;
  const p = toastPlace('inbox', foot);
  it('the toast is centred: as far from the right edge as from the left', () => {
    expect(p.right).toBe(12);
    expect(toast).toMatch(/left: 12, right, bottom/);
  });
  it('and sits clear above the pen, with a gap, not over it', () => {
    expect(p.bottom).toBeGreaterThanOrEqual(foot + PEN.lift + PEN.size + 8);
    expect(p.bottom).toBeLessThanOrEqual(foot + PEN.lift + PEN.size + 16);
  });
  it('the pen is drawn from the same numbers', () => {
    expect(inbox).toMatch(/right: PEN\.right, bottom: foot \+ PEN\.lift, width: PEN\.size, height: PEN\.size/);
    expect(toast).toMatch(/toastPlace\(/);
  });
});

describe('everywhere else the toast keeps its place', () => {
  it('over a thread\'s reply box, full width', () => {
    expect(toastPlace('thread', 34)).toEqual({ bottom: 34 + 64, right: 12 });
  });
  it('on any other page, at the foot, full width', () => {
    expect(toastPlace('other', 34)).toEqual({ bottom: 34 + 20, right: 12 });
  });
});

describe('which screen has the pen', () => {
  it('the inbox, at the root', () => {
    expect(penOnScreen([])).toBe(true);
    expect(penOnScreen(['index'])).toBe(true);
  });
  it('not a thread, settings or the new thread page', () => {
    expect(penOnScreen(['thread', '[product]', '[id]'])).toBe(false);
    expect(penOnScreen(['settings'])).toBe(false);
    expect(penOnScreen(['new'])).toBe(false);
  });
});

describe('over a permission card', () => {
  // Seen in the preview: after Deny, the toast lay over the next card's Allow and Deny.
  it('the toast sits above the card, full width, on any screen', () => {
    expect(toastPlace('inbox', 34, 260)).toEqual({ bottom: 272, right: 12 });
    expect(toastPlace('thread', 34, 260)).toEqual({ bottom: 272, right: 12 });
  });
  it('the toast reads how tall the card is', () => {
    expect(toast).toMatch(/footRoom\(inset\), c\.approvalRoom\)/);
  });
});
