// ⌘K SAYS "GO TO" AND REOPENS A DONE TASK (w-8c683db90a).
//
// On a done task, "unmark done" found nothing in ⌘K: the only rows were
// "Mark done" again and "Resume this agent", which also starts a run. The page
// rows were bare names ("Inbox"), read as "move this to Inbox", and picking one
// with a task open changed the list behind the task, so nothing moved on screen.
// Measured in the built renderer on an invented team: ⌘K, "inbox", return left
// the done task in front. "go to" matched nothing.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette } from '../renderer/src/components/Palette';
import { matchesQuery, pageRows, rankMatches, REOPEN_KEYWORDS } from '../renderer/src/palette-rows';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const noop = () => {};
const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
  products: [], supervisorPaused: false, look: 'dark', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop,
  onStanding: noop, onSettings: noop, onShortcuts: noop, keyHints: true, onSetKeyHints: noop, onSearch: noop,
  onFirstRun: noop, onTutorial: noop, onImportAgents: noop, onClose: noop,
  onCheckUpdate: noop, onFlipView: noop, findThreads: () => [], ...props,
}));
const rows = (html) => [...html.matchAll(/class="palette-label">([^<]+)</g)].map((m) => m[1]);

describe('the page rows say Go to', () => {
  it('names every tab on one person\'s inbox', () => {
    expect(pageRows({ team: false }).map((r) => r.label)).toEqual(['Go to Inbox', 'Go to In progress', 'Go to Later', 'Go to Done']);
  });

  it('names only the two pages a team has, since Later and Done are columns of In progress there', () => {
    expect(pageRows({ team: true }).map((r) => r.label)).toEqual(['Go to Inbox', 'Go to In progress']);
    const progress = pageRows({ team: true }).find((r) => r.view === 'progress');
    expect(matchesQuery('later', progress)).toBe(true);
    expect(matchesQuery('done', progress)).toBe(true);
  });

  it('is drawn in ⌘K, and no bare "Inbox" row is left', () => {
    const labels = rows(draw());
    expect(labels).toContain('Go to Inbox');
    expect(labels).not.toContain('Inbox');
    expect(rows(draw({ teamLayout: true }))).not.toContain('Go to Later');
  });

  it('is found by "go to", by the page name, and by the tab\'s own words', () => {
    const inbox = pageRows({ team: true })[0];
    for (const q of ['go to', 'go to inbox', 'inbox', 'needs you']) expect(matchesQuery(q, inbox)).toBe(true);
    expect(matchesQuery('go to settings', inbox)).toBe(false);
  });

  // Measured: "go to" put "Waits on Two logo rounds are ready to compare" under
  // the return key, because "logo" holds "go".
  it('puts the rows whose name starts with what was typed above ones that match inside a word', () => {
    const wait = { id: 'wait-1', label: 'Waits on Two logo rounds are ready to compare' };
    const rowsNow = [wait, ...pageRows({ team: true })];
    const typed = (q) => rankMatches(q, rowsNow.filter((r) => matchesQuery(q, r))).map((r) => r.id);
    expect(typed('go to')).toEqual(['view-inbox', 'view-progress', 'wait-1']);
    expect(typed('waits')).toEqual(['wait-1']);
  });

  it('says Go to on the other places the sidebar opens', () => {
    const labels = rows(draw({ roomsOn: true, onGroups: noop, onConnections: noop, teammates: [], onTeammates: noop }));
    for (const l of ['Go to Groups', 'Go to Connections', 'Go to Teammates']) expect(labels).toContain(l);
    expect(app).toContain("{ id: 'all', title: 'Go to Files'");
  });

  it('leaves the open task, the way the sidebar\'s own Inbox button does', () => {
    expect(app).toMatch(/onView=\{\(v\) => \{ setModal\(null\); openView\(v\); \}\}/);
    expect(app).toMatch(/teamLayout=\{!!teamTabs\}/);
  });
});

describe('a done task can be reopened from ⌘K', () => {
  const reopen = { label: 'Reopen', keywords: REOPEN_KEYWORDS };

  it('is found by the words someone uses for it', () => {
    for (const q of ['reopen', 'unmark done', 'undo done', 'not done', 'mark undone', 'bring back', 'open again']) {
      expect(matchesQuery(q, reopen), q).toBe(true);
    }
  });

  it('does not answer to "inbox", which means going there', () => {
    expect(matchesQuery('inbox', reopen)).toBe(false);
    expect(matchesQuery('go to', reopen)).toBe(false);
  });

  it('stands in for Mark done on a done task, and puts it back with reopenDone', () => {
    expect(app).toMatch(/target\.status === 'done' && !target\.agent\s*\?\s*\{ id: 'reopen', label: 'Reopen', keywords: REOPEN_KEYWORDS, run: \(\) => \{ setModal\(null\); void reopenDone\(target\); \} \}/);
  });
});
