// The desktop moved the AI teammates switch out of Alpha features into
// General, under its own heading, as "Use AI teammates" (2026-11-24, when
// teammates turned on for everyone). The phone parity round of 2026-11-25
// found the phone still drawing it under Alpha features as "Teammates", so
// the two apps put one switch in two places with two names.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsRows } from '../mobile/src/lib/settings-rows';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pages = read('mobile/src/ui/SettingsPages.tsx');
const page = (name: string) => {
  const start = pages.indexOf(`function ${name}()`);
  return pages.slice(start, pages.indexOf('\nfunction ', start + 1));
};

describe("the phone's AI teammates switch", () => {
  it('is in General, under its own AI teammates heading, named as the desktop names it', () => {
    expect(page('General')).toMatch(/<Group label="AI teammates">\s*<SettingSwitch first label="Use AI teammates" [^\n]*k="alphaTeammates"/);
    expect(read('renderer/src/settings-search.ts')).toMatch(/page: 'general', label: 'Use AI teammates'/);
  });

  it('is not under an Alpha features page, which is gone with its Rooms and Multiplayer switches', () => {
    expect(page('Alpha')).toBe('');
    expect(read('mobile/src/ui/SettingsPages.tsx')).not.toMatch(/k="alpha(Rooms|Multiplayer)"/);
  });

  it("is found by the phone's settings search on General", () => {
    expect(phoneSettingsRows({})).toContain('general/Use AI teammates');
    expect(phoneSettingsRows({})).not.toContain('alpha/Teammates');
  });
});
