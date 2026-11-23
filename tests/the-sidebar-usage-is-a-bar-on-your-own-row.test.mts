// THE SIDEBAR'S USAGE IS A BAR ON YOUR OWN ROW.
//
// It was a row of words at the foot, "Claude Code 71%", a gauge before it and
// the percent after (w-dcaa2c122e, 2026-10-23). Beside the redrawn sidebar the
// owner was "not a fan of the ui of 'claude code' in the corner there". Three
// places were drawn for the figure over the real app and one was picked,
// 2026-11-23: "1 bar is perfect." So it is a small bar at the end of the foot's
// last row, which is your own row when you are signed in, with no words. A ring
// was tried first and read as a loading spinner.
//
// Measured in the app at 1760x1005: the bar is 32 by 4, its right edge on the
// rows' right edge, and pointing at it opens the same limits as before.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsagePill } from '../renderer/src/components/UsagePill.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const old = strip(read('../renderer/src/workspace-navigation.css'));
const css = strip(read('../renderer/src/sidebar.css'));
const NOW = Date.parse('2026-10-23T21:00:00Z');
const reading = { engine: 'claude', at: NOW, limits: [
  { span: 'session', qualifier: null, name: 'This session', percent: 47, resetsAt: NOW + 2 * 3600_000 },
  { span: 'week', qualifier: 'all models', name: 'This week', percent: 31, resetsAt: NOW + 3 * 86400_000 },
] };
const pill = (props) => renderToStaticMarkup(createElement(UsagePill, { usage: reading, now: NOW, sidebar: true, engineWord: 'Claude Code', ...props }));
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1);
};

describe('the bar', () => {
  it('is as long as what you have used, and draws no word and no number', () => {
    const html = pill();
    expect(html).toContain('<span class="usage-meter" aria-hidden="true"><i style="width:47%"></i></span>');
    expect(html.replace(/="[^"]*"/g, '').replace(/<[^>]*>/g, '')).toBe('');
  });
  it('is empty at nothing used and full at all of it', () => {
    const at = (percent) => pill({ usage: { ...reading, limits: [{ ...reading.limits[0], percent }] } });
    expect(at(0)).toContain('width:0%');
    expect(at(100)).toContain('width:100%');
  });
  it('reads the whole reading aloud, the agent first', () => {
    expect(pill()).toContain('aria-label="Claude Code. This session: 47% used');
  });
  it('names the agent off its own reading where no name is handed over', () => {
    expect(pill({ engineWord: null })).toContain('aria-label="Claude Code. This session: 47% used');
  });
  it('draws nothing at all before a reading lands', () => {
    expect(pill({ usage: null })).toBe('');
    expect(pill({ usage: { ...reading, limits: [] } })).toBe('');
  });
  it('leaves the bar in the window’s corner as it was', () => {
    const html = pill({ sidebar: false });
    expect(html).toContain('class="usage-meter"');
    expect(html).not.toContain('title=');
  });
});

describe('its look', () => {
  const P = ':root:root .gt-rail-nav.workspace-navigation';
  it('is 32 by 4 at the end of the last row, over the row rather than beside it', () => {
    expect(rule(`${P} .workspace-usage`)).toMatch(/position: absolute; z-index: 1; left: 0; right: 0; bottom: 0;/);
    expect(rule(`${P} .workspace-usage .usage-pill > .usage-meter`)).toMatch(/width: 32px; height: 4px;/);
  });
  it('takes the pointer itself, so the row under it does not swallow the hover', () => {
    expect(rule(`${P} .workspace-usage`)).toContain('pointer-events: none;');
    expect(rule(`${P} .workspace-usage .usage-box`)).toContain('pointer-events: auto;');
  });
  it('leaves your name room before it', () => {
    expect(css).toContain(`${P} .workspace-bottom:has(> .workspace-usage .usage-pill) .th-me .th-me-btn { padding-right: 48px; }`);
  });
  it('is not drawn while the sidebar is closed, and is gone on the phone', () => {
    expect(css).toMatch(/\.workspace-collapsed \.gt-rail-nav\.workspace-navigation \.workspace-usage \{[^}]*visibility: hidden/);
    expect(old).toContain('@media(max-width:700px) { .workspace-usage { display: none; } }');
  });
  it('opens its limits above it, from the sidebar’s left edge', () => {
    expect(rule(`${P} .workspace-usage .usage-panel`)).toContain('bottom: calc(100% + 6px); left: 0; right: auto;');
    expect(old).toMatch(/\.workspace-navigation \.workspace-usage \.usage-panel \{[^}]*width: 268px;/);
  });
});

describe('the row of words it replaced', () => {
  it('leaves nothing behind', () => {
    const sources = ['../renderer/src/components/UsagePill.tsx', '../renderer/src/components/WorkspaceNavigation.tsx', '../renderer/src/team/account-menu.tsx', '../renderer/src/App.tsx'].map(read);
    for (const src of sources) {
      for (const gone of ['usage-row-label', 'usage-row-num', 'GaugeIcon', 'usage.look', 'readUsageLook', 'usageFace', 'usage-ring', 'usage-line-track', 'usage-under-name']) expect(src).not.toContain(gone);
    }
    for (const gone of ['usage-row-num', 'usage-look-', '.usage-ring', '.usage-line-track', '.usage-sidebar-label', '.usage-sidebar-percent']) { expect(old).not.toContain(gone); expect(css).not.toContain(gone); }
  });
});
