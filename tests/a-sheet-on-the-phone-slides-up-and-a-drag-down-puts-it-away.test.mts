// A SHEET ON THE PHONE SLIDES UP AND A DRAG DOWN PUTS IT AWAY.
//
// What broke (phone review, 2026-11-21): every picker faded in as a slab with
// no handle; the only way out was a tap on the dimmed screen above it, and a
// drag on it did nothing. Phone sheets elsewhere slide up on a spring and go
// with a flick down. Read from `sheetLetGo` and the Sheet in ui/parts.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sheetLetGo, sheetPull } from '../mobile/src/lib/sheet-drag';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const sheet = parts.slice(parts.indexOf('export function Sheet('), parts.indexOf('export const SheetHead'));

describe('letting go of a dragged sheet', () => {
  it('puts it away past a third of its height', () => {
    expect(sheetLetGo(121, 0, 360)).toBe('away');
  });
  it('puts it away on a quick flick, however short', () => {
    expect(sheetLetGo(24, 1.2, 360)).toBe('away');
  });
  it('springs it back on a short slow drag', () => {
    expect(sheetLetGo(119, 0.2, 360)).toBe('back');
  });
  it('springs it back on a flick up', () => {
    expect(sheetLetGo(-40, -1.5, 360)).toBe('back');
  });
});

describe('pulling a sheet', () => {
  it('follows the finger down', () => {
    expect(sheetPull(80)).toBe(80);
  });
  it('gives only a little when pulled up', () => {
    expect(sheetPull(-80)).toBeGreaterThan(-20);
    expect(sheetPull(-80)).toBeLessThan(0);
  });
});

describe('the sheet', () => {
  it('slides itself in on a spring instead of the modal fading', () => {
    expect(sheet).toMatch(/animationType="none"/);
    expect(sheet).toMatch(/Animated\.spring\(/);
    expect(sheet).toMatch(/useNativeDriver: true/);
  });
  it('stays on screen until its slide out ends', () => {
    expect(sheet).toMatch(/setShown\(false\)/);
    expect(sheet).toMatch(/visible=\{shown\}/);
  });
  it('wears a handle and answers a drag', () => {
    expect(sheet).toMatch(/PanResponder\.create/);
    expect(sheet).toMatch(/sheetLetGo\(/);
    expect(sheet).toMatch(/width: 36, height: 5, borderRadius: 3/);
  });
});

// On Android a native scroll view takes every vertical drag that starts on it,
// even one with nothing to scroll, so a sheet that fits only scrolls when it
// does not (found on the emulator: a pull on the Later rows did nothing).
describe('a sheet whose rows fit', () => {
  const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
  const body = parts.slice(parts.indexOf('function SheetBody('), parts.indexOf('export const SheetHead'));
  it('does not scroll, so a pull anywhere on it drags it down', () => {
    expect(body).toMatch(/scrollEnabled=\{over\}/);
    expect(body).toMatch(/onContentSizeChange=\{\(_, h\) => setInner\(h\)\}/);
    expect(body).toMatch(/const over = inner > box \+ 1;/);
  });
});
