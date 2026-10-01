// AN EMPTY TAB THAT IS ONLY EMPTY BECAUSE OF A FILTER HAS TO SAY SO.
//
// Her report, 2026-10-01, with a screenshot: "It says Nothing needs you, but
// that's not correct because it literally says needs you 13... if you're
// accidentally on a filter, you can think there's no work for you when there's
// actually a ton."
//
// Two things were wrong at once and both are fixed here.
//
//   THE PAGE LIED. "Nothing needs you" is a statement about her inbox, and the
//   page said it about her filter. It is now kept for an inbox that is really
//   clear; a filter that has emptied the tab says what it is hiding and offers
//   one button to undo it.
//
//   THE COUNT DISAGREED WITH THE LIST UNDER IT. The tab said 13 while the page
//   said nothing. A tab's number is a promise about what clicking it shows, so
//   it now counts what the filters show. The number she is missing is not lost:
//   the whole of it is in the sentence, in the one place she is already
//   looking, and the Display menu's foot still reads "Showing 4 of 7".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenWords, keeps } from '../renderer/src/threads/page-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const pages = src('threads', 'Pages.tsx');

describe('what a filtered empty tab says', () => {
  it('names the tab and the whole number hidden, in her own words', () => {
    expect(hiddenWords('inbox', 13)).toBe('Your filters hide all 13 threads that need you.');
  });

  it('says it for every tab, never "Nothing needs you"', () => {
    expect(hiddenWords('progress', 10)).toBe('Your filters hide all 10 threads in progress.');
    expect(hiddenWords('snoozed', 3)).toBe('Your filters hide all 3 scheduled threads.');
    expect(hiddenWords('done', 11)).toBe('Your filters hide all 11 threads you closed.');
    expect(hiddenWords('all', 26)).toBe('Your filters hide all 26 of your threads.');
  });

  it('counts one thread as a thread rather than as "all 1"', () => {
    expect(hiddenWords('inbox', 1)).toBe('Your filters hide the one thread that needs you.');
    expect(hiddenWords('snoozed', 1)).toBe('Your filters hide the one scheduled thread.');
  });

  it('carries no em dash, which is the one punctuation mark she rejects', () => {
    for (const tab of ['inbox', 'progress', 'snoozed', 'done', 'all']) {
      expect(hiddenWords(tab, 4)).not.toContain('—');
    }
  });
});

describe('the component that draws it', () => {
  const block = pages.slice(pages.indexOf('export function FilteredEmpty'), pages.indexOf('export function TableHead'));

  it('exists, and offers the one button that undoes it', () => {
    expect(pages).toContain('export function FilteredEmpty');
    expect(block).toContain('hiddenWords(');
    expect(block).toContain('Clear filters');
    expect(block).toContain('onClear');
  });

  it('is what an emptied tab draws, above the unfiltered empty states', () => {
    // The order matters: the filtered test is read FIRST, so a filter can
    // never fall through to "Nothing needs you".
    const branch = app.slice(app.indexOf('{workspaceNavigation && emptyView'), app.indexOf('{workspaceNavigation && emptyView') + 1400);
    expect(branch).toContain('<FilteredEmpty');
    expect(branch.indexOf('<FilteredEmpty')).toBeLessThan(branch.indexOf('<InboxClear'));
    expect(branch).toContain('hiddenNow');
  });

  it('leaves "Nothing needs you" for an inbox that really is clear', () => {
    expect(pages).toContain('<h2>Nothing needs you</h2>');
  });
});

describe('the tab numbers', () => {
  it('count what the filters show, so the number matches the list under it', () => {
    const counts = app.slice(app.indexOf('counts={{'), app.indexOf('counts={{') + 600);
    for (const tab of ['inbox', 'progress', 'snoozed', 'done', 'allOpen']) {
      expect(counts).toContain(`shownCount(${tab})`);
    }
  });

  it('counts a teammate\'s rows through the same filters as her own', () => {
    // It read DEFAULT_DISPLAY.inbox, so a filter emptied her half of a tab and
    // left their half counted in full.
    const theirs = app.slice(app.indexOf('const theirCount'), app.indexOf('const theirCount') + 400);
    expect(theirs).toContain('display: inboxDisplay');
    expect(theirs).not.toContain('DEFAULT_DISPLAY.inbox');
  });

  it('still never hides the two rows the app makes itself', () => {
    // A broken session or a waiting update belongs to no project, so no filter
    // may take it out of the count any more than out of the list.
    const trouble = { id: 'w-trouble', product: '', priority: 5, updatedAt: Date.now() };
    expect(keeps(trouble, { view: 'list', sort: 'priority', priorities: ['urgent'], projects: ['northwind'], updated: 'any' }, Date.now())).toBe(false);
    const counts = app.slice(app.indexOf('const shownCount'), app.indexOf('const shownCount') + 300);
    expect(counts).toContain('isTroubleRow(i) || isUpdateRow(i)');
  });
});
