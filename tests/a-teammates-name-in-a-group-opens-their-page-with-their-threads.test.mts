// A TEAMMATE'S NAME IN A GROUP OPENS THEIR PAGE, WITH THEIR THREADS (synthetic team round 3, 2026-11-20).
//
// Two testers pressed a teammate's name in the group's "Your team" panel (and
// in the panel beside a direct chat) and got the room profile: ranks, days in
// a row, agent hours, and none of their threads, which that page keeps out on
// purpose for people outside your team. The teammate's own page, Team > their
// name, has their chat and their In progress and Done this week, so a tester
// found "two different Theo pages". Measured on where a press goes: a
// teammate opens their page; you and anyone outside your team still open the
// profile.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { personOpens } from '../renderer/src/team/rooms/room-rules.ts';

const card = (o: { me?: boolean; teammate?: boolean; away?: boolean } = {}) => ({ me: false, teammate: true, ...o });

describe('a press on a person in the panel', () => {
  it('opens a teammate’s page', () => {
    expect(personOpens(card())).toBe('page');
  });
  it('opens a teammate’s page before they have turned on groups', () => {
    expect(personOpens(card({ away: true }))).toBe('page');
  });
  it('opens your own profile, where your bio is', () => {
    expect(personOpens(card({ me: true, teammate: false }))).toBe('profile');
  });
  it('opens the profile of someone outside your team', () => {
    expect(personOpens(card({ teammate: false }))).toBe('profile');
  });
});

describe('wired in', () => {
  const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('the group’s panel and a direct chat’s panel both go by it', () => {
    expect(hook.match(/<PeoplePanel [^\n]*onPerson=\{\(id\) => openPerson\(/g)).toHaveLength(2);
    expect(hook).toMatch(/personOpens\(c\) === 'page' && onTeammate\) \{ onTeammate\(id\); return; \}/);
  });
  it('the app opens the teammate’s page the People list opens', () => {
    expect(app).toContain('onTeammate: (id) => pickMember(`person:${id}`),');
  });
});
