// POINTING AT THE NARROW SIDEBAR MOVES NOTHING UNDER THE POINTER (w-49eac51aa7, 2026-10-25).
//
// "If I hover over the 'Restart to update' button, everything moves. I end up
// clicking the feedback button." With Groups on, the sidebar is a narrow rail
// that widens while pointed at. Narrow, a waiting update was a row at the top
// of the foot; wide, it became the tall card above the foot, so the row under
// the pointer vanished and Feedback slid up into its place. Measured on the
// groups stage at 1710 by 1063: the pointer on the row's middle (y 881) was
// left in the 14px gap between the card's Restart button (ends y 870) and
// Feedback (starts y 900), and a few points lower it was on Feedback.
//
// A plain row in both widths stopped the jump but lost the card's words and
// its ×. Of five middle grounds drawn, the one picked keeps today's card and
// grows it upward out of the row: the row becomes the card's button where it
// stands. So in the rail the markup is the same narrow and wide, and only CSS
// shows the card. The sidebar you open and shut yourself is unchanged.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';

const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had);
  else delete globalThis.localStorage;
});

const draw = (props) => {
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
  return renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', inboxLabel: 'Inbox', onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onFeedback() {},
    onUpdate() {}, onMove() {}, ...props,
  }));
};
const update = { installing: false, version: 'abc1234' };
const move = { place: 'dmg' };
const foot = (html) => html.slice(html.indexOf('class="workspace-bottom"'));
const slot = (html) => /<div class="sb-update-slot">([\s\S]*?)<\/button><\/div>/.exec(html)?.[0] ?? '';

const css = postcss.parse(fs.readFileSync('renderer/src/threads/pages.css', 'utf8'));
const decls = (selector) => {
  const out = {};
  css.walkRules((r) => { if (r.selector.split(/,\s*/).includes(selector)) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};

describe('the narrow sidebar, narrow and then pointed at', () => {
  it('draws the same foot in both widths, so nothing in it can move', () => {
    expect(foot(draw({ rail: true, collapsed: false, update }))).toBe(foot(draw({ rail: true, collapsed: true, update })));
    expect(foot(draw({ rail: true, collapsed: false, move }))).toBe(foot(draw({ rail: true, collapsed: true, move })));
  });

  it('keeps the restart row in the foot list, above Feedback', () => {
    const html = foot(draw({ rail: true, collapsed: false, update }));
    expect(html.indexOf('sb-update-slot')).toBeGreaterThan(html.indexOf('th-side-foot'));
    expect(html.indexOf('sb-update-slot')).toBeLessThan(html.indexOf('aria-label="Feedback"'));
  });

  it('carries the whole card, its words and its ×, with the row as its button', () => {
    const s = slot(draw({ rail: true, collapsed: false, update }));
    expect(s).toContain('class="sb-update-card sb-update-rise"');
    expect(s).toContain('New version ready');
    expect(s).toContain('Restarting takes about a minute.');
    expect(s).toMatch(/class="sb-update-close"[^>]*title="Hide until the next version"/);
    expect(s).toMatch(/<button[^>]*class="sb-update-row"[^>]*aria-label="Restart to update"/);
    expect(s.indexOf('sb-update-rise')).toBeLessThan(s.indexOf('sb-update-row'));
  });

  it('carries the move card the same way', () => {
    const s = slot(draw({ rail: true, collapsed: false, move }));
    expect(s).toContain('Updates are stuck');
    expect(s).toMatch(/<button[^>]*class="sb-update-row"[^>]*aria-label="Move to Applications"/);
  });

  it('is a plain Updating row while a restart runs, with nothing to press', () => {
    const html = draw({ rail: true, collapsed: false, update: { ...update, installing: true } });
    expect(html).not.toContain('sb-update-rise');
    expect(html).toMatch(/class="sb-update-row" data-installing="true" disabled=""/);
  });
});

describe('the styles that keep it in place', () => {
  it('stand the card on the slot\'s floor, so it grows up and pushes nothing', () => {
    const d = decls('.workspace-navigation .sb-update-rise');
    expect(d.position).toBe('absolute');
    expect(d.bottom).toBe('0');
    expect(d.top).toBeUndefined();
  });

  it('hide the card while the sidebar is narrow', () => {
    expect(decls('.workspace-collapsed .sb-update-rise').visibility).toBe('hidden');
  });
});

describe('the sidebar you open and shut yourself', () => {
  it('still shows the card above the foot when open, and the row when shut', () => {
    expect(draw({ rail: false, collapsed: false, update })).toContain('class="sb-update-card"');
    expect(draw({ rail: false, collapsed: false, update })).not.toContain('sb-update-slot');
    expect(draw({ rail: false, collapsed: true, update })).not.toContain('sb-update-card');
    expect(draw({ rail: false, collapsed: false, move })).toContain('class="sb-update-card"');
  });
});
