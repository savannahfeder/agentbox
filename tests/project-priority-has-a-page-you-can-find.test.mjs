// PROJECT PRIORITY HAS A PAGE YOU CAN FIND, AND THE PROJECT MENU POINTS AT IT.
//
// What broke: the only way to set which project the agents work on first was
// dragging chips inside the old composer's project menu. The threads composer
// replaced that menu with a plain list, so on the running build there was no
// way to reorder at all, and even before, most people never found the drag.
// Measured by reading the threads build: `setProductOrder` was reachable only
// from the old composer (first-run walk only) and the ⌘K "Rank X first" rows.
//
// The fix: a "Project priority" page in Settings, a numbered list you can drag
// or nudge with buttons, a "Reorder" link in the composer's project menu that
// opens it, and a ⌘K row that does the same.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { priorityList, placeBefore, nudge, landingRow } = await import('../renderer/src/project-priority.ts');

const p = (slug, extra = {}) => ({ slug, name: slug.toUpperCase(), ...extra });
const ranked = [
  p('alpha'),
  p('dm-maya', { team: { direct: true } }),
  p('beta'),
  p('practice', { practice: true }),
  p('gamma'),
];

describe('which projects the page lists', () => {
  it('keeps the running order and leaves out conversations and the practice project', () => {
    expect(priorityList(ranked).map((x) => x.slug)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('lists nothing when there is nothing', () => {
    expect(priorityList([])).toEqual([]);
  });
});

describe('dropping a project before another', () => {
  const full = ranked.map((x) => x.slug);

  it('moves it in the full order, so rows the page does not show keep their place', () => {
    expect(placeBefore(full, 'gamma', 'alpha')).toEqual(['gamma', 'alpha', 'dm-maya', 'beta', 'practice']);
  });

  it('null means the end of the list', () => {
    expect(placeBefore(full, 'alpha', null)).toEqual(['dm-maya', 'beta', 'practice', 'gamma', 'alpha']);
  });

  it('dropping a project before itself changes nothing', () => {
    expect(placeBefore(full, 'beta', 'beta')).toBeNull();
  });

  it('a slug that is not in the order joins it, which is how a new project gets ranked', () => {
    expect(placeBefore(['a', 'b'], 'new', 'b')).toEqual(['a', 'new', 'b']);
  });
});

describe('the up and down buttons', () => {
  const full = ranked.map((x) => x.slug);
  const shown = ['alpha', 'beta', 'gamma'];

  it('up swaps with the row above as shown, stepping over hidden rows', () => {
    expect(nudge(full, shown, 'beta', -1)).toEqual(['beta', 'alpha', 'dm-maya', 'practice', 'gamma']);
  });

  it('down swaps with the row below as shown', () => {
    expect(nudge(full, shown, 'alpha', 1)).toEqual(['dm-maya', 'beta', 'alpha', 'practice', 'gamma']);
  });

  it('the top row cannot go up and the bottom row cannot go down', () => {
    expect(nudge(full, shown, 'alpha', -1)).toBeNull();
    expect(nudge(full, shown, 'gamma', 1)).toBeNull();
  });
});

describe('where a dragged row lands, in one column', () => {
  const rects = [
    { top: 0, bottom: 40 },
    { top: 40, bottom: 80 },
    { top: 80, bottom: 120 },
  ];
  it('above the middle of the first row is the top', () => {
    expect(landingRow(rects, -10)).toBe(0);
    expect(landingRow(rects, 19)).toBe(0);
  });
  it('past the middle of a row is below it', () => {
    expect(landingRow(rects, 21)).toBe(1);
    expect(landingRow(rects, 61)).toBe(2);
  });
  it('below the last row is the end', () => {
    expect(landingRow(rects, 101)).toBe(3);
    expect(landingRow(rects, 500)).toBe(3);
  });
});

describe('the ways in', () => {
  const settings = read('renderer/src/components/Settings.tsx');
  const composer = read('renderer/src/threads/ThreadComposer.tsx');
  const palette = read('renderer/src/components/Palette.tsx');
  const app = read('renderer/src/App.tsx');

  it('Settings has a Priority row under Projects that opens the page', () => {
    expect(settings).toMatch(/onClick=\{\(\) => setPane\('priority'\)\}/);
    expect(settings).toMatch(/<span className="set-nav-label">Priority<\/span>/);
    expect(settings).toMatch(/<ProjectPriority\b/);
    // The Priority row comes before All projects in the nav.
    expect(settings.indexOf("setPane('priority')")).toBeLessThan(settings.indexOf('>All projects<'));
  });

  it('?settings=priority opens it, like every other page name', () => {
    expect(settings).toMatch(/want === 'priority'\) return want/);
  });

  it('the composer project menu says it is in priority order and links to the page', () => {
    expect(composer).toMatch(/By priority/);
    expect(composer).toMatch(/onReorderProjects/);
    expect(composer).toMatch(/>Reorder</);
  });

  it('⌘K has a row for it', () => {
    expect(palette).toMatch(/label: 'Project priority…'/);
  });

  it('the app opens Settings on that page from both, and saves through setProductOrder', () => {
    expect(app).toMatch(/onReorderProjects=\{/);
    expect(app).toMatch(/setSettingsPane\('priority'\)/);
    expect(app).toMatch(/onSetOrder=\{/);
  });
});
