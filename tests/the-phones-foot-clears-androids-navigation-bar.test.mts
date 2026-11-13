// THE PHONE'S FOOT CLEARS ANDROID'S NAVIGATION BAR (QA M-37, native Android,
// 2026-11-07 to 11-12).
//
// On 720x1280 with the navigation bar from y=1184: New thread's Attach showed a
// 23px strip and Dictate 5-7px, Email me a link was half cut, and the last row
// of the More, Attach, Stop and Priority sheets showed about 32px. Each of
// those is exactly what is left when the bottom inset reads 0 under a 48pt bar
// (a sheet's 16pt padding is 32px at that density). Android draws apps edge to
// edge and is meant to report the bar; that device reported nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ANDROID_NAV_BAR, bottomRoom } from '../mobile/src/lib/bottom-room';

describe('the room at the foot', () => {
  it('on Android that reports no bar, is the bar', () => {
    expect(bottomRoom('android', 0)).toBe(ANDROID_NAV_BAR);
  });

  it('on Android that reports one, is what it reports, a gesture bar included', () => {
    expect(bottomRoom('android', 24)).toBe(24);
    expect(bottomRoom('android', 48)).toBe(48);
  });

  it("on an iPhone is the home bar's, nothing added", () => {
    expect(bottomRoom('ios', 34)).toBe(34);
    expect(bottomRoom('ios', 0)).toBe(0);
  });

  it('is given to every screen and sheet from the root, and the browser preview keeps its own', () => {
    const layout = fs.readFileSync(new URL('../mobile/src/app/_layout.tsx', import.meta.url), 'utf8');
    expect(layout).toMatch(/bottomRoom\(Platform\.OS, inset\.bottom\)/);
    expect(layout).toMatch(/PREVIEW_PHONE \? <SafeAreaInsetsContext\.Provider value=\{PREVIEW_PHONE\}>\{app\}<\/SafeAreaInsetsContext\.Provider> : <FootRoom>\{app\}<\/FootRoom>/);
  });
});
