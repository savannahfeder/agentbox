// THE PHONE USES THE DESKTOP'S THREE CORNERS (w-e4d49a1539).
//
// The desktop rounds what you press or type in (6px), cards, sheets and menus
// (10px), and faces; rows, dividers and panels stay square. On 2026-11-04 the
// phone drew every box square: the permission card, the reply box, buttons,
// the list of threads a thread filed. The founder asked for the phone to match.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('renderer/src/styles.css', 'utf8');
const theme = fs.readFileSync('mobile/src/ui/theme.ts', 'utf8');
const px = (name) => Number(css.match(new RegExp(`--${name}:\\s*(\\d+)px`))[1]);
const read = (f) => fs.readFileSync(f, 'utf8');

describe('the phone corners', () => {
  it('are the desktop sizes', () => {
    const corner = theme.match(/export const corner = \{ small: (\d+), card: (\d+) \}/);
    expect(corner, 'theme.ts names its corners').not.toBeNull();
    expect(Number(corner[1])).toBe(px('artifact-corner-small'));
    expect(Number(corner[2])).toBe(px('artifact-corner'));
  });

  it('round the permission card, the threads a thread filed, and the sheet', () => {
    expect(read('mobile/src/ui/Approvals.tsx')).toMatch(/borderRadius: corner\.card/);
    expect(read('mobile/src/ui/ThreadParts.tsx')).toMatch(/borderWidth: 1, borderRadius: corner\.card, overflow: 'hidden', borderColor: color\.line/);
    expect(read('mobile/src/ui/parts.tsx')).toMatch(/borderTopLeftRadius: corner\.card, borderTopRightRadius: corner\.card/);
  });

  it('leave the rows inside a card square, so a pressed row fills its card edge to edge', () => {
    const filed = read('mobile/src/ui/ThreadParts.tsx');
    const row = filed.slice(filed.indexOf("<View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40"));
    expect(row.slice(0, row.indexOf('</Pressable>'))).not.toMatch(/borderRadius/);
  });
});
