// AN EMPTY TAB THAT IS ONLY EMPTY BECAUSE OF A FILTER HAS TO SAY SO.
//
// Reported 2026-10-01: the page drew "Nothing needs you" over a tab that still
// read 13, because a filter had emptied it. Somebody who has forgotten a filter
// is on reads that as an empty inbox when there is a pile of work behind it.
//
// Two things were wrong at once and both are fixed here.
//
//   THE PAGE LIED. "Nothing needs you" is a statement about the inbox, and the
//   page said it about a filter. It is now kept for an inbox that is really
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
import { filteredEmptyWords, keeps } from '../renderer/src/threads/page-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const pages = src('threads', 'Pages.tsx');

describe('what a filtered empty tab says', () => {
  // THE HEADING IS THE GOOD HALF AND THE NUMBER IS A LINE UNDER IT. The first
  // cut put the whole of it in the heading, 18 point and alone on the page, and
  // she read it as a telling-off: "This feels almost like a punishment in terms
  // of the harsh text." One screen covers two moments, a filter left on by
  // accident and a filter you just finished, and from here they look the same.
  // So the heading says the half that is true and welcome in both.
  it('leads with the half that is good news, in the shape of "Nothing needs you"', () => {
    expect(filteredEmptyWords('inbox', 13).head).toBe('Nothing in your filter needs you');
  });

  it('keeps the whole number, quietly, in a second line', () => {
    expect(filteredEmptyWords('inbox', 13).line).toBe('13 more threads are behind your filters.');
  });

  it('names every tab in its heading, and never claims the inbox itself is clear', () => {
    expect(filteredEmptyWords('progress', 10).head).toBe('Nothing in your filter is running');
    expect(filteredEmptyWords('snoozed', 3).head).toBe('Nothing in your filter is scheduled');
    expect(filteredEmptyWords('done', 11).head).toBe('Nothing in your filter is closed');
    expect(filteredEmptyWords('all', 26).head).toBe('No threads match your filter');
    for (const tab of ['inbox', 'progress', 'snoozed', 'done', 'all']) {
      expect(filteredEmptyWords(tab, 9).head).not.toBe('Nothing needs you');
    }
  });

  it('counts one thread as a thread rather than as "1 more threads"', () => {
    expect(filteredEmptyWords('inbox', 1).line).toBe('One more thread is behind your filters.');
  });

  it('carries no em dash, which is the one punctuation mark she rejects', () => {
    for (const tab of ['inbox', 'progress', 'snoozed', 'done', 'all']) {
      const { head, line } = filteredEmptyWords(tab, 4);
      expect(head + line).not.toContain('—');
    }
  });
});

describe('the component that draws it', () => {
  const block = pages.slice(pages.indexOf('export function FilteredEmpty'), pages.indexOf('export function TableHead'));

  it('exists, and offers the one button that undoes it', () => {
    expect(pages).toContain('export function FilteredEmpty');
    expect(block).toContain('filteredEmptyWords(');
    expect(block).toContain('Clear filters');
    expect(block).toContain('onClear');
  });

  it('reads as the inbox-zero screen next door, not as a warning', () => {
    // Same three parts and the same class as InboxClear: a heading, a quiet
    // line, then the action. Plus the one small reward she asked for, which is
    // a tick and not an animation: "It shouldn't be visually super
    // stimulating, but it could be nicer than this."
    expect(block).toContain('className="th-clear th-clear-filtered"');
    expect(block).toContain('<ClearMark />');
    expect(block).toContain('<h2>{head}</h2>');
    expect(block).toContain('<p>{line}</p>');
    expect(block.indexOf('<h2>')).toBeLessThan(block.indexOf('<p>'));
    expect(pages).toContain('const ClearMark =');
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
