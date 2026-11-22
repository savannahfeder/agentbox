// A SHEET TALLER THAN ITS ROOM SHOWS IT SCROLLS WHEN IT OPENS.
//
// What broke (iOS Simulator, redesign, 2026-11-22): the Model sheet opened with
// a whole row sitting on its rounded bottom edge, so it read as the end of the
// list; the Effort choices under it were only found by scrolling. Read from
// `SheetBody` in ui/parts.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const body = parts.slice(parts.indexOf('function SheetBody('), parts.indexOf('export const SheetHead'));

describe('a sheet whose rows do not fit', () => {
  it('flashes its scroll bar when it turns out to be taller than its room', () => {
    expect(body).toMatch(/useEffect\(\(\) => \{ if \(over\) rows\.current\?\.flashScrollIndicators\(\); \}, \[over\]\);/);
    expect(body).toMatch(/<ScrollView ref=\{rows\}/);
  });
  it('does not flash a sheet that fits, which does not scroll', () => {
    expect(body).toMatch(/scrollEnabled=\{over\}/);
  });
});
