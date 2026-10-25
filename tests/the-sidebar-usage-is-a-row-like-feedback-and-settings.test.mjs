// THE SIDEBAR'S USAGE IS A ROW LIKE FEEDBACK AND SETTINGS (w-dcaa2c122e, 2026-10-23).
//
// The usage line at the sidebar's foot, "Claude Code 47% used", "looks a bit
// messy, not properly lined up, and has bad UI. I think it's really good to see
// your usage to some degree but not in that presentation."
// Measured in the app at 1710 by 1063: 11 and 10 point text at 65% ink, no icon,
// 28 points tall, under Feedback and Settings, which are 13 point rows 36 tall
// with an 18 point icon. Of five ways drawn, the one picked is a row like its
// neighbours: a gauge, the agent's name, and the percent where Inbox shows its
// count. Closed, the sidebar keeps the gauge, as it keeps every other icon.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsagePill } from '../renderer/src/components/UsagePill.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../renderer/src/workspace-navigation.css');
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

describe('the row', () => {
  it('has an icon, the agent’s name and the percent, with no word after it', () => {
    const html = pill();
    expect(html).toMatch(/<button[^>]*class="usage-pill[^"]*"[^>]*><svg/);
    expect(html).toContain('<span class="usage-row-label">Claude Code</span><span class="usage-row-num">47%</span>');
    // What is drawn, not what is read aloud or shown on pointing, which keeps the whole sentence.
    expect(html.replace(/="[^"]*"/g, '')).not.toContain('used');
  });
  // Since 2026-10-24 it names the agent off its own reading even where no name is
  // handed over (tests/the-usage-row-names-the-agent-you-used-last).
  it('names the agent where this Mac has one coding agent and no name is handed over', () => {
    expect(pill({ engineWord: null })).toContain('<span class="usage-row-label">Claude Code</span>');
  });
  it('reads the whole reading aloud', () => {
    expect(pill()).toContain('aria-label="Claude Code. This session: 47% used');
  });
  it('draws nothing at all before a reading lands', () => {
    expect(pill({ usage: null })).toBe('');
    expect(pill({ usage: { ...reading, limits: [] } })).toBe('');
  });
  it('leaves the bar in the window’s corner as it was', () => {
    const html = pill({ sidebar: false });
    expect(html).toContain('class="usage-meter"');
    expect(html).not.toContain('usage-row');
    expect(html).not.toContain('title=');
  });
});

describe('its look', () => {
  it('is the measure of every other row in the sidebar', () => {
    const row = rule('.workspace-navigation .workspace-usage .usage-pill');
    for (const part of ['height: 36px;', 'padding: 0 10px;', 'gap: 11px;', 'font-size: 13px;']) expect(row).toContain(part);
    expect(css).toMatch(/\.workspace-navigation button \{[^}]*height: 36px;[^}]*padding: 0 10px; gap: 11px;/);
  });
  it('sits 2 points under Settings, as the rows above it sit to each other', () => {
    expect(rule('.workspace-navigation .workspace-usage')).toContain('padding: 0 0 12px; margin-top: -10px;');
    expect(css).toContain('.workspace-utilities { display: flex; flex-direction: column; gap: 2px; padding-bottom: 12px; }');
  });
  it('keeps no small type of its own', () => {
    for (const gone of ['.usage-sidebar-label', '.usage-sidebar-percent', 'padding: 4px 10px 4px 39px']) expect(css).not.toContain(gone);
  });
  it('keeps its icon while the sidebar is narrow, and is gone on the phone', () => {
    expect(css).not.toContain('.workspace-collapsed .workspace-usage { display: none; }');
    expect(css).toContain('@media(max-width:700px) { .workspace-usage { display: none; } }');
  });
  it('opens its limits above it, as wide as the sidebar', () => {
    expect(rule('.workspace-navigation .workspace-usage .usage-panel')).toContain('left: 0; right: 0; width: auto;');
  });
});

describe('the trial it was picked from', () => {
  it('leaves no switch and no other look behind', () => {
    const sources = ['../renderer/src/components/UsagePill.tsx', '../renderer/src/components/WorkspaceNavigation.tsx', '../renderer/src/team/account-menu.tsx', '../renderer/src/App.tsx'].map(read);
    for (const src of sources) {
      for (const gone of ['usage.look', 'readUsageLook', 'usageFace', 'usage-ring', 'usage-line-track', 'usage-under-name']) expect(src).not.toContain(gone);
    }
    for (const gone of ['usage-look-', '.usage-ring', '.usage-line-track']) expect(css).not.toContain(gone);
  });
});
