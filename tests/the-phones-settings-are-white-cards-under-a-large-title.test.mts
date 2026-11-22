// THE PHONE'S SETTINGS ARE WHITE CARDS UNDER A LARGE TITLE (2026-11-22).
// Settings drew the desktop's plates: a grey outlined box per group, 13.5px
// rows, a 38px switch, 28px outlined chips and buttons, and "Back to app" as
// letter-spaced words. Part of "a redesign of everything". Measured by reading
// ui/SettingsParts.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/SettingsParts.tsx', 'utf8');
const fn = (name: string) => parts.slice(parts.indexOf(`export function ${name}`), parts.indexOf('\n}\n', parts.indexOf(`export function ${name}`)));

describe('a settings page', () => {
  it('is named large under a round way back', () => {
    expect(fn('Page')).toMatch(/fontFamily: font\.medium, fontSize: 30/);
    expect(fn('Page')).toMatch(/<IconButton label=\{back\} onPress=\{leave\}><Back size=\{16\} \/><\/IconButton>/);
  });
  it('keeps its room under the last row for a permission card', () => {
    expect(fn('Page')).toMatch(/approvalRoom \+ 16/);
  });
});

describe('a group of settings', () => {
  it('is a white card with no outline, under a small label', () => {
    expect(fn('Group')).toMatch(/backgroundColor: color\.card, borderRadius: corner\.card/);
    expect(fn('Group')).not.toMatch(/borderWidth/);
    expect(fn('Group')).toMatch(/<Caps style=\{\{ paddingHorizontal: 4/);
  });
});

describe('a row of settings', () => {
  it('is set at reading size: 16 for its name, 13.5 for what it does', () => {
    expect(fn('Row')).toMatch(/fontSize: 16, lineHeight: 22/);
    expect(fn('Row')).toMatch(/fontSize: 13\.5, lineHeight: 19/);
    expect(fn('NavRow')).toMatch(/minHeight: 54/);
    expect(fn('NavRow')).toMatch(/fontSize: 16/);
  });
});

describe('a control at a row\'s end', () => {
  it('is a switch the size of a thumb', () => {
    expect(fn('Switch')).toMatch(/width: 50, height: 30, borderRadius: 15/);
    expect(fn('Switch')).toMatch(/accessibilityRole="switch"/);
  });
  it('is a chip or a button with no outline, a pill', () => {
    for (const name of ['Chip', 'Button']) {
      expect(fn(name)).toMatch(/borderRadius: corner\.pill/);
      expect(fn(name)).not.toMatch(/borderWidth/);
      expect(fn(name)).toMatch(/height: 3[2-6]/);
    }
  });
});
