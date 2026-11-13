// THE STANDUP PAGE DRAWS DAYS, POSTS, LINKS AND ITS SETTINGS (2026-11-13).
//
// The founder approved a Standup that reads like a standup channel, with every
// task a link "like in the messages", a way to see other days, and asked where
// its schedule is set. Measured by drawing the page from a made-up day.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StandupPage } from '../renderer/src/team/StandupPage.tsx';
import type { TodayPerson } from '../renderer/src/team/today.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
// Thursday 12 November 2026, 3pm.
const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const line = (key: string, title: string) => ({ key, title, at: NOW - 3_600_000 });
const person = (o: Partial<TodayPerson>): TodayPerson => ({ key: 'me', name: 'You', kind: 'me', finished: [], shipped: [], decided: [], blocked: [], waitingOnYou: [], working: [], waiting: [], tasks: [], privateDone: 0, ...o });
const day = {
  people: [
    person({ shipped: [line('a', 'Invoice email')], working: [line('b', 'Billing page')] }),
    person({ key: 'person:p-maya', name: 'Maya Chen', kind: 'person', finished: [line('c', 'Refund copy')], blocked: [{ ...line('d', 'Stripe keys'), on: 'you' }] }),
  ],
};
const html = renderToStaticMarkup(React.createElement(StandupPage, { now: NOW, faces: new Map(), dayFor: () => day, onOpen: () => {}, onPerson: () => {} }));

describe('the Standup page', () => {
  it('opens on today, by name and date', () => {
    expect(html).toContain('<h2>Thursday</h2>');
    expect(html).toContain('12 November');
  });
  it('has a week of days to pick from, today picked and tomorrow not yet pickable', () => {
    expect(html).toMatch(/aria-selected="true"[^>]*class="su-day on"[^>]*>Thu 12</);
    expect(html).toMatch(/disabled=""[^>]*>Fri 13</);
    expect(html).toContain('aria-label="The week before"');
  });
  it('draws the days before today under it, and leaves out one where nothing moved', () => {
    expect(html).toContain('Wednesday 11 November');
    expect(html).toContain('Tuesday 10 November');
    const quiet = renderToStaticMarkup(React.createElement(StandupPage, { now: NOW, faces: new Map(), dayFor: (w) => (w.to === NOW ? day : { people: [] }), onOpen: () => {} }));
    expect(quiet).not.toContain('Wednesday 11 November');
    expect(quiet.match(/Nothing moved\./g)).toBeNull();
  });
  it('each teammate posts a sentence whose tasks are links', () => {
    expect(html).toMatch(/Shipped <button type="button" class="su-link">Invoice email<\/button>\. Working on <button type="button" class="su-link">Billing page<\/button>\./);
  });
  it('what someone needs from you is its own line', () => {
    expect(html).toMatch(/Needs you on <button type="button" class="su-link">Stripe keys<\/button>/);
  });
  it('can be searched and set up from the page', () => {
    expect(html).toContain('placeholder="Search standups"');
    expect(html).toContain('aria-label="Standup settings"');
    expect(html).toContain('AI teammates post too');
  });
  it('its settings set the days and the time, and the switch over the posts says whether AI teammates post', () => {
    const page = read('renderer/src/team/StandupPage.tsx');
    expect(page).toContain('<span className="su-set-l">Days</span>');
    expect(page).toContain('<span className="su-set-l">Time</span>');
    // Said once: a second control for the same thing inside the settings was taken out.
    expect(page).not.toContain('Count as yours');
    expect(html).toMatch(/role="switch" aria-checked="true"[^>]*><i><\/i>AI teammates post too/);
  });
});
