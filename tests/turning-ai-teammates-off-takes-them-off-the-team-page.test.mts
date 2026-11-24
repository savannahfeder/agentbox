// A power tester (w-db46e3fcfd) turned AI teammates off in Settings while on a
// teammate's page and went back: the page was blank, and the Team list still
// had its AI teammates section with New teammate in it, and the Standup its
// "AI teammates post too" switch. Off, those go, and a page left on a teammate
// that is gone opens the Standup instead.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatsColumn, ChatsContext } from '../renderer/src/teammates/ChatsColumn.tsx';
import { placeWithoutGoneMate } from '../renderer/src/teammates/mate-place.ts';
import { StandupPage } from '../renderer/src/team/StandupPage.tsx';

const base = { teammates: [], groups: [], now: 1, onTeammate() {}, onNew() {}, onGroup() {}, onTeam() {} };
const drawn = (value) => renderToStaticMarkup(createElement(ChatsContext.Provider, { value }, createElement(ChatsColumn, { current: null })));

describe('the Team list', () => {
  it('offers New teammate under AI teammates while they are on', () => {
    const html = drawn({ ...base, matesOn: true });
    expect(html).toContain('AI teammates');
    expect(html).toContain('New teammate');
  });

  it('has no AI teammates section while they are off, and keeps the Standup', () => {
    const html = drawn({ ...base, matesOn: false });
    expect(html).not.toContain('AI teammates');
    expect(html).not.toContain('New teammate');
    expect(html).toContain('Standup');
  });
});

describe('a page left on a teammate', () => {
  it('opens the Standup once that teammate is gone or teammates are off', () => {
    expect(placeWithoutGoneMate('mate:t-aaaaaaaaaa', [])).toBe('team');
    expect(placeWithoutGoneMate('mate:t-aaaaaaaaaa', ['t-bbbbbbbbbb'])).toBe('team');
  });

  it('stays where it is while the teammate is there, before the list has loaded, or on any other page', () => {
    expect(placeWithoutGoneMate('mate:t-aaaaaaaaaa', ['t-aaaaaaaaaa'])).toBe('mate:t-aaaaaaaaaa');
    expect(placeWithoutGoneMate('mate:t-aaaaaaaaaa', null)).toBe('mate:t-aaaaaaaaaa');
    expect(placeWithoutGoneMate('person:p-1', [])).toBe('person:p-1');
    expect(placeWithoutGoneMate(null, [])).toBe(null);
  });
});

describe('the Standup', () => {
  const standup = (matesOn) => renderToStaticMarkup(createElement(StandupPage, { now: new Date(2026, 10, 24, 15).getTime(), faces: new Map(), dayFor: () => ({ people: [] }), onOpen() {}, matesOn }));

  it('offers "AI teammates post too" only while they are on', () => {
    expect(standup(true)).toContain('AI teammates post too');
    expect(standup(false)).not.toContain('AI teammates post too');
  });
});
