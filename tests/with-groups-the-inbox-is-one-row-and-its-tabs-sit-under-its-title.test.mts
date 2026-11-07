// WITH GROUPS THE INBOX IS ONE ROW, AND ITS TABS SIT UNDER ITS TITLE (w-dcaa2c122e, 2026-10-23).
//
// With Rooms on, the sidebar had Threads, then Messages and Rooms, and the page
// said "Threads" in a title over its own row of tabs. Asked for: no separate
// rooms rows in the sidebar ("calling that page Threads is even technically
// incorrect because it encompasses groups"). Measured by drawing the sidebar
// with Rooms on: three rows, Threads, Messages and Rooms. Now the first row
// is Inbox, and with Groups off it still says Threads.
//
// For a day the tabs took the top bar; since 2026-10-24 the page is titled
// Inbox over its tabs again, beside the narrow sidebar, which lists Groups
// under Inbox (tests/with-groups-the-sidebar-stays-narrow-and-widens-when-pointed-at).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');

const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had);
  else delete globalThis.localStorage;
});
const draw = (props) => {
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
  return renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed: false, onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onUpdate() {}, ...props,
  }));
};
const rows = (html) => [...html.matchAll(/class="workspace-tab(?: [^"]*)?"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe('the sidebar', () => {
  it('has one row, Inbox, while Groups is on', () => {
    expect(rows(draw({ inboxLabel: 'Inbox' }))).toEqual(['Inbox']);
  });
  it('says Threads while Groups is off', () => {
    expect(rows(draw({}))).toEqual(['Threads']);
  });
  it('is told Inbox only while Groups is on, and is handed no rows of rooms', () => {
    expect(app).toContain("inboxLabel={roomsUi.live ? 'Inbox' : undefined}");
    expect(app).not.toContain('roomsUi.nav(');
    expect(app).not.toMatch(/rooms=\{roomsUi/);
  });
  it('keeps Inbox lit with a group open, since the group is on its page', () => {
    expect(app).not.toContain('roomOpen=');
  });
});

describe('the tabs', () => {
  it('sit under the Inbox’s title, never in the top bar', () => {
    expect(app).not.toContain('tabsInTop');
    expect(app).not.toContain('className="tabs-top"');
    expect(app).toContain('roomsUi.live && !roomShown ? <h1 className="workspace-title">Inbox</h1>');
  });
  it('are not hidden by any rule left from the top bar', () => {
    expect(css).not.toContain('.tabs-top');
  });
  it('a page of its own, a person or Find groups, still has its back arrow there instead', () => {
    expect(app).toMatch(/roomShown && roomsUi\.heading \? roomsUi\.heading\.title : <h1 className="workspace-title">Threads<\/h1>/);
  });
});

describe('a direct record', () => {
  it('opens in its own view, with no Messages page around it', () => {
    expect(app).not.toContain('messagesShell');
    expect(app).not.toContain('directOnMessages');
  });
});
