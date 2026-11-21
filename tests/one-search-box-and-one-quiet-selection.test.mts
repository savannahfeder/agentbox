// ONE SEARCH BOX, AND A SELECTION THAT IS NEUTRAL AND PLAIN TO SEE.
//
// What was wrong, read off screenshots of the Team, Standup, person, Files,
// Connections and Settings pages in dark and light, then checked in the CSS:
// - The search boxes came in four looks: the team list's was 32px, filled, no
//   border, 6px corners; Standup's 30px, a strong border, no fill, 8px; Files'
//   30px, filled and bordered; Connections' took Files' and changed it again.
//   Their magnifiers were 15px and 13px, their words 13.5px and 13px.
// - On a person's page the selected tab ("Chat") differed from the others only
//   by a slightly lighter border.
// - In light the team list's selected row was blue (--bg-selected) while every
//   other selection is a neutral fill.
// - Settings drew a hairline under its search that the app's sidebar dropped.
// - Standup's settings button had no border beside its bordered neighbours.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const teammatesCss = read('renderer/src/teammates/teammates.css');
const standupCss = read('renderer/src/team/standup.css');
const filesCss = read('renderer/src/files/files-place.css');
const connectionsCss = read('renderer/src/connections/connections.css');
const everythingCss = read('renderer/src/team/everything/everything.css');
const settingsCss = read('renderer/src/components/settings.css');
const connections = read('renderer/src/connections/ConnectionsPlace.tsx');

const rule = (css: string, sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  return at < 0 ? '' : css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};
const decls = (css: string, sel: string) => Object.fromEntries(
  rule(css, sel).split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
  }),
);

const boxes: [string, string, string][] = [
  ['team list', teammatesCss, '.cx-search'],
  ['Standup', standupCss, '.su-search'],
  ['Files and Connections', filesCss, '.fp-find'],
];

describe('every search box', () => {
  it.each(boxes)('%s: a filled box with a hairline and the small artifact corner', (_name, css, sel) => {
    const d = decls(css, sel);
    expect(d.background).toBe('var(--wash)');
    expect(d.border).toBe('1px solid var(--line)');
    expect(d['border-radius']).toBe('var(--artifact-corner-small)');
    expect(d.padding).toBe('0 10px');
    expect(d.gap).toBe('8px');
    expect(d['box-sizing']).toBe('border-box');
  });

  it.each(boxes)('%s: the same magnifier, words and placeholder', (_name, css, sel) => {
    const icon = decls(css, `${sel} svg`);
    expect([icon.width, icon.height, icon['stroke-width']]).toEqual(['15px', '15px', '1.5']);
    expect(decls(css, `${sel} input`)['font-size']).toBe('13px');
    expect(decls(css, `${sel} input::placeholder`).color).toBe('var(--text-faint)');
    expect(decls(css, `${sel}:focus-within`)['border-color']).toBe('var(--line-strong)');
  });

  it('is 32px, except on Standup where it matches its row of 30px controls', () => {
    expect(decls(teammatesCss, '.cx-search').height).toBe('32px');
    expect(decls(filesCss, '.fp-find').height).toBe('32px');
    expect(decls(standupCss, '.su-search').height).toBe(decls(standupCss, '.su-day').height);
  });

  it("Connections wears Files' box and changes only its width", () => {
    expect(connections).toContain('className="fp-find cn-find"');
    expect(Object.keys(decls(connectionsCss, '.cn-head .cn-find'))).toEqual(['width']);
  });

  it("Standup's box takes the sky's fill the way the others do", () => {
    expect(standupCss).toMatch(/\.app\.sky-shown:not\(\.home-shown\) \.su-search \{ background-color: color-mix\(in srgb, var\(--sky-under, var\(--bg\)\) 82%, transparent\); \}/);
  });
});

describe('a selection', () => {
  it("on a person's page fills the chosen tab and outlines the rest", () => {
    const off = decls(everythingCss, '.pl-chip');
    expect([off['border-color'], off.color]).toEqual(['var(--line)', 'var(--text-dim)']);
    const on = decls(everythingCss, '.pl-chip[aria-selected="true"]');
    expect(on['border-color']).toBe('transparent');
    expect(on.color).toBe('var(--text)');
    expect(on.background).toContain('var(--wash-strong)');
  });

  it("in the team list is a neutral fill in light, not light's blue", () => {
    expect(decls(teammatesCss, ':root[data-theme="light"] .cx-row.on').background).toBe('var(--wash-strong)');
  });

  it('in the team list stays as it was in dark', () => {
    expect(decls(teammatesCss, '.cx-row.on').background).toBe('var(--bg-selected)');
  });
});

describe('the small things beside them', () => {
  it("Settings' search has no hairline under it", () => {
    expect(settingsCss).not.toMatch(/\.set-search[^{,]*::after/);
  });

  it("Standup's settings button is outlined like the controls beside it", () => {
    const icon = decls(standupCss, '.su-icon');
    expect(icon.border).toBe('1px solid var(--line)');
    expect(icon['border-radius']).toBe(decls(standupCss, '.su-select')['border-radius']);
  });
});
