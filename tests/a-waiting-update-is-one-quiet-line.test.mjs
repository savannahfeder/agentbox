// A WAITING UPDATE IS ONE QUIET LINE IN THE SIDEBAR'S FOOT (w-23fa810982, 2026-10-02).
//
// The update was a bordered card: a title ("New version ready"), a sentence
// ("Restarting takes about a minute.") and a full-width button, four lines and
// a box in the sidebar. Changes land several times a day, so the card was up
// most of the day, and the ask was for it to be condensed into something that
// does not pull at you to restart. Measured before this change: the open
// sidebar drew a `sb-update-card` with a <p> and a bordered button, about 110px
// tall, above the foot list.
//
// Now it is one row in the foot list beside Invite, Instructions and Settings:
// the same height as they are, a grey icon and grey words, no border. What the
// card used to say (how long it takes, what changed, why the last try failed)
// is still there when you point at it.

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

/** The update's own markup, from its opening tag to the end of its button. */
const updateMarkup = (html) => {
  const at = html.indexOf('sb-update');
  if (at < 0) return '';
  const start = html.lastIndexOf('<', at);
  return html.slice(start, html.indexOf('</button>', start) + '</button>'.length);
};

describe('a waiting update, sidebar open', () => {
  it('is no card any more: no title line, no sentence, no box', () => {
    const html = draw({ update: { installing: false } });
    expect(html).not.toMatch(/sb-update-card/);
    expect(html).not.toContain('New version ready');
    expect(html).not.toContain('Restarting takes about a minute.</p>');
  });

  it('is one button that says Restart to update', () => {
    const one = updateMarkup(draw({ update: { installing: false } }));
    expect(one).toMatch(/^<button[^>]*class="sb-update-row"/);
    expect(one).toContain('<span>Restart to update</span>');
    expect(one.match(/<button/g)).toHaveLength(1);
    expect(one).not.toMatch(/<p[ >]/);
  });

  it('sits in the foot list with Settings, above the rows that are always there', () => {
    const html = draw({ update: { installing: false }, onInstructions() {} });
    const foot = html.indexOf('th-side-foot');
    const row = html.indexOf('sb-update-row');
    expect(foot).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(foot);
    expect(row).toBeLessThan(html.indexOf('aria-label="Instructions"'));
    expect(row).toBeLessThan(html.indexOf('aria-label="Settings"'));
  });

  it('keeps what the card said for when you point at it', () => {
    const one = updateMarkup(draw({ update: { installing: false, changes: ['The inbox reads faster'], behind: 3 } }));
    expect(one).toMatch(/title="[^"]*about a minute[^"]*The inbox reads faster[^"]*and 2 more/);
  });

  it('carries a failed try in the same line, and the press still tries again', () => {
    const one = updateMarkup(draw({ update: { installing: false, error: 'The new code would not build: boom' } }));
    expect(one).toContain('would not build: boom');
    expect(one).toContain('Restart to update');
    expect(one).not.toMatch(/disabled/);
  });

  it('says Updating and cannot be pressed twice while it rebuilds', () => {
    const one = updateMarkup(draw({ update: { installing: true } }));
    expect(one).toContain('<span>Updating</span>');
    expect(one).not.toContain('Restart to update');
    expect(one).toMatch(/disabled=""/);
  });
});

describe('a waiting update, sidebar shut', () => {
  it('is the same button, its words hidden by the shut sidebar like every other row', () => {
    const one = updateMarkup(draw({ update: { installing: false }, collapsed: true }));
    expect(one).toMatch(/class="sb-update-row"/);
    expect(one).toMatch(/aria-label="Restart to update"/);
  });

  it('draws nothing when there is no update, open or shut', () => {
    expect(draw({ update: null })).not.toMatch(/sb-update/);
    expect(draw({ update: null, collapsed: true })).not.toMatch(/sb-update/);
  });
});

describe('how quiet it is', () => {
  const row = decls('.workspace-navigation .sb-update-row');

  it('has no border, the thing that made the card stand out', () => {
    expect(row.border ?? 'none').toMatch(/none|0/);
    expect(row['border-color']).toBeUndefined();
  });

  it('is grey, never the accent and never full-strength text', () => {
    expect(row.color).toBe('var(--text-faint)');
    expect(decls('.workspace-navigation .sb-update-row svg').color ?? row.color).not.toMatch(/accent/);
  });

  it('leaves no card styles behind', () => {
    expect(fs.readFileSync('renderer/src/threads/pages.css', 'utf8')).not.toMatch(/sb-update-card/);
  });
});

// Carried over from a-waiting-update-shows-in-the-sidebar (w-7a39dace23), which
// tested the card this replaced.
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
