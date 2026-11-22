// THE PHONE APP WEARS AGENTBOX'S OWN COLOURS AND GEIST (2026-11-22). The phone's
// redesign drew cream paper (#f9f8f4), warm near-black ink and serif titles in
// Newsreader, which read as another product's design system. The founder's
// words on a picture of the inbox: "We still want our white mode colors and
// font", "bring it back to our soul a little bit", and of the rounder shapes,
// "that's good". Measured by reading ui/theme.ts against the desktop's light
// tokens in renderer/src/styles.css, and by counting the files naming the serif.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LIGHT, DARK, corner, font } from '../mobile/src/ui/theme';

const read = (f: string) => fs.readFileSync(f, 'utf8');
const css = read('renderer/src/styles.css');
const tree = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));
const all = tree('mobile/src');

describe('Light on the phone', () => {
  it('is the desktop\'s light page and card, not cream paper', () => {
    expect(LIGHT.bg).toBe(css.match(/--look-light-page: (#[0-9a-f]{6});/)![1]);
    expect(LIGHT.card).toBe(css.match(/--look-light-card: (#[0-9a-f]{6});/)![1]);
    expect(LIGHT.pop).toBe(LIGHT.card);
    expect(LIGHT.bg).not.toBe('#f9f8f4');
  });
  it('writes in the desktop\'s cool ink: text, dim and faint', () => {
    expect(LIGHT.text).toBe('#12182a');
    expect(LIGHT.dim).toBe('#4a5266');
    expect(LIGHT.faint).toBe('#6e7590');
    expect(LIGHT.graphite).toBe('#262b3a');
  });
  it('draws every line and wash from that ink, none from the warm black', () => {
    for (const [k, v] of Object.entries(LIGHT)) expect(String(v), k).not.toMatch(/27, 26, 24|#1b1a18/);
    expect(LIGHT.line).toMatch(/^rgba\(17, 25, 48, /);
    expect(LIGHT.scrim).toMatch(/^rgba\(17, 25, 48, /);
  });
});

describe('Dark on the phone', () => {
  it('is Ember Grid: its ground, its ink and its lines', () => {
    expect(css).toMatch(/\.look-swatch\.ember-grid \{[^}]*#1a1817/);
    expect(DARK.bg).toBe('#1a1817');
    expect(DARK.text).toBe('#efebe7');
    expect(DARK.line).toBe('#464443');
    expect(DARK.card).toBe('#2d2b29');
  });
  it('keeps the dot grid and the orange glow behind every screen, and Light keeps a plain page', () => {
    expect(DARK.dots).toBeGreaterThan(0);
    expect(DARK.glow).toBeGreaterThan(0);
    expect(LIGHT.dots).toBe(0);
    expect(LIGHT.glow).toBe(0);
    const parts = read('mobile/src/ui/parts.tsx');
    const wall = parts.slice(parts.indexOf('export function Wall('), parts.indexOf('\n}\n', parts.indexOf('export function Wall(')));
    expect(wall).toMatch(/color\.glow > 0 && \(/);
    expect(wall).toMatch(/fillOpacity=\{color\.dots\}/);
    expect(wall).toMatch(/stopOpacity=\{color\.glow\}/);
  });
});

describe('the phone app\'s type', () => {
  it('is Geist and Geist Mono, every face of it', () => {
    for (const [k, v] of Object.entries(font)) expect(v, k).toMatch(/^Geist(Mono)?_\d{3}/);
  });
  it('loads no serif and names none on any screen', () => {
    expect(all.filter((f) => /Newsreader|font\.display/.test(read(f)))).toEqual([]);
    expect(read('mobile/package.json')).not.toMatch(/newsreader/i);
  });
  it('still names a screen large, in Geist', () => {
    const parts = read('mobile/src/ui/parts.tsx');
    expect(parts).toMatch(/fontFamily: font\.medium, fontSize: 30, lineHeight: 36/);
  });
});

describe('the shapes she liked', () => {
  it('stay round', () => {
    expect(corner.small).toBeGreaterThanOrEqual(12);
    expect(corner.card).toBeGreaterThanOrEqual(18);
    expect(corner.sheet).toBeGreaterThanOrEqual(26);
    expect(corner.pill).toBeGreaterThanOrEqual(999);
  });
});
