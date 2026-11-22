// THE PHONE'S BARS, BUTTONS AND SHEETS ARE SOFT (2026-11-22). Every screen's
// top bar was a 19px sans title over a hairline, its buttons bare glyphs, and a
// sheet a square-shouldered slab stuck to the screen's edges under an uppercase
// mono heading. Part of "a redesign of everything". Measured by reading
// ui/parts.tsx, which held each of those.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const piece = (from: string, to: string) => parts.slice(parts.indexOf(from), parts.indexOf(to, parts.indexOf(from) + from.length));
const bar = piece('export function TopBar(', 'export function IconButton(');
const button = piece('export function IconButton(', '\n}\n');
const sheet = piece('function SheetBody(', 'export const SheetHead');
const head = piece('export const SheetHead', 'export const SheetSep');
const row = piece('export function SheetRow(', '\n}\n');

describe('the top bar', () => {
  it('has no line under it', () => {
    expect(bar).not.toMatch(/borderBottom/);
  });
  it('names a screen in the serif, large, and a screen you went into in a smaller sans', () => {
    expect(bar).toMatch(/fontFamily: font\.display, fontSize: 3\d/);
    expect(bar).toMatch(/left \? \{ fontFamily: font\.semibold, fontSize: 17/);
  });
  it('still brings a minimized permission card back', () => {
    expect(bar).toMatch(/accessibilityLabel="Review permission"/);
    expect(bar).toMatch(/borderRadius: corner\.pill/);
  });
});

describe('a button that is only a glyph', () => {
  it('is a soft round key, 36 across in a 40 tall reach', () => {
    expect(button).toMatch(/width: 36, height: 36, borderRadius: 18/);
    expect(button).toMatch(/backgroundColor: bare \? 'transparent' : pressed \? color\.picked : color\.fill/);
    expect(button).toMatch(/height: 40/);
  });
});

describe('a sheet', () => {
  it('floats: clear of the screen\'s edges, round on every corner, with a shadow', () => {
    expect(sheet).toMatch(/marginHorizontal: 8/);
    expect(sheet).toMatch(/borderRadius: corner\.sheet/);
    expect(sheet).toMatch(/\.\.\.lift\('float'\)/);
    expect(sheet).not.toMatch(/borderTopWidth/);
  });
  it('keeps its handle, its drag and its place over the keyboard', () => {
    expect(sheet).toMatch(/grip\.panHandlers/);
    expect(sheet).toMatch(/pan\.panHandlers/);
    expect(sheet).toMatch(/<KeyboardAvoidingView behavior="padding"/);
  });
  it('is headed in plain words, not uppercase mono', () => {
    expect(head).not.toMatch(/uppercase|font\.mono/);
    expect(head).toMatch(/font\.semibold/);
  });
  it('has rows a thumb can hit, ticked when picked', () => {
    expect(row).toMatch(/minHeight: 52/);
    expect(row).toMatch(/borderRadius: corner\.small/);
    expect(row).toMatch(/on \? <Tick/);
  });
});
