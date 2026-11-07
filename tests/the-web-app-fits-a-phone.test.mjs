// THE WEB APP FITS A PHONE.
//
// The web app is used almost only on a phone (the founder, 2026-10-26). Walked
// at iPhone 15 Pro size (393 x 852) in Chromium against a stand-in cloud, five
// things did not fit:
// - the inboxes row was 426px wide on a 393px screen, so Search was cut in
//   half at the right edge, and the four inboxes alone took 412px;
// - a picture opened full screen was 185px wide, because the stage keeps the
//   desktop's 104px each side for its arrows;
// - a proposal's title was cut to "Add a re…" beside its three answers;
// - a Later row with no return time showed a lone "·";
// - Settings offered Shortcuts, which a phone has no keyboard for.
// Pinned here on the rules that fix each; measured again in Chromium after.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const phone = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const screen = fs.readFileSync(new URL('../renderer/src/phone-screen.ts', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = phone.indexOf(`${sel} {`);
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  return phone.slice(at, phone.indexOf('}', at) + 1);
};

describe('on a phone', () => {
  it('search sits in the top bar, left of the gear, and the top bar makes room for it', () => {
    const r = rule(':root:root:root .th-bar > .th-search');
    expect(r).toMatch(/position: fixed;/);
    expect(r).toMatch(/right: calc\(44px \+ env\(safe-area-inset-right, 0px\)\)/);
    // 88, not 84: the gear and the search both grew to a thumb's 44 (QA batch
    // 005, F-121), so the title keeps clear of four more points.
    expect(rule(':root:root:root .workspace-layout:has(.th-bar > .th-search) > .topbar')).toMatch(/padding-right: 88px;/);
  });
  // Under the title since 2026-10-28, from the left and 18px apart as the
  // phone app draws them: 383px for the four at a text size a step up, inside
  // a 402px phone, and the bar scrolls sideways on a phone set larger still.
  it('the inboxes start at the left, 18px apart, and scroll sideways rather than run off', () => {
    const r = rule(':root:root:root .tm-tabs');
    expect(r).toMatch(/justify-content: flex-start;/);
    expect(r).toMatch(/gap: 18px;/);
    expect(phone).toMatch(/\.list-pane > \.th-bar \{[^}]*overflow-x: auto;/);
    expect(phone).toMatch(/:has\(\.topbar input\) \.th-bar > \.th-search \{ display: none; \}/);
  });
  it('a picture opened is as wide as the screen, less 8px each side', () => {
    expect(rule(':root:root:root .pv-stage')).toMatch(/inset: calc\(72px \+ env\(safe-area-inset-top, 0px\)\) 8px /);
    expect(rule(':root:root:root .pv-step')).toMatch(/width: 44px;/);
  });
  it('a proposal\'s title has its own line', () => {
    expect(rule(':root:root:root .made-row')).toMatch(/flex-wrap: wrap;/);
    expect(rule(':root:root:root .made-open')).toMatch(/flex: 1 0 100%;/);
    expect(rule(':root:root:root .made-title')).toMatch(/white-space: normal;/);
  });
  it('a row with no time shows no dot', () => {
    expect(phone).toMatch(/\.th-grid > :last-child:has\(\.th-when:empty\)::before \{ content: none; \}/);
  });
  it('Settings has no Shortcuts page', () => {
    expect(settings).toMatch(/!\(p\.id === 'shortcuts' && phoneSized\(\)\)/);
    expect(screen).toContain("export const PHONE_SCREEN = '(max-width: 700px), (max-height: 520px)'");
    expect(phone).toContain('@media (max-width: 700px), (max-height: 520px)');
  });
});
