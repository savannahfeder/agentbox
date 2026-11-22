// COMMAND K IN THE WALKTHROUGH IS SHORT, AND CENTRED ON THE APP (w-9687db6270, 2026-11-22).
//
// The founder, at the walkthrough's last step: "the Command-K menu is not
// centered right now. Also the way it's organized and structured here doesn't
// look good." It was centred on the window, 140px left of the app's middle,
// because the app stands in from the walkthrough's column; and its first rows
// were New project…, Filter…, Projects…, "Rank Practice first, not ranked yet".
// Somebody's first ⌘K now lists the four things they can do there, with
// everything else a word away.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette } from '../renderer/src/components/Palette';
import { matchesQuery } from '../renderer/src/palette-rows';

const css = fs.readFileSync(new URL('../renderer/src/components/tour-frame.css', import.meta.url), 'utf8');
const noop = () => {};
const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
  products: [{ slug: 'ws', name: 'My Workspace', personal: true }, { slug: 'practice', name: 'Practice' }] as never, supervisorPaused: false, look: 'dark', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop, onOpenProjects: noop, onHome: noop,
  onStanding: noop, onSettings: noop, onShortcuts: noop, keyHints: true, onSetKeyHints: noop, onSearch: noop,
  onFirstRun: noop, onTutorial: noop, onImportAgents: noop, onClose: noop, onCheckUpdate: noop, onFlipView: noop, findThreads: () => [], ...props,
}));
const rows = (html: string) => [...html.matchAll(/class="palette-label">([^<]+)</g)].map((m) => m[1]);

describe('⌘K during the walkthrough', () => {
  const walking = rows(draw({ onEndTutorial: noop }));
  it('lists a handful of things to do, with the way out of the walkthrough last', () => {
    expect(walking[0]).toBe('New thread');
    expect(walking).toContain('Go to Home');
    expect(walking).toContain('Go to Inbox');
    expect(walking.at(-1)).toBe('Skip walkthrough');
    expect(walking.length).toBeLessThanOrEqual(6);
  });
  it('leaves out ranking, filters and projects, which mean nothing yet', () => {
    expect(walking.some((w) => /Rank|Filter|Projects…|New project|Cloud/.test(w))).toBe(false);
  });
  it('still finds them by typing', () => {
    expect(matchesQuery('new project', { label: 'New project…', unlisted: true })).toBe(true);
  });
});

describe('⌘K any other time', () => {
  it('is as it was: new project first', () => {
    const usual = rows(draw());
    expect(usual[0]).toBe('New project…');
    expect(usual).toContain('Filter…');
  });
});

describe('a dialog over the walkthrough', () => {
  it('is centred on the app, not the window, and keeps to its card', () => {
    const rule = css.match(/:root\[data-tour-frame\] \.modal-backdrop \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('left: calc(var(--tf-w) + 12px)');
    expect(rule).toContain('right: 12px');
    expect(rule).toContain('border-radius: 14px');
  });
});
