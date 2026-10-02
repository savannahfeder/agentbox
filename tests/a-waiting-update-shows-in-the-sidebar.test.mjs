// A WAITING UPDATE SHOWS IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The only place a new version was announced was a row in the inbox, which
// scrolls under newer work, and the ask was for it to show visually in the
// sidebar. Measured before this change: WorkspaceNavigation drew the same
// markup with an update ready as without one. Of three looks drawn (a line in
// the foot, a card above it, an icon by the team's name) the card was picked,
// the inbox row was taken out, and the icon's colour changed: the brand
// red-orange read as "there's a bug", so it is grey.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
import { changeLines } from '../renderer/src/update-row.ts';

const draw = (props) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {},
  onUpdate() {},
  ...props,
}));

const css = postcss.parse(fs.readFileSync('renderer/src/threads/pages.css', 'utf8'));
const decls = (selector) => {
  const out = {};
  css.walkRules((r) => { if (r.selector === selector) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};

describe('a waiting update in the sidebar', () => {
  it('draws nothing about updates when there is none', () => {
    expect(draw({ update: null })).not.toMatch(/sb-update/);
    expect(draw({ update: null, collapsed: true })).not.toMatch(/sb-update/);
  });

  it('draws a card above the foot with the restart button on it', () => {
    const html = draw({ update: { installing: false } });
    expect(html).toMatch(/class="sb-update-card"/);
    expect(html).toContain('New version ready');
    expect(html).toContain('Restart to update');
    // Above Settings, not below it.
    expect(html.indexOf('sb-update-card')).toBeLessThan(html.indexOf('aria-label="Settings"'));
  });

  it('says Updating and offers no second press while it rebuilds', () => {
    const html = draw({ update: { installing: true } });
    expect(html).toContain('Updating');
    expect(html).not.toContain('Restart to update');
    expect(html).not.toMatch(/<button[^>]*>Restart/);
  });

  it('shrinks to an icon button when the sidebar is shut', () => {
    const html = draw({ update: { installing: false }, collapsed: true });
    expect(html).toMatch(/class="sb-update-icon"[^>]*aria-label="Restart to update"|aria-label="Restart to update"[^>]*class="sb-update-icon"/);
    expect(html).not.toMatch(/sb-update-card/);
  });

  it('names what changed when you point at it', () => {
    const html = draw({ update: { installing: false, changes: ['The inbox reads faster', 'Fix sign-in'], behind: 4 } });
    expect(html).toMatch(/title="[^"]*The inbox reads faster[^"]*Fix sign-in[^"]*and 2 more/);
  });

  // HER WORDS ON THE FIRST DRAWING: the red icon "makes me think there's a
  // bug". The accent on this skin is #ee6018. Grey, never the accent.
  it('draws its icon grey, never in the accent colour', () => {
    for (const sel of ['.sb-update-card-title svg', '.workspace-navigation .sb-update-icon']) {
      const color = decls(sel).color;
      expect(color, sel).toBeTruthy();
      expect(color, sel).not.toMatch(/accent/);
    }
  });

  it('carries no other look', () => {
    const src = fs.readFileSync('renderer/src/components/SidebarUpdate.tsx', 'utf8');
    expect(src).not.toMatch(/sb-update-line|sb-update-mark|updateLook/);
    expect(fs.readFileSync('renderer/src/App.tsx', 'utf8')).not.toContain('updateLook');
  });
});

describe('the list of what changed', () => {
  it('lists up to the titles it has and counts the rest', () => {
    expect(changeLines({ changes: ['a', 'b'], behind: 2 })).toEqual(['a', 'b']);
    expect(changeLines({ changes: ['a', 'b'], behind: 9 })).toEqual(['a', 'b', 'and 7 more']);
  });

  it('says nothing for an installed app, which has no titles', () => {
    expect(changeLines({ changes: [], behind: null })).toEqual([]);
    expect(changeLines(null)).toEqual([]);
  });
});
