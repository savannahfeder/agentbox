// A PHONE TESTER CAN STILL TAP AFTER THE PAGE REDRAWS (2026-11-08).
//
// Two first-day testers on the App Store build lost the last 20 minutes of
// their stretch: every `phone tap` answered "Nothing to tap" though `look`
// listed the button. Measured with the tool against the preview: open, look,
// tap 2 failed the same way, while Playwright's taps on the same screens
// worked. Each command re-applies the phone's screen when it connects, the page
// redraws, and the numbers the last look stamped on the buttons are gone. A
// tap now looks again once before it gives up.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const phone = fs.readFileSync(new URL('../.claude/skills/product-loop/scripts/phone.mjs', import.meta.url), 'utf8');
const tap = phone.slice(phone.indexOf("verb === 'tap'"), phone.indexOf("verb === 'type'"));

describe('a tap', () => {
  it('stamps the buttons again and tries once more before saying nothing is there', () => {
    expect(tap).toMatch(/if \(!at\) \{ await t\.evaluate\(LOOK\); at = await t\.evaluate\(targetScript\(args\.join\(' '\)\)\); \}[\s\S]*Nothing to tap called/);
  });
});
