// THE APP BESIDE THE SETUP IS BIGGER, AND THE ACCOUNT START SAYS LESS (w-fbe5e95dea, 2026-11-10).
//
// The founder on the chats step: "i think it's best if the right side
// component take up more space. like a little higher and further". At
// 1440x900 the app preview started 733px across and 92px down, at 0.69 of
// its size, leaving a dead band above it and beside the steps.
//
// On the account step: "feels too cluttered tho" over Google and email, and
// "this side can be narrower, it's a bit wide/stretched" over the heading. The
// first screen had a heading, a grey second line over two rows, two buttons,
// the terms and a sign-in line, all 460px wide. Now it is a heading, the two
// buttons and the sign-in line in a narrower column, with the terms at the
// foot of the panel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { setupPreview } from '../renderer/src/setup-split.ts';

const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');
const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');

// The steps column starts at clamp(48px, 6vw, 112px) and stops 40px short of the panel's edge.
const column = (width: number) => setupPreview(width, 900).left - Math.min(112, Math.max(48, width * 0.06)) - 40;

describe('the app preview beside the setup', () => {
  it('starts higher, further left and bigger on a 1440 by 900 window than it did', () => {
    const at = setupPreview(1440, 900);
    expect(at.y).toBeLessThanOrEqual(40);
    expect(at.x).toBeLessThanOrEqual(620);
    expect(at.scale).toBeGreaterThanOrEqual(0.78);
  });
  it('still leaves the steps a column wide enough for a chat row', () => {
    expect(column(1440)).toBeGreaterThanOrEqual(460);
    expect(column(1920)).toBeGreaterThanOrEqual(560);
  });
  it('never starts inside the steps column, on a small window or a big one', () => {
    for (const w of [1024, 1280, 1440, 1920, 2560]) expect(setupPreview(w, 900).x).toBeGreaterThan(setupPreview(w, 900).left);
  });
  it('stays inside its size limits at either end', () => {
    expect(setupPreview(1024, 700).scale).toBe(0.55);
    expect(setupPreview(2560, 1440).scale).toBe(0.85);
  });
  it('is cut where the panel ends on the right, and ends where the panel ends at the bottom', () => {
    // The founder on the look step: Home's content was "not properly centered on page, it's very
    // high up", because the window behind it was 1300px tall and ran off the bottom. It is now as
    // tall as the panel, so Home lays out the way it does in a real window.
    for (const [w, h] of [[1440, 900], [1280, 800], [1920, 1080]]) {
      const at = setupPreview(w, h);
      // At its size cap on a wide window it stops short of the right edge instead.
      if (at.right > 0) expect(at.x + (1120 - at.right) * at.scale).toBeCloseTo(w - 16, 5);
      else expect(at.x + 1120 * at.scale).toBeLessThanOrEqual(w - 16);
      expect(at.y + at.h * at.scale).toBeCloseTo(h - 16, 5);
    }
  });
  it('holds Home in its middle, since the preview is taller for its width than a window is', () => {
    expect(css).toMatch(/:root\[data-setup\] \.hm-page \{ align-items: center; padding-top: 0; padding-bottom: 0; \}/);
  });
  it('is placed from those numbers, not from a second copy in the stylesheet', () => {
    expect(css).toMatch(/:root\[data-setup\] #root \{[^}]*left: var\(--ss-x\); top: var\(--ss-y\);\s*width: 1120px; height: var\(--ss-h\);/);
    expect(split).toMatch(/setupPreview\(innerWidth, innerHeight\)/);
  });
});

describe('the first screen of creating an account', () => {
  it('has no grey second line under its heading', () => {
    expect(page).not.toMatch(/Your team sees your name on your threads/);
    expect(page).toMatch(/<h1 className="ss-h"><b>\{ask\}<\/b><\/h1>/);
  });
  it('is a narrower column than the rest of the setup, lined up with it on the left', () => {
    expect(css).toMatch(/:root \.setup-split \.ss-signin \.si-card \{ max-width: 360px; margin: 0; \}/);
    // The sign-in page centres its card with place-items, which Chromium applies to block layout too.
    expect(css).toMatch(/:root \.setup-split \.ss-signin \.si-page \{[^}]*display: block; place-items: normal;/);
  });
  it('puts the terms at the foot of the panel, not between the buttons and the sign-in line', () => {
    expect(split).toMatch(/<div className="ss-foot" ref=\{setFoot\} \/>/);
    expect(page).toMatch(/termsAt \? createPortal\(<p className="si-terms">By continuing, you agree to <TermsLinks \/>\.<\/p>, termsAt\)/);
  });
  it('still shows the terms when no foot is given', () => {
    expect(page).toMatch(/termsAt \? createPortal\([\s\S]{0,120}\) : <p className="si-terms">By continuing, you agree to <TermsLinks \/>\.<\/p>/);
  });
});
