// THE PHONE'S SETTINGS CALL THE COMPUTER "YOUR COMPUTER" (QA M-28, 2026-11-03).
//
// Settings › Phone on the Android app read "Read and reply from your phone,
// even with this computer closed." On the phone, "this" is the phone, so the
// page read as if the phone were the computer. The words were the desktop's,
// copied. Measured from the app's UI tree; the same "this computer" was in
// eight lines of the phone's settings, all describing the computer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(`../mobile/src/${rel}`, import.meta.url), 'utf8');

describe("the phone app's settings", () => {
  for (const file of ['ui/SettingsPages.tsx', 'ui/SettingsHome.tsx', 'ui/SettingsParts.tsx']) {
    it(`${file} never calls the computer "this computer"`, () => {
      expect(read(file)).not.toMatch(/this computer/i);
    });
  }
  it('the Phone page says your computer', () => {
    expect(read('ui/SettingsPages.tsx')).toContain('even with your computer closed');
  });
  it('still calls the phone "this phone"', () => {
    expect(read('ui/SettingsPages.tsx')).toContain('Alerts on this phone');
  });
});
