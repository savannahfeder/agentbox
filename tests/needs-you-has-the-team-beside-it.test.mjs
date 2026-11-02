// NEEDS YOU HAS THE TEAM BESIDE IT.
//
// The owner, 2026-11-02, pinning the panel beside Needs you in an earlier
// picture (You, Team, People, AI teammates, Groups, each with how they are):
// "I actually found that to be very well thought out so I still don't see a
// reason why that was removed", and "a very large portion of people will still
// want messages from their team to be accessible and easily visible". It had
// been folded into a row of small faces at the end of the tab line after "three
// panels is a bit too much" was read as being about it. The panel is back on
// Needs you and In progress; the row of faces stays for Today and Tasks and
// for a window too narrow for the panel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMembers } from '../renderer/src/team/everything/members.ts';
import { railSections } from '../renderer/src/team/everything/place.ts';
import { NeedsRail } from '../renderer/src/team/everything/TeamStrip.tsx';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const person = (id, name) => ({ id, name, email: `${id}@x`, avatarUrl: null });
const chat = (key, name, extra = {}) => ({ key, name, faces: [], last: '', at: 0, unread: false, ...extra });
const BASE = {
  me: { id: 'p-ma', name: 'Maya Costa', avatarUrl: null },
  people: [person('p-ma', 'Maya Costa'), person('p-dev', 'Dev Patel'), person('p-so', 'Sofia Reyes')],
  chats: [chat('room:r-team', 'Lumen'), chat('room:r-cow', 'Coworking', { open: true })],
  teamRoomId: 'r-team',
};

describe('the panel beside Needs you', () => {
  it('reads you and the team, then People, AI teammates and Groups', () => {
    const s = railSections(buildMembers(BASE));
    expect(s.map((x) => x.label)).toEqual([null, 'People', 'Groups']);
    expect(s[0].rows.map((m) => m.kind === 'me' ? 'me' : m.name)).toEqual(['me', 'Team']);
    expect(s[1].rows.map((m) => m.name)).toEqual(['Dev Patel', 'Sofia Reyes']);
    expect(s[2].rows.map((m) => m.name)).toEqual(['Coworking']);
  });

  it('is nothing for someone alone', () => {
    expect(railSections(buildMembers({ ...BASE, people: [person('p-ma', 'Maya Costa')], chats: [] }))).toEqual([]);
  });

  it('says who waits on you, and opens their place when pressed', () => {
    const members = buildMembers(BASE);
    const dev = members.find((m) => m.name === 'Dev Patel');
    const html = renderToStaticMarkup(React.createElement(NeedsRail, { members, picked: null, waits: new Map([[dev.key, 1]]), onPick: () => {} }));
    expect(html).toContain('aria-label="Your team"');
    expect(html).toMatch(/Dev Patel[\s\S]*Waiting on you/);
    expect(html).toContain('>People<');
    expect(html).toContain('>Groups<');
  });

  it('offers a new AI teammate under AI teammates when it can', () => {
    const html = renderToStaticMarkup(React.createElement(NeedsRail, { members: buildMembers(BASE), picked: null, waits: new Map(), onPick: () => {}, onAdd: () => {} }));
    expect(html).toMatch(/>AI teammates<[\s\S]*New teammate/);
  });

  it('sits beside the Needs you list, with the faces row only where it is not', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/<NeedsRail /);
    expect(app).toMatch(/className=\{railShown \? 'nr-home' : undefined\}/);
    expect(read('renderer/src/team/everything/everything.css')).toMatch(/@media \(min-width: 1100px\) \{ \.ev-faces\.nr-narrow-only \{ display: none; \} \}/);
  });
});
