// A FILE ONLY SOME TEAMMATES MAY SEE OPENS NO LIVE ROOM.
//
// The relay lets in anyone on the team, and a room is named after the team,
// the project's name and the file's name. The 2026-11-10 security audit had a
// teammate left out of a project shared with chosen people work out a room's
// name, read the open file from the relay and have their edits saved into the
// owner's copy. Until the relay checks who may see a project, only a file the
// whole team may read gets a room.
import { describe, expect, it } from 'vitest';
import { liveForTheWholeTeam } from '../main/team/live-room.mts';

const project = (seenBy: string | undefined, extra: Record<string, unknown> = {}) =>
  ({ name: 'Launch', team: { projectId: 'proj-1' }, ...(seenBy ? { seenBy } : {}), ...extra });

describe('a project of your own', () => {
  it('opens a room when the whole team sees it', () => {
    expect(liveForTheWholeTeam({ mine: project('team'), cards: [], named: 'Launch' })).toBe(true);
    expect(liveForTheWholeTeam({ mine: project(undefined), cards: [], named: 'Launch' })).toBe(true);
  });

  it('opens none when only chosen people see it, or nobody else', () => {
    expect(liveForTheWholeTeam({ mine: project('people', { seenByPeople: ['p-ben'] }), cards: [], named: 'Launch' })).toBe(false);
    expect(liveForTheWholeTeam({ mine: project('private'), cards: [], named: 'Launch' })).toBe(false);
    expect(liveForTheWholeTeam({ mine: { name: 'Launch' }, cards: [], named: 'Launch' })).toBe(false);
  });
});

describe('a teammate\'s project, known from its cards', () => {
  it('opens a room when a card for it reaches the whole team', () => {
    expect(liveForTheWholeTeam({ mine: null, cards: [{ project: 'launch', people: null }], named: 'Launch' })).toBe(true);
  });

  it('opens none when its cards reach chosen people, or there is no card for it', () => {
    expect(liveForTheWholeTeam({ mine: null, cards: [{ project: 'Launch', people: ['p-ben'] }], named: 'Launch' })).toBe(false);
    expect(liveForTheWholeTeam({ mine: null, cards: [{ project: 'Hiring', people: null }], named: 'Launch' })).toBe(false);
  });

  // Weekly audit, 2026-11-16: a room is named by the project's name, so a
  // team-wide card of another project called Launch, or one thread marked
  // Team inside it, opened the room for the chosen-people one.
  it('opens none when any project of that name is shared with chosen people, whatever else shares the name', () => {
    expect(liveForTheWholeTeam({ mine: null, cards: [{ project: 'Launch', people: ['p-ben'] }, { project: 'launch ', people: null }], named: 'Launch' })).toBe(false);
    expect(liveForTheWholeTeam({ mine: null, cards: [{ project: 'Launch', people: null }, { project: 'Launch', people: ['p-ben'] }], named: 'Launch' })).toBe(false);
    expect(liveForTheWholeTeam({ mine: null, cards: [{ project: 'Launch', people: null }, { project: 'Launch 2', people: ['p-ben'] }], named: 'Launch' })).toBe(true);
  });
});
