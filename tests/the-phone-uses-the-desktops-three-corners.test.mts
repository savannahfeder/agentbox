// THE PHONE ROUNDS WHAT THE DESKTOP ROUNDS (w-e4d49a1539).
//
// The desktop rounds what you press or type in, cards, sheets and menus, and
// faces. On 2026-11-04 the phone drew every box square: the permission card,
// the reply box, buttons, the list of threads a thread filed. The founder
// asked for the phone to match.
//
// 2026-11-22: the redesign gave the phone larger corners of its own
// (the-phone-app-has-a-look-of-its-own). The same things are still rounded,
// and each still takes its corner from the one table in ui/theme.ts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { corner } from '../mobile/src/ui/theme';

const css = fs.readFileSync('renderer/src/styles.css', 'utf8');
const px = (name) => Number(css.match(new RegExp(`--${name}:\\s*(\\d+)px`))[1]);
const read = (f) => fs.readFileSync(f, 'utf8');

describe('the phone corners', () => {
  it('are never smaller than the desktop\'s', () => {
    expect(corner.small).toBeGreaterThanOrEqual(px('artifact-corner-small'));
    expect(corner.card).toBeGreaterThanOrEqual(px('artifact-corner'));
  });

  it('round the permission card, the threads a thread filed, and the sheet', () => {
    expect(read('mobile/src/ui/Approvals.tsx')).toMatch(/borderRadius: corner\.card/);
    expect(read('mobile/src/ui/ThreadParts.tsx')).toMatch(/borderWidth: 1, borderRadius: corner\.card, overflow: 'hidden', borderColor: color\.line/);
    expect(read('mobile/src/ui/parts.tsx')).toMatch(/borderRadius: corner\.sheet/);
  });

  it('leave the rows inside a card square, so a pressed row fills its card edge to edge', () => {
    const filed = read('mobile/src/ui/ThreadParts.tsx');
    const row = filed.slice(filed.indexOf("<View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40"));
    expect(row.slice(0, row.indexOf('</Pressable>'))).not.toMatch(/borderRadius/);
  });
});
