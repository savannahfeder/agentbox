// THE PHONE APP OPENS IN LIGHT (2026-11-22). Nothing picked meant Dark, so a new
// phone, and every phone whose owner never opened Appearance, drew the dark look.
// The ask: "let's default to light mode". Measured by calling lookOf(null), which
// answered 'dark', and by reading ui/theme.ts, whose colours started as DARK.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { lookOf, wornOf } from '../mobile/src/lib/look';
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
