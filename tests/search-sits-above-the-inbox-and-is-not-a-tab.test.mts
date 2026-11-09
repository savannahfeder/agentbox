// SEARCH WAS THE SECOND TAB, BETWEEN INBOX AND CHATS (w-5988eed6f3).
//
// With a third row under it, a way to search read as one more place to go.
// Picked from five drawings: Search sits above Inbox on its own, a quiet line
// rather than a tab, and its keys are plain text instead of two boxed caps,
// which read as blocky. Measured by rendering the sidebar: before, Search was
// the second button inside the Threads nav and its keys were `<kbd>⌘</kbd><kbd>K</kbd>`.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const draw = (props = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onView: () => {}, onSearch: () => {}, onCompose: () => {},
  onSettings: () => {}, onPalette: () => {}, ...props,
}));
const tabs = (html) => html.slice(html.indexOf('<nav class="workspace-tabs"'), html.indexOf('</nav>'));

describe('Search above the Inbox', () => {
  it('comes before Inbox, between the team and the tabs', () => {
    const html = draw();
    const team = html.indexOf('class="th-team"');
    const search = html.indexOf('aria-label="Search"');
    const inbox = html.indexOf('data-tab="inbox"');
    expect(team).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(team);
    expect(search).toBeLessThan(inbox);
  });

  it('is not one of the tabs', () => {
    const html = draw();
    expect(tabs(html)).not.toContain('Search');
    expect(html).not.toContain('data-tab="palette"');
    expect(html).toMatch(/<div class="workspace-find"><button[^>]*aria-label="Search"/);
  });

  it('says its keys as plain text, not boxed caps', () => {
    const html = draw();
    expect(html).toContain('<small class="workspace-keys" aria-hidden="true">⌘K</small>');
    expect(html).not.toContain('<kbd>');
  });

  it('is drawn on a rail and on a phone too, where only its glass shows', () => {
    expect(draw({ collapsed: true, rail: true })).toContain('aria-label="Search"');
  });

  it('is hidden on a phone, as the tabs it used to sit among are', () => {
    const phone = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8');
    expect(phone).toContain(':root:root:root .workspace-navigation .workspace-find,');
  });

  it('is absent where nothing opens ⌘K', () => {
    const html = draw({ onPalette: undefined });
    expect(html).not.toContain('Search');
    expect(html).not.toContain('workspace-find');
  });
});
