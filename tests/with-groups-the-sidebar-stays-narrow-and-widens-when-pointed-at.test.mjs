// WITH GROUPS THE SIDEBAR STAYS NARROW AND WIDENS WHEN POINTED AT (w-dcaa2c122e, 2026-10-24).
//
// The no-sidebar layout shipped on 2026-10-23, the page's name as a menu of
// Inbox, Groups and every group, put thread titles 66 points from the
// window's edge ("my eye just doesn't go that far to the left comfortably"),
// and its row of group chips over a chat was "functionally overwhelming".
// Asked for: "a sidebar that doesn't really ever expand. Maybe when you hover
// over it, it can get a little bit bigger ... it's never fully expanded." Of
// the two ways drawn to pick a group, the one picked lists every group in the
// sidebar while it is wide. Measured on the stage at 1710 by 1063: thread
// titles now start 126 points in, and every page's top bar holds its words.
// The same day the groups left the sidebar, which keeps one Groups row
// (tests/the-narrow-sidebar-slides-out-on-the-windows-own-ground).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupsInOrder } from '../renderer/src/team/rooms/GroupsSidebar.tsx';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const hook = read('../renderer/src/team/rooms/useRooms.tsx');
const css = read('../renderer/src/team/rooms/rooms.css');

const named = (name, o = {}) => ({ key: `room:${name}`, name, faces: [], at: 0, unread: false, pinned: false, last: '', ...o });
const chat = (name, at, o = {}) => ({ key: `room:${name}`, name, faces: [{ id: name, name, avatarUrl: null }], at, unread: false, pinned: false, last: '', ...o });
const groups = (n) => [named('Northwind', { pinned: true }), named('General'), ...Array.from({ length: n - 2 }, (_, i) => chat(`P${i}`, 100 - i))];

describe('the order groups are listed in', () => {
  it('is named ones first, your pinned one leading, then chats newest first', () => {
    expect(groupsInOrder(groups(4)).map((g) => g.name)).toEqual(['Northwind', 'General', 'P0', 'P1']);
  });
});

describe('the narrow sidebar itself', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; });
  const draw = (props) => {
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
    return renderToStaticMarkup(createElement(WorkspaceNavigation, {
      view: 'inbox', collapsed: true, inboxLabel: 'Inbox', onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onUpdate() {}, ...props,
    }));
  };
  it('has no way to pin it open', () => {
    const html = draw({ rail: true });
    expect(html).not.toContain('Expand sidebar');
    expect(html).not.toContain('Collapse sidebar');
    expect(draw({ rail: false })).toContain('Expand sidebar');
  });
  it('unlights Inbox while a group, or a conversation, is the page', () => {
    expect(draw({ rail: true, onGroupsPage: true })).not.toMatch(/data-tab="inbox" class="workspace-tab active/);
    expect(draw({ rail: true })).toMatch(/data-tab="inbox" class="workspace-tab active/);
  });
});

describe('in the app', () => {
  it('no trial switch and no menu layout is left', () => {
    for (const gone of ['PageMenu.tsx', 'GroupTrials.tsx']) expect(fs.existsSync(new URL(`../renderer/src/team/rooms/${gone}`, import.meta.url))).toBe(false);
    for (const src of [app, hook]) {
      expect(src).not.toContain('railLook');
      expect(src).not.toContain('pageMenu');
      expect(src).not.toContain("'groups.");
    }
    expect(app).not.toContain('<AccountFace');
    expect(app).not.toContain('<TopNotices');
  });
  it('with Groups on, on a desktop, the sidebar is narrow and wide only while pointed at', () => {
    expect(app).toContain('const narrowSidebar = roomsUi.live && workspaceNavigation && !onPhone();');
    expect(app).toContain('const sideFolded = narrowSidebar ? !railOpen : workspaceCollapsed;');
    expect(app).toContain('{workspaceNavigation && <WorkspaceNavigation');
    expect(app).toMatch(/rail=\{narrowSidebar\} onHover=\{setRailOpen\}/);
    // Narrow, the page starts 44 points past the 38-point strip; wide, it moves over
    // (tests/the-narrow-sidebar-opens-by-moving-the-page-over).
    expect(read('../renderer/src/workspace-navigation.css')).toContain('.app.workspace-collapsed { --workspace-width: 38px; }');
  });
  it('the Inbox is titled over its tabs, and a group has no row of chips', () => {
    expect(app).toContain('narrowSidebar && !roomShown ? <h1 className="workspace-title">Inbox</h1>');
    expect(hook).not.toContain('GroupBar');
  });
  it('a direct message lights Groups, and its trail says it came from there when opened over a group', () => {
    expect(app).toMatch(/onGroupsPage=\{roomShown \|\| directOpen\}/);
    expect(app).toContain("directOpen && roomsUi.openId ? 'Groups'");
  });
});

// Kept from the layout before: a thread's own header, and the summary's side.
describe('a thread', () => {
  it('keeps its own header, with no height forced on it', () => {
    expect(app).toContain(': focused ? <><div className="workspace-task-header" ref={setTaskHeader} /><div className="workspace-artifact-header" ref={setArtifactHeader} /></> : (');
    expect(css).not.toMatch(/workspace-task > \.topbar \{[^}]*height/);
  });
  it('folded with S, leaves its summary’s strip on the left, where it was open', () => {
    expect(css).toMatch(/\.gt-sumleft \.ts-rail \{[^}]*right: auto; left: 0;/);
    expect(css).toMatch(/\.gt-sumleft \.focus-pane\[data-summary="rail"\] > \.focus-scroll,/);
  });
});
