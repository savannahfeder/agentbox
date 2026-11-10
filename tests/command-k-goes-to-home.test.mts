// ⌘K HAD NO WAY TO HOME (w-1e536d8e6d).
//
// The sidebar has a Home button, but typing "go to" in ⌘K listed Inbox, In
// progress, Groups, Files, Connections and Teammates, and no Home. Measured by
// drawing the palette with every place the sidebar offers: no row said Home.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette } from '../renderer/src/components/Palette';
import { matchesQuery } from '../renderer/src/palette-rows';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const noop = () => {};
const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
  products: [], supervisorPaused: false, look: 'dark', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop,
  onStanding: noop, onSettings: noop, onShortcuts: noop, keyHints: true, onSetKeyHints: noop, onSearch: noop,
  onFirstRun: noop, onTutorial: noop, onImportAgents: noop, onClose: noop,
  onCheckUpdate: noop, onFlipView: noop, findThreads: () => [], ...props,
}));
const rows = (html: string) => [...html.matchAll(/class="palette-label">([^<]+)</g)].map((m) => m[1]);

describe('Go to Home in ⌘K', () => {
  it('is offered where there is a Home page', () => {
    expect(rows(draw({ onHome: noop }))).toContain('Go to Home');
  });

  it('is not offered where there is none, as on a phone', () => {
    expect(rows(draw())).not.toContain('Go to Home');
  });

  it('sits above Go to Inbox, as Home sits above Inbox in the sidebar', () => {
    const labels = rows(draw({ onHome: noop }));
    expect(labels.indexOf('Go to Home')).toBeLessThan(labels.indexOf('Go to Inbox'));
  });

  it('is found by "home" and "go to", and not by another page\'s name', () => {
    const home = { id: 'view-home', label: 'Go to Home' };
    for (const q of ['home', 'go to', 'go to home', 'go home']) expect(matchesQuery(q, home), q).toBe(true);
    expect(matchesQuery('go to files', home)).toBe(false);
  });

  // Go to Inbox answers to "home" too, from before there was a Home page.
  it('is under the return key when "home" is typed', () => {
    expect(rows(draw({ onHome: noop, typed: 'home' }))[0]).toBe('Go to Home');
    expect(rows(draw({ onHome: noop, typed: 'go to' }))[0]).toBe('Go to Home');
  });

  it('opens Home the way the sidebar does, closing ⌘K first', () => {
    expect(app).toMatch(/onHome=\{homeOn \? \(\) => \{ setModal\(null\); goHome\(\); \} : undefined\}/);
  });
});
