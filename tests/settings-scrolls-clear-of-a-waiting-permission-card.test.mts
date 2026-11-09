// SETTINGS SCROLLS CLEAR OF A WAITING PERMISSION CARD (2026-11-08).
//
// Three first-day testers on the App Store build, in two rounds, could not tap
// the last rows of a Settings page (Codex, Use the cloud) while a permission
// card waited at the bottom of the screen: the card sat over them and the page
// could not scroll them out from under it. The inbox, a thread and a
// teammate's page already leave the card's room under their content
// (approvalRoom); Settings' pages left a fixed 40 points.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync(new URL('../mobile/src/ui/SettingsParts.tsx', import.meta.url), 'utf8');
const page = parts.slice(parts.indexOf('export function Page'), parts.indexOf('export function Group'));

describe("a Settings page's scrolling", () => {
  it('ends below a waiting permission card', () => {
    expect(page).toMatch(/useCloud\(\)/);
    expect(page).toMatch(/paddingBottom: Math\.max\(40 \+ inset\.bottom, approvalRoom \+ 16\)/);
  });
});
