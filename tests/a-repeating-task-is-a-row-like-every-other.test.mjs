// A REPEATING TASK IS A ROW LIKE EVERY OTHER (w-4189a5c1a0, 2026-10-04).
//
// On the Later tab of the table, a repeating task was drawn under its own
// "Repeating" heading, as a title over a grey line ("not run yet") with a
// "daily" chip, the project and the next run squeezed to the right end. Every
// other row on the page is one line in the table's columns. Reported as hard
// to understand: the column says Thread, then a heading says Repeating, which
// reads as two levels of hierarchy, and the row looks nothing like its
// neighbours.
//
// Measured on the rendered markup before the fix: one `day-label` reading
// "Repeating" inside a `th-table`, zero `th-grid` cells on the rule's row, and
// the chip read "daily" on a rule whose `every` was 'week', because the word
// was written into the markup rather than read off the rule.
//
// Now: no heading in the table; the rule is a table row (title, project,
// priority, and when it next runs in the time column); a repeat mark before
// the title, and its schedule in faint words after it, read off the rule.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List, repeatTag, nextRunWords } from '../renderer/src/components/List.tsx';
globalThis.React = React;

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
// A Sunday evening, so a daily rule next runs tomorrow and a Monday rule too.
const NOW = at(2026, 10, 4, 19, 34);

const rule = (over = {}) => ({
  id: 'r-abc1234567', product: 'video', productName: 'Northwind Video',
  title: 'Check for new video skills', priority: 5,
  every: 'day', at: '09:00', createdAt: at(2026, 10, 1, 9),
  served: '', misses: 0, alerted: 0, ...over,
});
const later = (over = {}) => ({
  id: 'w-1', product: 'personal', productName: 'Personal', status: 'open', title: 'Renew a prescription',
  kind: 'directive', labels: ['founder'], priority: 2, epoch: 0, claim: null,
  createdAt: at(2026, 10, 1, 9), updatedAt: at(2026, 10, 2, 9), runAt: at(2026, 10, 9, 9), ...over,
});

const draw = (props) => renderToStaticMarkup(React.createElement(List, {
  items: [later()], view: 'snoozed', selected: -1, seen: new Set(), running: [], multiSel: new Set(),
  repeats: [rule()], allItems: [], onSelect() {}, onOpen() {}, onToggle() {}, onRange() {},
  table: true, products: [], ...props,
}));
const ruleRow = (html) => html.slice(html.indexOf('data-repeat-id'), html.indexOf('data-item-id'));

describe('in the table, a repeating task is one row in the columns', () => {
  it('draws no Repeating heading above it', () => {
    const html = draw();
    expect(html).not.toMatch(/day-label/);
    expect(html).not.toMatch(/>Repeating</);
  });

  it('fills the same cells as the row beneath it: title, project, priority, when', () => {
    const row = ruleRow(draw());
    expect(row).toMatch(/th-grid/);
    expect(row).toMatch(/th-cell-title[\s\S]*Check for new video skills/);
    expect(row).toMatch(/th-cell-proj[^>]*>Northwind Video</);
    expect(row).toMatch(/th-cell-prio[^>]*>.*Medium/);
    expect(row).toMatch(/th-when[^>]*>Tomorrow</);
  });

  it('carries no grey second line, which no other table row has', () => {
    const row = ruleRow(draw());
    expect(row).not.toMatch(/class="preview"/);
    // What is drawn, not the hover title, which keeps how the last run went.
    const shown = row.slice(row.indexOf('>') + 1).replace(/<[^>]*>/g, ' ');
    expect(shown).not.toMatch(/not run yet/);
    expect(row).toMatch(/title="not run yet"/);
  });

  it('wears the live mark while one of its runs is going, like any running thread', () => {
    const run = later({ id: 'r-abc1234567-20261004', status: 'claimed', runAt: undefined });
    expect(ruleRow(draw({ repeats: [rule({ lastOccurrence: run.id })], allItems: [run] }))).toMatch(/th-st s-running live/);
    expect(ruleRow(draw())).not.toMatch(/th-st/);
  });

  it('draws nothing extra when there are no repeating tasks', () => {
    const html = draw({ repeats: [] });
    expect(html).not.toMatch(/data-repeat-id/);
  });

  it('and never on a tab other than Later', () => {
    expect(draw({ view: 'inbox' })).not.toMatch(/data-repeat-id/);
  });
});

// The tag carries the hour as well as the days. The time column is 96px,
// sized for "7 hours ago", and the first drawing put "Tomorrow 10:00 AM" in it:
// it ran past the right edge of the page. So the column says the day and the
// tag says the rest.
// THE PICK WAS B (2026-10-05): out of a boxed tag after the title, a repeat
// mark before it with the schedule in faint words after it, and a tab of its
// own, the mark won. So no tag: a repeat mark leads the title the way the live
// mark does, and the schedule follows in plain, lower-case, faint words.
describe('the faint words after the title say the rule’s own schedule', () => {
  it('every day', () => expect(repeatTag(rule())).toBe('every day at 9am'));
  it('weekdays', () => expect(repeatTag(rule({ every: 'weekday' }))).toBe('weekdays at 9am'));
  it('one day a week names the day, capitalised as a name', () => {
    expect(repeatTag(rule({ every: 'week', on: 1 }))).toBe('every Monday at 9am');
    expect(repeatTag(rule({ every: 'week', on: 0 }))).toBe('every Sunday at 9am');
  });
  it('keeps the minutes only when there are some', () => {
    expect(repeatTag(rule({ at: '14:30' }))).toBe('every day at 2:30pm');
    expect(repeatTag(rule({ at: '00:00' }))).toBe('every day at 12am');
  });
  it('a weekly rule is never called daily, on the row either', () => {
    const row = ruleRow(draw({ repeats: [rule({ every: 'week', on: 1 })] }));
    expect(row).toMatch(/th-aside[^>]*>every Monday at 9am</);
    expect(row).not.toMatch(/daily|every day/i);
  });
  it('wears the repeat mark before its title and no boxed tag', () => {
    const row = ruleRow(draw());
    expect(row).toMatch(/th-repeat[\s\S]*Check for new video skills/);
    expect(row).not.toMatch(/th-tag/);
  });
  it('a running rule shows the live mark in the repeat mark’s place, not both', () => {
    const run = later({ id: 'r-abc1234567-20261004', status: 'claimed', runAt: undefined });
    const row = ruleRow(draw({ repeats: [rule({ lastOccurrence: run.id })], allItems: [run] }));
    expect(row).toMatch(/th-st s-running live/);
    expect(row).not.toMatch(/th-repeat/);
  });
  it('and the deferred thread beneath it wears no repeat mark', () => {
    const html = draw();
    expect(html.slice(html.indexOf('data-item-id'))).not.toMatch(/th-repeat/);
  });
  it('and the list outside the table no longer prints a hard-coded daily either', () => {
    const html = draw({ table: false, repeats: [rule({ every: 'week', on: 1 })] });
    expect(html).toMatch(/every Monday/);
    expect(html).not.toMatch(/>daily</);
  });
});

describe('which day it next runs, in the time column', () => {
  it('today, before the hour', () => expect(nextRunWords(rule(), at(2026, 10, 4, 8))).toBe('Today'));
  it('tomorrow, just after it', () => expect(nextRunWords(rule(), at(2026, 10, 4, 9, 1))).toBe('Tomorrow'));
  it('a weekday name inside the week', () => expect(nextRunWords(rule({ every: 'week', on: 3 }), NOW)).toBe('Wednesday'));
  it('a date a week or more out', () => expect(nextRunWords(rule({ every: 'week', on: 0 }), NOW)).toBe('Oct 11'));
});
