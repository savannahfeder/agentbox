// A SHEET TALLER THAN ITS ROOM SHOWS IT SCROLLS WHEN IT OPENS.
//
// What broke (iOS Simulator, redesign, 2026-11-22): the Model sheet opened with
// a whole row sitting on its rounded bottom edge, so it read as the end of the
// list; the Effort choices under it were only found by scrolling. Read from
// `SheetBody` in ui/parts.tsx. With only the scroll bar's flash, "Fable 5"
// still sat flush on the edge by the home bar once the flash was gone, so the
// last rows now fade into the sheet until it is scrolled to its end.
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

describe('the fade over a sheet\'s last rows', () => {
  it('shows while more rows sit below, in the sheet\'s own colour, and takes no touches', () => {
    expect(body).toMatch(/\{over && !end && \(\s*<Svg style=\{\{ position: 'absolute', left: 0, right: 0, bottom: 0 \}\} width="100%" height=\{FADE\} pointerEvents="none">/);
    expect(body).toMatch(/<Stop offset="0" stopColor=\{color\.pop\} stopOpacity=\{0\} \/><Stop offset="1" stopColor=\{color\.pop\} stopOpacity=\{1\} \/>/);
  });
  it('goes once the sheet is scrolled to its end, so the last row reads whole', () => {
    expect(body).toMatch(/setEnd\(n\.contentOffset\.y \+ n\.layoutMeasurement\.height >= n\.contentSize\.height - 1\)/);
  });
  it('is never drawn on a sheet that fits', () => {
    expect(body.match(/<LinearGradient/g)).toHaveLength(1);
    expect(body).not.toMatch(/\{!end && \(/);
  });
});
