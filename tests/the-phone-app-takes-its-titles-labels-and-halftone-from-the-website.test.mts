// THE PHONE APP TAKES ITS TITLES, LABELS AND HALFTONE FROM THE WEBSITE
// (2026-11-22). With Agentbox's colours and Geist back, the phone still read as
// a generic rounded app: heavy titles, grey pills for what waits on you, a blank
// page. The founder pointed at agentbox.ac as the style to follow. Measured from
// its stylesheet: titles are Geist 500 at -0.04em, small labels are Geist Mono
// uppercase at 0.12em, what waits on you is written in the orange, and the page
// carries an orange halftone. In the first draw the dots ran 300px in, under
// the tab names and through the round buttons' 4% fill.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LIGHT, DARK } from '../mobile/src/ui/theme';

const read = (f: string) => fs.readFileSync(f, 'utf8');
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
const parts = read('mobile/src/ui/parts.tsx');
const inbox = read('mobile/src/app/index.tsx');
const cut = (src: string, from: string) => src.slice(src.indexOf(from), src.indexOf('\n}\n', src.indexOf(from)));
const tracking = (style: string) => { const m = style.match(/fontSize: ([\d.]+), lineHeight: [\d.]+, letterSpacing: (-?[\d.]+)/)!; return Number(m[2]) / Number(m[1]); };

describe('a screen\'s name', () => {
  const titles: [string, string][] = [
    ['the top bar', cut(parts, 'export function TopBar(').match(/: (\{ fontFamily: font\.\w+, fontSize: \d+[^}]*\})/)![1]],
    ['a settings page', cut(read('mobile/src/ui/SettingsParts.tsx'), 'export function Page').match(/\{ fontFamily: font\.\w+, fontSize: \d\d, lineHeight[^}]*\}/)![0]],
    ['a first-run screen', cut(read('mobile/src/ui/Onboarding.tsx'), 'export function Head(').match(/\{ fontFamily: font\.\w+, fontSize: \d\d, lineHeight[^}]*\}/)![0]],
    ['a thread', read('mobile/src/app/thread/[product]/[id].tsx').match(/\{ fontFamily: font\.\w+, fontSize: 2[4-9], lineHeight[^}]*\}/)![0]],
  ];
  it.each(titles)('is Geist Medium on %s, not the heavy weight', (_, style) => {
    expect(style).toMatch(/fontFamily: font\.medium/);
  });
  it.each(titles)('is set tight on %s: the website\'s -0.04em, give or take', (_, style) => {
    expect(tracking(style)).toBeLessThanOrEqual(-0.035);
    expect(tracking(style)).toBeGreaterThanOrEqual(-0.045);
  });
  it('leaves a row\'s title alone: heavy while unread, no tight tracking', () => {
    expect(inbox).toMatch(/fontFamily: unread \? font\.semibold : font\.regular/);
    expect(inbox).toMatch(/const rowHead = \{[^}]*letterSpacing: -0\.2 \}/);
  });
});

describe('a small label', () => {
  const caps = cut(parts, 'export function Caps(');
  it('is Geist Mono, uppercase, letter-spaced 0.12em', () => {
    expect(caps).toMatch(/fontFamily: font\.mono/);
    expect(caps).toMatch(/textTransform: 'uppercase'/);
    const [, px, gap] = caps.match(/fontSize: ([\d.]+), lineHeight: [\d.]+, letterSpacing: ([\d.]+)/)!;
    expect(Number(px)).toBeGreaterThanOrEqual(11);
    expect(Number(gap) / Number(px)).toBeCloseTo(0.12, 1);
  });
  it('is the one place the phone forces uppercase', () => {
    expect(files('mobile/src').filter((f) => /textTransform: 'uppercase'/.test(read(f)))).toEqual(['mobile/src/ui/parts.tsx']);
    expect(parts.match(/textTransform: 'uppercase'/g)).toHaveLength(1);
  });
  it.each([
    ['a settings group', cut(read('mobile/src/ui/SettingsParts.tsx'), 'export function Group(')],
    ['a sheet\'s heading', cut(parts + '\n}\n', 'export const SheetHead')],
    ['Repeating in the inbox', cut(inbox, 'function RepeatRows(')],
    ['a search section', read('mobile/src/app/search.tsx')],
    ['a filter', cut(read('mobile/src/ui/Filters.tsx'), 'function Line(')],
  ])('heads %s', (_, src) => {
    expect(src).toMatch(/<Caps[ >]/);
  });
  it('is not what a tab, a button or a row\'s title is written in', () => {
    expect(cut(inbox, 'function ThreadRow(')).not.toMatch(/<Caps[^>]*>\{row\.title\}/);
    expect(cut(parts, 'export function ChoiceButton(')).not.toMatch(/<Caps/);
    expect(cut(inbox, 'function Tabs(')).not.toMatch(/<Caps/);
  });
});

describe('what a row waits on', () => {
  const chip = inbox.slice(inbox.indexOf('const Chip ='), inbox.indexOf('function ThreadRow('));
  it('is written in the orange when it waits on you, with no grey pill under it', () => {
    expect(chip).toMatch(/<Caps tint=\{mine \? color\.accent : color\.dim\}/);
    expect(chip).not.toMatch(/backgroundColor: color\.picked/);
    expect(cut(inbox, 'function ThreadRow(')).toMatch(/<Chip mine=\{!row\.held\}>\{aside\}<\/Chip>/);
  });
  it('stays grey for what does not: a thread not started, one still queued', () => {
    expect(cut(inbox, 'function ThreadRow(')).toMatch(/\{row\.queued && <Chip>Queued<\/Chip>\}/);
    expect(cut(inbox, 'function RepeatRows(')).toMatch(/<Chip>Queued<\/Chip>/);
  });
});

describe('the page behind every screen', () => {
  const wall = cut(parts, 'export function Wall(');
  it('carries an orange halftone in Light, in the top corner, and none in Dark', () => {
    expect(LIGHT.halftone).toBeGreaterThan(0);
    expect(LIGHT.halftone).toBeLessThanOrEqual(0.5);
    expect(DARK.halftone).toBe(0);
    expect(wall).toMatch(/color\.halftone > 0 && \(/);
    expect(wall).toMatch(/fill=\{color\.accent\} fillOpacity=\{color\.halftone\}/);
  });
  it('fades the halftone into the page, so words lower down sit on a plain page', () => {
    expect(wall).toMatch(/<Stop offset="1" stopColor=\{color\.bg\} stopOpacity=\{1\} \/>/);
  });
  it('is spent before the tabs: the dots stay in the corner over the page\'s name', () => {
    const size = Number(parts.match(/const HALFTONE = (\d+);/)![1]);
    expect(size).toBeGreaterThanOrEqual(160);
    expect(size).toBeLessThanOrEqual(240);
    const mid = wall.match(/<Stop offset="(0\.\d+)" stopColor=\{color\.bg\} stopOpacity=\{(0\.\d+)\} \/>/)!;
    expect(Number(mid[2])).toBeGreaterThan(Number(mid[1]));
  });
  it('does not show through a round button: its fill is solid, in both looks', () => {
    for (const look of [LIGHT, DARK]) expect(look.round).toMatch(/^#[0-9a-f]{6}$/);
    expect(cut(parts, 'export function IconButton(')).toMatch(/backgroundColor: bare \? 'transparent' : pressed \? color\.picked : color\.round/);
    expect(cut(parts, 'export function IconButton(')).not.toMatch(/color\.fill/);
  });
  it('keeps Dark its grid and glow', () => {
    expect(DARK.dots).toBeGreaterThan(0);
    expect(DARK.glow).toBeGreaterThan(0);
    expect(LIGHT.dots).toBe(0);
  });
});
