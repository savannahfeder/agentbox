// THE PHONE APP HAS A LOOK OF ITS OWN (2026-11-22). The phone drew the desktop
// at phone width: 6px and 10px corners, hairlines under every bar, meta lines
// in uppercase mono, a dot grid and an orange glow behind every screen, and a
// light palette that was the dark one inverted. The founder's words on a
// recording of it: "looks pretty much exactly the same as the original app and
// generally looks pretty bad", "I am looking for a redesign of everything".
// Measured by reading ui/theme.ts and ui/parts.tsx, which held the values above.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LIGHT, DARK, corner, font, lift } from '../mobile/src/ui/theme';

const read = (f: string) => fs.readFileSync(f, 'utf8');
const parts = read('mobile/src/ui/parts.tsx');
const layout = read('mobile/src/app/_layout.tsx');

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('the phone app\'s corners', () => {
  it('are soft: what you press or type in, a card, a sheet, and a pill', () => {
    expect(corner.small).toBeGreaterThanOrEqual(12);
    expect(corner.card).toBeGreaterThanOrEqual(18);
    expect(corner.sheet).toBeGreaterThanOrEqual(26);
    expect(corner.card).toBeGreaterThan(corner.small);
    expect(corner.sheet).toBeGreaterThan(corner.card);
    expect(corner.pill).toBeGreaterThanOrEqual(999);
  });
});

describe('the phone app\'s colours', () => {
  it('are a light page under dark ink in Light, with lighter cards over it', () => {
    expect(LIGHT.bg).toMatch(/^#f[0-9a-f]{5}$/);
    expect(LIGHT.pop).toBe(LIGHT.card);
    expect(lum(LIGHT.bg)).toBeLessThan(lum(LIGHT.card));
  });
  it.each([['Light', LIGHT], ['Dark', DARK]])('read clearly in %s: text, dim and faint words on the page', (_, p) => {
    expect(contrast(p.text, p.bg)).toBeGreaterThan(12);
    expect(contrast(p.dim, p.bg)).toBeGreaterThan(5.5);
    expect(contrast(p.faint, p.bg)).toBeGreaterThan(3.2);
    expect(contrast(p.ink, p.graphite)).toBeGreaterThan(10);
  });
  it('keep one accent, the brand orange, in both', () => {
    expect(LIGHT.accent).toBe('#ee6018');
    expect(DARK.accent).toBe('#ee6018');
  });
});

describe('the phone app\'s type', () => {
  it('is Geist throughout, and every weight it names is loaded', () => {
    for (const f of Object.values(font)) {
      expect(f).toMatch(/^Geist(Mono)?_/);
      expect(layout).toMatch(new RegExp(`${f}[,} ]`));
    }
  });
});

describe('the page behind every screen', () => {
  const wall = parts.slice(parts.indexOf('export function Wall('), parts.indexOf('\n}\n', parts.indexOf('export function Wall(')));
  it('is plain in Light; the dot grid and the glow are Dark\'s alone', () => {
    expect(wall).toMatch(/backgroundColor: color\.bg/);
    expect(wall).toMatch(/color\.glow > 0 && \(\s*<Svg/);
    expect(LIGHT.glow).toBe(0);
    expect(LIGHT.dots).toBe(0);
    expect(DARK.glow).toBeGreaterThan(0);
  });
});

describe('what floats over the page', () => {
  it('casts one soft shadow, named once', () => {
    const s = lift('card');
    expect(s.shadowOpacity).toBeGreaterThan(0);
    expect(s.shadowOpacity).toBeLessThanOrEqual(0.5);
    expect(s.shadowRadius).toBeGreaterThanOrEqual(12);
    expect(lift('float').shadowRadius).toBeGreaterThan(s.shadowRadius);
  });
});

describe('a small button or a box you type in, anywhere in the app', () => {
  const tree = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const all = tree('mobile/src');
  it('is filled and soft, never a thin outline with small corners', () => {
    const outlined = all.filter((f) => /borderWidth: 1, borderRadius: corner\.small, borderColor: color\.line(Strong)?[,} ]/.test(read(f)));
    expect(outlined).toEqual([]);
  });
  it('is at least 32 tall where it is pressed', () => {
    for (const f of all) expect(read(f), f).not.toMatch(/height: (2[4-9]|30), (minWidth: \d+, )?padding(Horizontal|Left): \d+[^\n]*borderRadius: corner\.pill/);
  });
});
