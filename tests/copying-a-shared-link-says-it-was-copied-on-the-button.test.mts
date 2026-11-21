// "No feedback when I copy a link (state of button should change)" (2026-11-10).
// Copy link wrote "Link copied" as a separate line under the buttons, which
// the eye that pressed the button did not go to. Now the button itself turns
// to Copied, with a tick, for COPIED_MS, and then back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { copyWords, COPIED_MS } from '../renderer/src/components/ShareLink.tsx';

const source = fs.readFileSync(new URL('../renderer/src/components/ShareLink.tsx', import.meta.url), 'utf8');

describe('the copy button', () => {
  it('says Copied after a press, Copy link otherwise, and Making the link while the first one is made', () => {
    expect(copyWords({ copied: true, making: false })).toBe('Copied');
    expect(copyWords({ copied: false, making: false })).toBe('Copy link');
    expect(copyWords({ copied: false, making: true })).toBe('Making the link');
  });
  it('holds Copied long enough to read and not so long it looks stuck', () => {
    expect(COPIED_MS).toBeGreaterThanOrEqual(1200);
    expect(COPIED_MS).toBeLessThanOrEqual(3000);
  });
  it('changes on the button, with a tick, and says nothing on a line of its own', () => {
    expect(source).toMatch(/className=\{`av-share-copy\$\{copied \? ' is-copied' : ''\}`\}/);
    expect(source).toMatch(/name=\{copied \? 'check' : 'link'\}/);
    expect(source).not.toMatch(/'Link copied'\)/);
  });
});
