// Clicking the Search box at the top of the Settings menu did nothing. The
// strip it sits in, `.set-nav-top`, is a window drag region for the frameless
// window, and only the "Back to app" button opted out of it, so a press on the
// box went to dragging the window and never focused the input. Measured by
// reading the CSS: `.set-search` carried no `-webkit-app-region` at all.
//
// The rule is held for every control in the strip, not just the search box,
// so the next one added there cannot fall into the same hole.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tsx = read('renderer/src/components/Settings.tsx');
const css = read('renderer/src/styles.css') + read('renderer/src/components/settings.css');

const navTop = tsx.slice(tsx.indexOf('<div className="set-nav-top">'), tsx.indexOf('<div className="set-nav-scroll">'));

const controls = [...navTop.matchAll(/<(button|label|input|a)\b[^>]*className="([^"]+)"/g)].map((m) => m[2].split(/\s+/)[0]);

const optsOut = (cls, sheet = css) => {
  const rules = [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  return rules.some(([, sel, body]) =>
    sel.split(',').some((s) => new RegExp(`\\.${cls}\\s*$`).test(s.trim())) && /-webkit-app-region:\s*no-drag/.test(body));
};

describe('the settings menu strip', () => {
  it('is still a drag region, so the check below is about something real', () => {
    expect(css).toMatch(/\.set-nav-top\s*\{[^}]*-webkit-app-region:\s*drag/);
  });

  it('holds the back button and the search box', () => {
    expect(controls).toEqual(expect.arrayContaining(['set-nav-back', 'set-search']));
  });

  it('opts the search box out of the drag region, or a click moves the window', () => {
    expect(optsOut('set-search')).toBe(true);
  });

  it('opts every control in the strip out of the drag region', () => {
    expect(controls.filter((c) => !optsOut(c))).toEqual([]);
  });

  it('does not count a rule on a child of the box as the box opting out', () => {
    expect(optsOut('set-search', '.set-search input { -webkit-app-region: no-drag; }')).toBe(false);
    expect(optsOut('set-search', '.set-search:hover { -webkit-app-region: no-drag; }')).toBe(false);
    expect(optsOut('set-search', '.a, .set-search { -webkit-app-region: no-drag; }')).toBe(true);
  });
});
