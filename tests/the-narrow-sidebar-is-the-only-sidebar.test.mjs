// THE NARROW SIDEBAR IS THE ONLY SIDEBAR, FOR EVERY INSTALL (w-a1ed0e8b25).
//
// What broke: App.tsx drew the narrow sidebar only with Groups (alpha) on,
// `narrowSidebar = roomsUi.live && ...`, and `alphaRooms` defaults to false, so
// every new install got the old open sidebar with its collapse button, a
// layout that had not been allowed for a while. Measured by drawing the built
// renderer headless at 1710 by 1063 with no team and no Groups: the open
// sidebar, 202 points wide, Agentbox and a collapse button at its head.
//
// Now the sidebar is narrow and widens only while pointed at, with or without
// a team or Groups. Without Groups it holds Threads, then Feedback and Settings
// at its foot. A phone keeps its own top bar. Nothing opens or shuts it: the
// collapse button, the \ key, the ⌘K row and the remembered state are gone.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';
import { everyKey, keysForAgents } from '../shared/shortcuts.mjs';
import { HINTS } from '../renderer/src/hint-plate';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const palette = read('renderer/src/components/Palette.tsx');

const nav = (props = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: true, rail: true, onView: () => {}, onSearch: () => {}, onCompose: () => {},
  onSettings: () => {}, onFeedback: () => {}, ...props,
}));
const labels = (html) => [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe('every install gets the narrow sidebar', () => {
  it('is narrow on every desktop, not only with Groups on', () => {
    expect(app).toContain('const narrowSidebar = !onPhone();');
    expect(app).not.toMatch(/narrowSidebar = roomsUi\.live/);
  });

  it('is narrow until pointed at, and nothing else widens it', () => {
    expect(app).toContain('const sideFolded = !railOpen;');
    expect(app).toMatch(/rail=\{narrowSidebar\} onHover=\{setRailOpen\}/);
  });

  it('draws the sidebar on every screen, with no condition in front of it', () => {
    expect(app).toMatch(/\n {6}<WorkspaceNavigation\n/);
    expect(app).toContain("className={`app workspace-layout${narrowSidebar ? ` gt-rail gt-inset gt-sumleft");
    expect(app).not.toContain('workspaceNavigation');
    expect(read('renderer/src/workspace-navigation.mjs')).not.toContain('workspaceNavigationShown');
  });

  it('keeps the phone on its own top bar', () => {
    // The boundary: a phone is the one screen that does not get the rail.
    expect(app).toMatch(/import \{[^}]*\bonPhone\b[^}]*\} from '\.\/phone-screen'/);
    expect(nav({ rail: false })).not.toContain('gt-rail-nav');
  });
});

describe('without Groups it holds Threads, Feedback and Settings', () => {
  it('draws exactly those three with no team, no teammates and no Groups', () => {
    expect(labels(nav())).toEqual(['Threads', 'Feedback', 'Settings']);
  });

  it('puts no Groups row under Threads unless Groups is on, and Chats only for teammates', () => {
    expect(app).toContain('groups={roomsUi.live ? roomsUi.sidebarGroups(');
    expect(app).toContain(': teammatesUi.rail(teammatesShown)} />');
  });

  it('names the first row and the page Threads without Groups, and Inbox with them', () => {
    expect(app).toContain("inboxLabel={roomsUi.live ? 'Inbox' : undefined}");
    expect(app).toContain('roomsUi.live && !roomShown ? <h1 className="workspace-title">Inbox</h1>');
  });
});

describe('nothing opens or shuts it', () => {
  it('has no collapse or expand button in either width', () => {
    for (const collapsed of [true, false]) {
      const html = nav({ collapsed });
      expect(html).not.toMatch(/Collapse sidebar|Expand sidebar|workspace-toggle/);
      expect(html).toContain('th-team-name');
    }
    expect(fs.existsSync(path.join(root, 'renderer/src/components/SidebarToggleIcon.tsx'))).toBe(false);
  });

  it('keeps no open-or-shut state and remembers none', () => {
    for (const gone of ['workspaceCollapsed', 'toggleWorkspace', 'togglePanel', 'panelShownNow', 'setPanelUp', 'powerup.sidebar.collapsed', "'zero.panel'"]) {
      expect(app, gone).not.toContain(gone);
    }
  });

  it('has no key, command or hint for it', () => {
    expect(app).not.toMatch(/e\.key === '\\\\'/);
    expect(palette).not.toMatch(/Collapse sidebar|Expand sidebar|onTogglePanel/);
    expect(HINTS.sidebar).toBeUndefined();
    expect(everyKey()).not.toContain('\\');
    // So no agent tells anybody to press it either.
    expect(keysForAgents()).not.toMatch(/left sidebar/);
  });

  it('never renders the retired project rail', () => {
    expect(app).not.toContain('<Rail');
  });
});
