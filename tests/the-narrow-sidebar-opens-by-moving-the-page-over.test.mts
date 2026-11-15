// THE NARROW SIDEBAR OPENS BY MOVING THE PAGE OVER (w-dcaa2c122e, 2026-10-24).
//
// Pointed at, the narrow sidebar slid out over the page, a panel on the
// window's ground laid across the page's left edge. Asked for: "If you look at
// the settings page, wouldn't it be nice if, when you hover over it, it moved
// the contents of the page over just briefly? Wouldn't that be smoother?"
// It now opens to the full sidebar, Settings' width, and the page moves over
// beside it until the pointer leaves.
// Measured on the stage at 1710 by 1063, stepping the app's own transitions a
// 60th of a second at a time: the page's left edge goes 82 to 246 over 14
// frames opening and back over 12 closing, the sidebar's width moving with it.
// The first try eased the shared width, which every element inherits, and so
// restyled the whole page each frame: 76 ms of style work per opening, 12 ms
// once only the four things that read the width are eased.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarGroups } from '../renderer/src/team/rooms/GroupsSidebar.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../renderer/src/team/rooms/rooms.css');
const nav = read('../renderer/src/workspace-navigation.css');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1);
};
const eased = '.app.workspace-layout.gt-rail, .gt-rail.workspace-layout::before, .gt-rail > .panel-marks, .gt-rail .workspace-navigation.gt-rail-nav';
const easedOpen = '.app.workspace-layout.gt-rail.gt-rail-open, .gt-rail-open.workspace-layout::before, .gt-rail-open > .panel-marks, .gt-rail-open .workspace-navigation.gt-rail-nav';

describe('the sidebar, pointed at', () => {
  it('lays nothing over the page: no panel of its own, and the page’s edge is not pinned to the narrow strip', () => {
    expect(css).not.toContain('.gt-rail-nav::before');
    expect(css).not.toContain('--workspace-left: calc(44px + 38px)');
    expect(nav).toContain('--workspace-left: calc(44px + var(--workspace-width))');
  });
  it('opens to the full sidebar, the width of Settings’ own list', () => {
    expect(nav).toContain('.app.workspace-layout { --workspace-width: 202px;');
    expect(nav).toContain('.app.workspace-layout.workspace-settings { --workspace-width: 202px; }');
    expect(css).not.toMatch(/gt-rail[^{]*\{[^}]*--workspace-width:/);
  });
  it('moves the page’s edge, its frame, the frame’s corner marks and its own width together, over time both ways', () => {
    expect(rule(eased)).toContain('transition-property: padding-left, left, width;');
    expect(rule(eased)).toMatch(/transition-duration: \.\d+s/);
    expect(rule(easedOpen)).toMatch(/transition-duration: \.\d+s/);
  });
  it('does not ease the shared width, which restyles every element each frame', () => {
    expect(css).not.toContain('@property --workspace-width');
    expect(css).not.toMatch(/transition:[^;]*--workspace-width/);
  });
  it('leaves Settings’ own list where it is', () => {
    expect(css).toContain('.app.workspace-layout.gt-rail.workspace-settings, .gt-rail.workspace-settings::before, .gt-rail.workspace-settings > .panel-marks { transition: none; }');
  });
  it('fades its words in and out instead of hiding them, keeping your face', () => {
    expect(css).toMatch(/\.workspace-collapsed \.gt-rail-nav\.workspace-navigation button > span:not\(\.tm-av\)[^{]*\{ display: block; opacity: 0;/);
    expect(css).toMatch(/\.gt-rail-nav button > span:not\(\.tm-av\)[^{]*\{ display: block; white-space: nowrap; opacity: 1; transition: opacity/);
  });
  it('stands still for anyone who asks for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.app\.workspace-layout\.gt-rail, \.gt-rail\.workspace-layout::before, \.gt-rail > \.panel-marks, \.gt-rail \.workspace-navigation\.gt-rail-nav,[^{]*\{ transition: none !important; \}/);
  });
  // There is no other sidebar since w-a1ed0e8b25; the phone's, which is not a
  // rail, still hides its words.
  it('hides the words of a sidebar that is not the rail', () => {
    expect(nav).toContain('.workspace-collapsed .workspace-navigation button > span { display: none; }');
  });
});

describe('Groups in the sidebar', () => {
  const side = (props) => renderToStaticMarkup(createElement(SidebarGroups, { onGroupsPage: false, onGroups() {}, ...props }));
  it('is one row, and no group is listed under it', () => {
    const html = side({ groups: [{ key: 'room:a', name: 'Northwind' }] });
    expect([...html.matchAll(/<button/g)]).toHaveLength(1);
    expect(html).toContain('aria-label="Groups"');
    expect(html).not.toContain('Northwind');
  });
  it('is lit on a group’s page and not on the Inbox', () => {
    expect(side({ onGroupsPage: true })).toMatch(/class="workspace-tab active"[^>]*aria-label="Groups"/);
    expect(side({})).not.toContain('active');
  });
  it('leaves no rule behind for the rows it used to hold', () => {
    for (const gone of ['.gt-rail-list', '.gt-rail-row', '.gt-rail-dot', '.gt-rail-quiet']) expect(css).not.toContain(gone);
  });
});
