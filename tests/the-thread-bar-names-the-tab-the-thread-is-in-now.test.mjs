// THE BAR NAMED THE TAB THE THREAD HAD LEFT (F-80, QA batch 004, 2026-10-26).
//
// How it was measured: a task filed from the composer moves the inbox to In
// progress, so the thread opened from there. It finished while it was open and
// landed in Needs you. The bar still read "‹ IN PROGRESS", with the position
// counted off the Needs you list ("9 OF 14"), and In progress said "Nothing is
// running." Back went to that empty tab.
//
// The bar reads the thread's own state now, so it names where the thread IS,
// and the Back button lands there. A thread in no tab at all (a stray, a
// teammate's card) keeps the page you are standing on, which is what the bar
// always did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { crumbTab, tabOfState } from '../renderer/src/threads/page-rules.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('which tab the bar names', () => {
  it('names Needs you for a thread that is waiting, whatever tab you came from', () => {
    expect(crumbTab('waiting', 'progress')).toBe('inbox');
    expect(crumbTab('waiting', 'done')).toBe('inbox');
  });
  it('names In progress while it runs, and Later and Done where those hold it', () => {
    expect(crumbTab('running', 'inbox')).toBe('progress');
    expect(crumbTab('scheduled', 'inbox')).toBe('snoozed');
    expect(crumbTab('done', 'inbox')).toBe('done');
  });
  it('leaves the page you are standing on when the thread is in no tab', () => {
    expect(crumbTab(null, 'progress')).toBe('progress');
    expect(crumbTab(null, 'inbox')).toBe('inbox');
  });
  it('is the tabs\' own rule, so the bar and the row can never disagree', () => {
    for (const state of ['waiting', 'running', 'scheduled', 'done']) {
      expect(crumbTab(state, 'done')).toBe(tabOfState(state));
    }
  });
});

describe('the app hands the bar that tab, and Back goes to it', () => {
  it('works the tab out from the thread rather than from the view', () => {
    expect(app).toMatch(/const crumbTabNow = focused \? crumbTab\(stateOfMine\(focused\), view\) : view;/);
    expect(app).toMatch(/crumbFrom=\{[^}]*INBOX_TABS\.find\(\(t\) => t\.view === crumbTabNow\)/s);
  });
  it('closes the thread onto the tab the bar named', () => {
    expect(app).toMatch(/onClose=\{closeThreadOntoItsTab\}/);
    expect(app).toMatch(/const closeThreadOntoItsTab = \(\) => \{[^}]*setView\(crumbTabNow\)/s);
  });
});
