// A REPEATING TASK'S PAGE SAYS ITS REAL SCHEDULE (w-8b637c7802).
//
// After putting a thread off as "every monday 9am", its page in Later read
// "daily at 9:00 AM · next 9:00 AM monday, nov 9": the words were written as
// "daily" for every rule. Found in the live copy, measured by drawing the page.
import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let RepeatFocus;
beforeAll(async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  ({ RepeatFocus } = await import('../renderer/src/components/RepeatFocus.tsx'));
});
const rule = (extra) => ({ id: 'r-1', product: 'p', productName: 'Frontend', title: 'Estimate the move', body: '', priority: 5, at: '09:00', every: 'week', on: 1, served: '', misses: 0, alerted: 0, createdAt: 1, updatedAt: 1, ...extra });
const draw = (r) => renderToStaticMarkup(React.createElement(RepeatFocus, { rule: r, items: [], editing: false, onClose() {}, onEdit() {}, onEditClose() {}, onSave: async () => {}, onEnd: async () => {} }));

describe('the schedule under its name', () => {
  it('says the day of a weekly task', () => {
    const html = draw(rule());
    expect(html).toContain('Mondays at 9:00am');
    expect(html).not.toContain('daily');
  });
  it('says weekdays for a weekday task', () => {
    expect(draw(rule({ every: 'weekday', on: undefined }))).toContain('weekdays at 9:00am');
  });
  it('still says daily for a daily one', () => {
    expect(draw(rule({ every: 'day', on: undefined }))).toContain('daily at 9:00am');
  });
});
