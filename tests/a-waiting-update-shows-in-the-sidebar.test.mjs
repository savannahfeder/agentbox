// A WAITING UPDATE SHOWS IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The only place a new version was announced was a row in the inbox, which
// scrolls under newer work, and the ask was for it to show visually in the
// sidebar too. Measured before this change: WorkspaceNavigation drew the same
// markup with an update ready as without one. Three looks are drawn for a
// pick (a line in the foot, a card above it, an icon by the team's name), so
// each is pinned here, along with the two rules all three share: nothing at
// all when there is no update, and no second press while it rebuilds.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
import { sidebarUpdateLook } from '../renderer/src/components/SidebarUpdate.tsx';

const draw = (props) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {},
  onUpdate() {},
  ...props,
}));

describe('a waiting update in the sidebar', () => {
  it('draws nothing about updates when there is none', () => {
    for (const updateLook of ['line', 'card', 'mark']) {
      expect(draw({ update: null, updateLook })).not.toMatch(/sb-update/);
    }
  });

  it('draws a line in the foot, saying Restart to update', () => {
    const html = draw({ update: { installing: false }, updateLook: 'line' });
    expect(html).toMatch(/class="sb-update-line"/);
    expect(html).toContain('Restart to update');
    expect(html).not.toMatch(/sb-update-card|sb-update-mark/);
  });

  it('draws a card above the foot with the restart button on it', () => {
    const html = draw({ update: { installing: false }, updateLook: 'card' });
    expect(html).toMatch(/class="sb-update-card"/);
    expect(html).toContain('New version ready');
    expect(html).toContain('Restart to update');
  });

  it('draws an icon beside the team name, without hiding the name', () => {
    const html = draw({ update: { installing: false }, updateLook: 'mark' });
    expect(html).toMatch(/th-team-name">[^<]+<\/span><button[^>]*class="sb-update-mark"/);
    expect(html).toMatch(/aria-label="Restart to update"/);
  });

  it('says Updating and cannot be pressed again while it rebuilds', () => {
    const line = draw({ update: { installing: true }, updateLook: 'line' });
    expect(line).toContain('Updating');
    expect(line).toMatch(/<button[^>]*disabled=""[^>]*class="sb-update-line"|<button[^>]*class="sb-update-line"[^>]*disabled=""/);
    const card = draw({ update: { installing: true }, updateLook: 'card' });
    expect(card).toContain('Updating');
    expect(card).not.toContain('Restart to update');
  });

  it('shrinks to the line\'s icon when the sidebar is shut, whatever the look', () => {
    for (const updateLook of ['line', 'card', 'mark']) {
      const html = draw({ update: { installing: false }, updateLook, collapsed: true });
      expect(html).toMatch(/class="sb-update-line"/);
      expect(html).not.toMatch(/sb-update-card/);
    }
  });

  it('reads the look, falling back to the line for anything it does not know', () => {
    expect(sidebarUpdateLook('card')).toBe('card');
    expect(sidebarUpdateLook('mark')).toBe('mark');
    expect(sidebarUpdateLook('banner')).toBe('line');
    expect(sidebarUpdateLook(null)).toBe('line');
  });
});
