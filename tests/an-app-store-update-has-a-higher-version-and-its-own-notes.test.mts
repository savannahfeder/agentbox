// AN APP STORE UPDATE HAS A HIGHER VERSION AND ITS OWN NOTES.
//
// Version 0.1.0 went live on the App Store on 2026-11-11. App Store Connect
// refuses a new version whose number is not above the last approved one, and
// the listing's What's New still read "The first version on the App Store."
// when the first update was being prepared on 2026-11-16.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import config from '../mobile/app.config';

const LIVE = '0.1.0';
const en = JSON.parse(fs.readFileSync(new URL('../mobile/store.config.json', import.meta.url), 'utf8')).apple.info['en-US'];

const parts = (v: string) => v.split('.').map(Number);
const above = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

describe('the first App Store update', () => {
  it('compares versions part by part', () => {
    expect(above('0.2.0', '0.1.0')).toBe(true);
    expect(above('0.1.1', '0.1.0')).toBe(true);
    expect(above('0.1.0', '0.1.0')).toBe(false);
    expect(above('0.0.9', '0.1.0')).toBe(false);
    expect(above('0.10.0', '0.9.0')).toBe(true);
  });
  it('is numbered above the version on the App Store', () => {
    expect(above(String(config.version), LIVE)).toBe(true);
  });
  it('says what changed, not that it is the first version', () => {
    expect(en.releaseNotes).not.toMatch(/first version/i);
    expect(en.releaseNotes.length).toBeGreaterThan(40);
    expect(en.releaseNotes.length).toBeLessThanOrEqual(4000);
  });
});
