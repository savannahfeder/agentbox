// A BUTTON IN THE SIDEBAR KEEPS IT OPEN.
//
// The sidebar opens while it is pointed at and closes when the pointer leaves.
// Keeping it open was a switch three clicks away in Settings, and the owner
// asked, 2026-11-23: "maybe we can make it possible to keep the sidebar open,
// beyond just on hover". Three places for a control were drawn over the built
// sidebar and one was approved: a button after the New thread pencil, at the
// sidebar's edge, drawn as lightly as the pencil. ⌘\ does the same.
//
// The button and the key flip the same setting the Settings switch does, so
// the three can never disagree.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SIDEBAR_SHRINKS_KEY, shrinksFrom, sidebarFolded, toggleSidebarShrinks } from '../renderer/src/sidebar-shrinks.ts';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
import { HINTS } from '../renderer/src/hint-plate.ts';
import { SHORTCUTS } from '../shared/shortcuts.mts';
globalThis.React = React;

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

describe('flipping it', () => {
  const kept = new Map();
  beforeEach(() => { kept.clear(); globalThis.localStorage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); } }; });
  afterEach(() => { delete globalThis.localStorage; });
  const folded = () => sidebarFolded({ phone: false, shrinks: shrinksFrom(kept.get(SIDEBAR_SHRINKS_KEY) ?? null), pointedAt: false });

  it('keeps open a sidebar that folded, as it comes with nothing chosen', () => {
    expect(folded()).toBe(true);
    expect(toggleSidebarShrinks()).toBe(false);
    expect(folded()).toBe(false);
  });
  it('lets it fold again on the second press, and keeps it open on the third', () => {
    toggleSidebarShrinks();
    expect(toggleSidebarShrinks()).toBe(true);
    expect(folded()).toBe(true);
    expect(toggleSidebarShrinks()).toBe(false);
    expect(folded()).toBe(false);
  });
  it('starts from what Settings left: a sidebar kept open there folds on the first press', () => {
    kept.set(SIDEBAR_SHRINKS_KEY, '0');
    expect(toggleSidebarShrinks()).toBe(true);
    expect(folded()).toBe(true);
  });
  it('never unfolds a phone, which has no sidebar to keep open', () => {
    toggleSidebarShrinks();
    expect(sidebarFolded({ phone: true, shrinks: shrinksFrom(kept.get(SIDEBAR_SHRINKS_KEY) ?? null), pointedAt: false })).toBe(true);
  });
});

describe('the button', () => {
  const nav = (props = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed: false, rail: true, onView() {}, onSearch() {}, onCompose() {}, onKeepOpen() {}, keptOpen: false, ...props,
  }));
  const button = (html) => html.match(/<button[^>]*class="ws-keep"[^>]*>/)?.[0] ?? null;

  it('comes after the New thread pencil, inside the team’s row', () => {
    const html = nav();
    const row = html.slice(html.indexOf('class="th-team"'), html.indexOf('class="workspace-tabs"'));
    expect(row.indexOf('class="ws-new"')).toBeGreaterThan(-1);
    expect(row.indexOf('class="ws-keep"')).toBeGreaterThan(row.indexOf('class="ws-new"'));
  });
  it('says what a press does now, in each state', () => {
    expect(button(nav({ keptOpen: false }))).toMatch(/aria-label="Keep sidebar open"[^>]*aria-pressed="false"/);
    expect(button(nav({ keptOpen: true }))).toMatch(/aria-label="Shrink sidebar to icons"[^>]*aria-pressed="true"/);
  });
  it('wears the hint for its state, and no second tip of the browser’s own', () => {
    expect(button(nav({ keptOpen: false }))).toContain('data-hint="keep-sidebar"');
    expect(button(nav({ keptOpen: true }))).toContain('data-hint="shrink-sidebar"');
    expect(button(nav())).not.toContain('title=');
  });
  // Measured in the app: under the button the plate lay over Search's ⌘K, which showed through its glass.
  it('hangs its hint above itself, clear of the Search field under it', () => {
    expect(button(nav())).toContain('data-hint-side="above"');
  });
  it('is not drawn with nothing to flip, or on a phone', () => {
    expect(button(nav({ onKeepOpen: undefined }))).toBeNull();
    expect(button(nav({ rail: false, collapsed: true }))).toBeNull();
  });
});

describe('its key and its hint', () => {
  it('prints ⌘\\ beside what the press does, for both states', () => {
    expect(HINTS['keep-sidebar']).toEqual([{ key: '⌘\\', what: 'Keep sidebar open' }]);
    expect(HINTS['shrink-sidebar']).toEqual([{ key: '⌘\\', what: 'Shrink sidebar to icons' }]);
  });
  it('is answered by the app wherever the keyboard is, and not on a phone', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("if ((e.metaKey || e.ctrlKey) && e.key === '\\\\' && !onPhone()) { e.preventDefault(); keepOpenPressed(); return; }");
    expect(app).toContain('keptOpen={!sidebarShrinks} onKeepOpen={keepOpenPressed}');
  });
  it('is on the shortcuts page', () => {
    const row = SHORTCUTS.flatMap((g) => g.keys).find((k) => k.keys.includes('⌘\\'));
    expect(row?.what).toBe('Keep the sidebar open, or shrink it to icons.');
  });
});

describe('its look', () => {
  const css = strip(read('renderer/src/sidebar.css'));
  const P = ':root:root .gt-rail-nav.workspace-navigation';
  it('is the pencil’s size, two points after it, with a line as thin as the pencil’s', () => {
    expect(css).toContain(`${P} :is(.ws-new, .ws-keep) { flex: none; width: 28px; height: 28px;`);
    expect(css).toContain(`${P} .ws-keep { margin-left: -4px; }`);
    expect(read('renderer/src/components/WorkspaceNavigation.tsx')).toMatch(/className="ws-keep"[\s\S]{0,400}<svg viewBox="0 0 16 16"[^>]*strokeWidth="1"/);
  });
  it('is not drawn while the sidebar is closed, or in a window as small as a phone', () => {
    expect(css).toMatch(/\.workspace-collapsed \.gt-rail-nav\.workspace-navigation :is\(\.ws-new, \.ws-keep\) \{[^}]*visibility: hidden/);
    expect(css).toMatch(/@media \(max-width: 700px\), \(max-height: 520px\) \{\s*:root:root \.gt-rail-nav\.workspace-navigation :is\(\.ws-new, \.ws-keep, \.ws-sec, \.ws-recent\) \{ display: none; \}/);
  });
});

// The owner, using the built button: "There's no indication that I'm actually in
// the open state", and "it's really hard to get there because my thing keeps
// closing every time I move my mouse a little close". Measured in the app: the
// button's right edge was the sidebar's own edge, and one point past it the
// sidebar closed at once, taking the button with it.
describe('reaching it, and seeing that it is on', () => {
  const css = strip(read('renderer/src/sidebar.css'));
  const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
  const P = ':root:root .gt-rail-nav.workspace-navigation';
  it('stays lit while the sidebar is kept open', () => {
    expect(css).toContain(`${P} .ws-keep[aria-pressed="true"] { background: var(--sidebar-fill); color: var(--text); }`);
  });
  it('waits a beat before closing when the pointer leaves, and stays if it comes back', async () => {
    const { CLOSES_AFTER_MS, OPENS_AFTER_MS } = await import('../renderer/src/sidebar-shrinks.ts');
    expect(OPENS_AFTER_MS).toBe(140);
    expect(CLOSES_AFTER_MS).toBeGreaterThanOrEqual(250);
    expect(CLOSES_AFTER_MS).toBeLessThanOrEqual(400);
    expect(nav).toContain('leaveAt.current = setTimeout(() => { leaveAt.current = null; onHover(false); }, CLOSES_AFTER_MS);');
    expect(nav).toContain('if (leaveAt.current) { clearTimeout(leaveAt.current); leaveAt.current = null; }');
    // Nothing closes it at once any more.
    for (const line of nav.split('\n').filter((l) => l.includes('onHover(false)'))) expect(line).toContain('setTimeout(');
  });
  it('counts the gap between the open sidebar and the page as the sidebar, and only while it is open', () => {
    expect(css).toContain(`:root:root .gt-rail:not(.workspace-collapsed) .gt-rail-nav.workspace-navigation::after { content: ''; position: absolute; top: 0; bottom: 0; left: 100%; width: 22px; }`);
  });
});
