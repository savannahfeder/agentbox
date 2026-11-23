// ⌘K TAKES THE WEBSITE'S LOOK AND KEEPS ITS OWN PICK (w-391bc4efbe, 2026-10-26).
//
// The website's ⌘K picture had a magnifier and an Esc key on the input, a
// small icon on every row and the keys in a footer (the footer went again on
// 2026-11-21); the app's box had none of
// them (measured on a capture of the built app). "There is a Command K bar in
// this component that I feel looks better than our current Command K bar."
// The selected row stays the app's own, pinned in
// the-card-corners-stand-outside-and-command-k-marks-its-pick.
//
// A first round also carried three more things from the website, and the
// founder took them out: the typed letters underlined ("maybe you don't need
// to highlight the exact words that match"), a "This thread" line naming the
// thread ("I don't know what this thread line is"), and "Every word filters,
// in any order" in the footer ("doesn't really add much"). Enter says Select,
// not Run.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette } from '../renderer/src/components/Palette';
import { ICONS, iconFor, PLAIN_ICON } from '../renderer/src/palette-glyphs.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const noop = () => {};

const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
  products: [], supervisorPaused: false, look: 'dark', order: [],
  onSetLook: noop, onOpenFilter: noop, onClearFilter: noop, onView: noop, onPause: noop, onResume: noop,
  onRankFirst: noop, onNewProject: noop, onNewThread: noop, onStanding: noop, onSettings: noop,
  onShortcuts: noop, keyHints: false, onSetKeyHints: noop,
  onSearch: noop, onFirstRun: noop, onTutorial: noop, onImportAgents: noop,
  onClose: noop, ...props,
}));
const overAThread = { itemCommands: [{ id: 'reply', label: 'Reply', keyHint: 'R', run: noop }] };

describe('the box', () => {
  it('carries the magnifier and the Esc key on its input', () => {
    const html = draw();
    expect(html).toContain('class="palette-query"');
    expect(html).toMatch(/<button type="button" class="palette-esc"[^>]*>esc<\/button>/);
  });

  // The footer of keys went on 2026-11-21 (tests/the-command-bar-draws-line-icons-like-the-menus).
  it('has no footer of keys', () => {
    expect(draw()).not.toContain('palette-foot');
  });

  // The cases that must NOT come back.
  it('no longer says every word filters', () => {
    expect(draw(overAThread)).not.toMatch(/every word filters/i);
  });

  it('draws no heading over the rows, with a thread or without', () => {
    expect(draw(overAThread)).not.toContain('palette-head');
    expect(draw(overAThread)).not.toMatch(/This thread|Anywhere/);
    expect(draw()).not.toContain('palette-head');
  });

  it('marks no letters in a row', () => {
    const src = read('renderer/src/components/Palette.tsx');
    expect(src).not.toContain('<mark');
    expect(read('renderer/src/styles.css')).not.toContain('.palette-mark');
  });

  it('gives every row an icon', () => {
    const html = draw(overAThread);
    const rows = html.match(/class="palette-item[^"]*"/g) ?? [];
    const glyphs = html.match(/class="palette-glyph"/g) ?? [];
    expect(rows.length).toBeGreaterThan(10);
    expect(glyphs.length).toBe(rows.length);
  });

  // New project is row one by a product decision (tests/her-word-is-project),
  // and the thread's rows still follow New thread.
  it('keeps the rows in the order they were', () => {
    const labels = [...draw(overAThread).matchAll(/<span class="palette-label">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(labels.slice(0, 3)).toEqual(['New project…', 'New thread', 'Reply']);
  });
});

describe('every row has an icon of its own', () => {
  // Every fixed id the palette is built from, read out of the files that build it.
  const fixed = (file) => [...read(file).matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);
  const app = read('renderer/src/App.tsx');
  const itemBlock = app.slice(app.indexOf('itemCommands={(() => {'), app.indexOf('filtering={isFiltering(boxFilter)}'));
  const ids = new Set([
    ...fixed('renderer/src/components/Palette.tsx'),
    ...fixed('renderer/src/thread-commands.ts'),
    ...fixed('renderer/src/run-now.ts'),
    ...[...itemBlock.matchAll(/id: ?'([a-z-]+)'/g)].map((m) => m[1]),
    // The ids built from a name, one of each shape.
    'rank-site', 'move-site', 'model-opus', 'group-design', 'teammate-t1', 'teammate-pause-t1',
    'cloud-toggle', 'cloud-mac', 'cloud-full', 'cloud-all', 'route-agent', 'route-me', 'route-back',
    'priority-urgent', 'priority-high', 'priority-medium', 'priority-low',
    'theme-light', 'theme-dark', 'theme-match',
  ]);

  it('finds the rows it is checking', () => {
    for (const id of ['new-project', 'approve', 'reply', 'stop', 'pin', 'run-now', 'settings']) expect(ids).toContain(id);
  });

  it('draws one for each of them', () => {
    const bare = [...ids].filter((id) => iconFor({ id, label: '' }) === PLAIN_ICON);
    expect(bare).toEqual([]);
  });

  it('draws each as a line drawing, not a character', () => {
    for (const id of ids) expect(ICONS[iconFor({ id, label: '' })].length).toBeGreaterThan(0);
  });

  it('pauses with one icon and unpauses with another', () => {
    expect(iconFor({ id: 'pause', label: 'Pause agents' })).not.toBe(iconFor({ id: 'pause', label: 'Unpause agents' }));
  });

  // The boundary: an id nobody has drawn yet still gets the plain icon, not a gap.
  it('falls back to the plain icon for an id it does not know', () => {
    expect(iconFor({ id: 'something-new', label: 'Something new' })).toBe(PLAIN_ICON);
    expect(ICONS[PLAIN_ICON].length).toBeGreaterThan(0);
  });
});
