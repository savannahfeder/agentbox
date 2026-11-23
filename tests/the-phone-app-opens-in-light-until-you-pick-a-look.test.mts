// THE PHONE APP OPENS IN LIGHT (2026-11-22). Nothing picked meant Dark, so a new
// phone, and every phone whose owner never opened Appearance, drew the dark look.
// The ask: "let's default to light mode". Measured by calling lookOf(null), which
// answered 'dark', and by reading ui/theme.ts, whose colours started as DARK.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { lookOf, schemeOf, wornOf } from '../mobile/src/lib/look';
import { color, LIGHT, DARK, wear } from '../mobile/src/ui/theme';

describe('the look nobody picked', () => {
  it('is Light, and so is a value this build does not know', () => {
    expect(lookOf(null)).toBe('light');
    expect(lookOf(undefined)).toBe('light');
    expect(lookOf('')).toBe('light');
    expect(lookOf('ember-grid')).toBe('light');
  });
  it('is drawn in the light colours before any look is worn', () => {
    expect(fs.readFileSync('mobile/src/ui/theme.ts', 'utf8')).toMatch(/export const color: Palette = \{ \.\.\.LIGHT \}/);
    expect(fs.readFileSync('mobile/src/state/look.tsx', 'utf8')).toMatch(/createContext<LookState>\(\{ look: 'light', worn: 'light'/);
  });
});

describe('a look somebody picked', () => {
  it('stays what they picked, Dark included', () => {
    expect(lookOf('dark')).toBe('dark');
    expect(lookOf('light')).toBe('light');
    expect(lookOf('match')).toBe('match');
    expect(wornOf('dark', 'light')).toBe('dark');
    expect(wornOf('light', 'dark')).toBe('light');
  });
  it('follows the phone only under Match system, and a phone with no answer is light', () => {
    expect(wornOf('match', 'dark')).toBe('dark');
    expect(wornOf('match', 'light')).toBe('light');
    expect(wornOf('match', null)).toBe('light');
  });
  it('still changes every colour when it is worn', () => {
    wear('dark');
    expect(color.bg).toBe(DARK.bg);
    wear('light');
    expect(color.bg).toBe(LIGHT.bg);
  });
});

// "It also should default to light mode rather than matching your operating
// system" (2026-11-22). The screens were Light, but on a phone set to Dark the
// keyboard and the system's own sheets stayed dark, and the ground behind the
// app before it draws was the old Dark's #1a1817. Measured by reading
// app.config.ts and state/look.tsx, which never told the system which look is worn.
describe('what the system draws for the app', () => {
  const look = fs.readFileSync('mobile/src/state/look.tsx', 'utf8');
  it('is told the look that is worn, and to follow the phone only under Match system', () => {
    expect(schemeOf('light')).toBe('light');
    expect(schemeOf('dark')).toBe('dark');
    expect(schemeOf('match')).toBe('unspecified');
    expect(look).toMatch(/Appearance\.setColorScheme\?\.\(schemeOf\(look\)\)/);
  });
  it('starts from Light\'s ground before the app has drawn', () => {
    const config = fs.readFileSync('mobile/app.config.ts', 'utf8');
    expect(config).toContain(`backgroundColor: '${LIGHT.bg}'`);
    expect(config).not.toMatch(/#1a1817/);
  });
});
