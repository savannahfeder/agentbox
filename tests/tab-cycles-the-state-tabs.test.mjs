// TAB MOVES ALONG THE STATE TABS, AND SHIFT-TAB BACK.
//
// Her words, 2026-10-01: "When I'm on the main inbox screen, hitting Tab would
// cycle through the different states: Needs you, Running, Scheduled, Done,
// All." Tab had been handed to the browser since 2026-09-14, so it walked DOM
// focus around the page and painted a ring on whatever it landed on.
//
// The rotation is the list the tab bar is actually drawing (INBOX_TABS), not a
// second list written out in the key handler: that is the fault this repo has
// already had once, when a Scheduled tab appeared on screen and three presses
// of Tab landed somewhere with no tab under it.
//
// AND IT STILL DOES NOTHING ON AN OPENED TASK, which is pinned next door in
// tab-does-nothing-on-an-open-task.test.mjs. The gate here is the other half of
// that promise: not in a field, no card open, no menu up, list view only,
// because in board view there are no tabs on the screen to move along.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextTab } from '../renderer/src/threads/page-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');

const ORDER = ['inbox', 'progress', 'snoozed', 'done', 'all'];

describe('the rotation Tab takes', () => {
  it('moves right one tab at a time', () => {
    expect(nextTab(ORDER, 'inbox')).toBe('progress');
    expect(nextTab(ORDER, 'progress')).toBe('snoozed');
    expect(nextTab(ORDER, 'snoozed')).toBe('done');
    expect(nextTab(ORDER, 'done')).toBe('all');
  });

  it('wraps round at the right end rather than stopping', () => {
    expect(nextTab(ORDER, 'all')).toBe('inbox');
  });

  it('moves left on shift, and wraps at the left end', () => {
    expect(nextTab(ORDER, 'progress', true)).toBe('inbox');
    expect(nextTab(ORDER, 'inbox', true)).toBe('all');
  });

  // A tab the bar is not drawing is not a place Tab may land. If the view is
  // somewhere the rotation does not know, the first tab is the honest answer.
  it('lands on the first tab from somewhere that is not in the list', () => {
    expect(nextTab(ORDER, 'nowhere')).toBe('inbox');
    expect(nextTab([], 'inbox')).toBe('inbox');
  });
});

describe('the key handler', () => {
  it('reads the rotation off the tabs the bar draws', () => {
    // One list. INBOX_TABS is what StateTabs maps over.
    expect(app).toMatch(/import \{[^}]*INBOX_TABS[^}]*\} from '\.\/threads\/Pages'/);
    expect(app).toContain("nextTab(stateTabOrder, view, e.shiftKey)");
  });

  it('only answers Tab where the tabs are on the screen and nothing is over them', () => {
    const gate = app.slice(app.indexOf("if (e.key === 'Tab')"), app.indexOf("if (e.key === 'Tab')") + 900);
    // Not in a field, no card open, no menu or modal up, no full screen, and
    // the list view, because board view draws no tabs.
    for (const part of ['!inInput', '!modal', '!focused', '!inFullScreen', "inboxDisplay.view === 'list'"]) {
      expect(gate).toContain(part);
    }
    // Built, not left alone: the browser's own focus walk is prevented.
    expect(gate).toContain('e.preventDefault()');
  });
});
