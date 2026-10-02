// PROJECTS AND THEIR PRIORITY ARE ONE PAGE, AND THE PROJECT MENU POINTS AT IT.
//
// What broke: the only way to set which project the agents work on first was
// dragging chips inside the old composer's project menu. The threads composer
// replaced that menu with a plain list, so on the running build there was no
// way to reorder at all, and even before, most people never found the drag.
// Measured by reading the threads build: `setProductOrder` was reachable only
// from the old composer (first-run walk only) and the ⌘K "Rank X first" rows.
//
// The fix, after two rounds with the founder: Settings > Projects is the
// running order. A numbered list you can drag or nudge with buttons, where a
// press on a row opens that project's page to rename it or change its rules.
// It used to be two pages, Priority and All projects; she merged them ("Those
// should be one thing, and it should be called projects"). A "Reorder" link in
// the composer's project menu and a ⌘K row both open it.

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

// A PROJECT WITHOUT A PICTURE WEARS ITS COLOUR, NEVER THE SUNBURST. The burst
// was the default mark, and it is also what the Agentbox brand looked like, so
// every project in Settings wore the app's logo. Her call on the first draw of
// this page: never show that logo, and use the composer's project colours here.
describe('the mark beside a project', () => {
  const mark = read('renderer/src/components/ProductMark.tsx');
  const settings = read('renderer/src/components/Settings.tsx');
  const page = read('renderer/src/components/ProjectsPage.tsx');

  it('draws the project colour, from the one swatch rule the composer uses', () => {
    expect(mark).toMatch(/projectSwatch\(/);
    expect(mark).not.toMatch(/RAYS/);
    expect(mark).not.toMatch(/<line\b/);
  });

  it('is handed the slug everywhere a project is listed, so the colour matches the composer', () => {
    for (const src of [settings, page]) {
      const marks = src.match(/<ProductMark\b[^>]*>/g) ?? [];
      expect(marks.length).toBeGreaterThan(0);
      for (const m of marks) expect(m).toMatch(/slug=\{/);
    }
  });

  it('the sidebar corner shows the Agentbox icon when there is no team, and the team initial when there is', () => {
    const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
    expect(nav).toMatch(/team\?\.team\?\.name\s*\?\s*<span className="th-mark"/);
    expect(nav).toMatch(/<AppMark size=\{20\} \/>/);
  });

  it('the first-run screens show the Agentbox mark, not a project mark', () => {
    for (const f of ['renderer/src/components/Onboarding.tsx', 'renderer/src/components/ModeScreen.tsx']) {
      expect(read(f)).not.toMatch(/<ProductMark name=\{NAME\}/);
      expect(read(f)).toMatch(/<AppMark\b/);
    }
  });
});

describe('the ways in', () => {
  const settings = read('renderer/src/components/Settings.tsx');
  const composer = read('renderer/src/threads/ThreadComposer.tsx');
  const palette = read('renderer/src/components/Palette.tsx');
  const app = read('renderer/src/App.tsx');

  // ONE PAGE, CALLED PROJECTS. There was a Priority row beside All projects for
  // a round; she merged them.
  it('Settings has one Projects row, and no separate Priority page', () => {
    expect(settings).toMatch(/<span className="set-nav-label">Projects<\/span>/);
    expect(settings).not.toMatch(/set-nav-label">Priority</);
    expect(settings).not.toMatch(/>All projects</);
    expect(settings).not.toMatch(/setPane\('priority'\)/);
    expect(settings).toMatch(/<ProjectsPage\b[\s\S]{0,200}onSetOrder=\{onSetOrder\}/);
  });

  it('an old ?settings=priority link lands on Projects', () => {
    expect(settings).toMatch(/if \(want === 'priority'\) return 'projects';/);
  });

  it('the order and the way into each project are the same rows', () => {
    const page = read('renderer/src/components/ProjectsPage.tsx');
    // A press that does not travel opens the project; one that does, moves it.
    expect(page).toMatch(/if \(!travelled\) \{ onOpen\(slug\); return; \}/);
    expect(page).toMatch(/commit\(slug, placeBefore\(full, slug/);
    // Enter opens it from the keyboard too.
    expect(page).toMatch(/e\.key === 'Enter'[^\n]*onOpen\(p\.slug\)/);
  });

  it('the composer project menu says it is in priority order and links to the page', () => {
    expect(composer).toMatch(/By priority/);
    expect(composer).toMatch(/onReorderProjects/);
    expect(composer).toMatch(/>Reorder</);
  });

  it('⌘K has a Projects row that priority finds', () => {
    expect(palette).toMatch(/label: 'Projects…'/);
    expect(palette).toMatch(/keywords: 'priority order/);
  });

  it('the app opens Settings on Projects from both, and saves through setProductOrder', () => {
    expect(app).toMatch(/onReorderProjects=\{[^\n]*setSettingsPane\('projects'\)/);
    expect(app).toMatch(/onProjects=\{[^\n]*setSettingsPane\('projects'\)/);
    expect(app).not.toMatch(/setSettingsPane\('priority'\)/);
    expect(app).toMatch(/onSetOrder=\{/);
  });
});
