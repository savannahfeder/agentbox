// A PROFILE'S CHART SHOWS A VALUE ONLY WHERE YOU POINT (w-88e1e23325, 2026-10-21).
//
// Testing multiplayer, a person's page read "Now 0.5 agent hours" in a box with
// a shadow over the chart, with nothing under the pointer: "this graph just kind
// of sticks". The box was drawn always, so it looked like a hover stuck open and
// pointing anywhere else changed nothing. With hours in one month only, the
// chart was one dot and no line. And nothing said what the numbers covered:
// "is this my activity today, right now, or whatever?"
//
// Measured on the built app with a made-up room: the stuck box, the lone dot,
// and labels "In Northwind" and "On Agentbox" with no time in them.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HoursChart, ProfilePage, chartSeries, pointUnder, pointWords } from '../renderer/src/team/rooms/RoomPerson.tsx';
globalThis.React = React;

const OCT = Date.parse('2026-10-21T12:00:00');
const months = (pairs) => pairs.map(([month, hours]) => ({ month, hours }));

describe('the line', () => {
  it('starts from nothing the month before the first hours, as the cloud sends them', () => {
    const s = chartSeries(months([['2026-08', 0], ['2026-09', 0], ['2026-10', 0.5]]), 0.5, OCT);
    expect(s).toEqual({ months: ['2026-09', '2026-10'], pts: [0, 0.5] });
  });
  it('one month of hours and nothing before it is still a line, not a dot', () => {
    expect(chartSeries(months([['2026-10', 0.5]]), 0.5, OCT)).toEqual({ months: ['2026-09', '2026-10'], pts: [0, 0.5] });
    expect(chartSeries(months([['2026-01', 2]]), 2, OCT).months).toEqual(['2025-12', '2026-01']);
  });
  it('no hours at all is a flat line ending this month', () => {
    expect(chartSeries([], 0, OCT)).toEqual({ months: ['2026-09', '2026-10'], pts: [0, 0] });
  });
  it('hours from before the months it was sent start the line above zero', () => {
    expect(chartSeries(months([['2026-09', 10], ['2026-10', 5]]), 40, OCT)).toEqual({ months: ['2026-09', '2026-10'], pts: [35, 40] });
  });
  it('adds up month by month', () => {
    expect(chartSeries(months([['2026-07', 0], ['2026-08', 4], ['2026-09', 6], ['2026-10', 2]]), 12, OCT).pts).toEqual([0, 4, 10, 12]);
  });
});

describe('pointing at it', () => {
  it('picks the month nearest the pointer', () => {
    // 900 wide, the plot from 44 to 880: four months sit at 44, 323, 601, 880.
    expect(pointUnder(52 / 900, 4)).toBe(0);
    expect(pointUnder(330 / 900, 4)).toBe(1);
    expect(pointUnder(470 / 900, 4)).toBe(2);
    expect(pointUnder(880 / 900, 4)).toBe(3);
  });
  it('past either end, the end', () => {
    expect(pointUnder(0, 4)).toBe(0);
    expect(pointUnder(1, 4)).toBe(3);
    expect(pointUnder(-0.2, 2)).toBe(0);
  });
  it('says when each point is', () => {
    expect(pointWords('2026-10', true)).toBe('Now');
    expect(pointWords('2026-09', false)).toBe('End of September');
  });
});

describe('drawn', () => {
  const chart = renderToStaticMarkup(React.createElement(HoursChart, { byMonth: months([['2026-09', 0], ['2026-10', 0.5]]), total: 0.5 }));
  it('no box over the chart until something is pointed at', () => {
    expect(chart).not.toContain('rm-pop');
    expect(chart).not.toContain('class="tip');
  });
  it('nothing is written on the line itself', () => {
    expect(chart).not.toContain('agent hours<');
  });
  it('one month of hours draws a line', () => {
    const one = renderToStaticMarkup(React.createElement(HoursChart, { byMonth: months([['2026-10', 0.5]]), total: 0.5 }));
    expect(one).toMatch(/class="ln" d="M[\d.]+ [\d.]+ L/);
  });
});

describe('every number on the page says what it covers', () => {
  const card = { id: 'maya', me: false, name: 'Maya C.', avatarUrl: null, headline: null, bio: null, agents: 1, level: 5, hoursTotal: 0.5, hoursWeek: 0.5, hoursToday: 0.2, streak: 1, byMonth: months([['2026-10', 0.5]]), teammate: false, showActivity: true, status: null, workingOn: null, workingPrivate: false };
  const room = { id: 'r1', name: 'Astral', wall: [card] };
  const html = renderToStaticMarkup(React.createElement(ProfilePage, { card, room, rooms: [room], cards: [], rank: 2, onRanks: () => {} }));
  it('the rank in the room is this week, the rank on the app all time', () => {
    expect(html).toContain('In Astral this week');
    expect(html).toContain('On Agentbox all time');
  });
  // The label floating over the chart read as "a little weird" (2026-10-21);
  // option A of five was picked: the total above the chart, and since when.
  it('the total sits above the chart, with when it started', () => {
    expect(html).not.toContain('Agent hours, all time');
    expect(html).toMatch(/class="rm-ptotal"><b>0\.5<\/b><span class="rm-label">Agent hours since October 2026</);
  });
});
