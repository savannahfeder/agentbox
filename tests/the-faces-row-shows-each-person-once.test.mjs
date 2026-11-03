// THE FACES ROW SHOWS EACH PERSON ONCE.
//
// The faces at the end of the Needs you line read "SO, DE MA,
// DE, MA": Dev and Maya twice each. Measured on screen with three people on a
// team: the Team chat, which has no faces of its own, was drawn wearing the
// faces of everyone else on the team (members.ts, `teamFaces` fell back to
// the people), and those same people then had cards of their own beside it.
//
// The Team chat now wears the team's mark, so each face on the row is one person.
import { it, expect, describe } from 'vitest';
import { buildMembers } from '../renderer/src/team/everything/members.ts';
import { faceRow } from '../renderer/src/team/everything/place.ts';

const person = (id, name) => ({ id, name, email: `${id}@x`, avatarUrl: null });
const chat = (key, name, extra = {}) => ({ key, name, faces: [], last: '', at: 0, unread: false, ...extra });
const BASE = {
  me: { id: 'p-so', name: 'Sofia Reyes', avatarUrl: null },
  people: [person('p-so', 'Sofia Reyes'), person('p-dev', 'Dev Patel'), person('p-maya', 'Maya Costa')],
  chats: [chat('room:r-team', 'Lumen')],
  teamRoomId: 'r-team',
};
// Every face a row draws, by name: a card's own, and each face a chat wears.
const facesOn = (row) => row.flatMap((m) => (m.kind === 'chat' ? (m.faces ?? []).map((f) => f.name) : m.kind === 'me' ? ['Sofia Reyes'] : m.kind === 'person' ? [m.name] : []));

describe('the faces row', () => {
  it('draws each person once', () => {
    const names = facesOn(faceRow(buildMembers(BASE)));
    expect(names.sort()).toEqual(['Dev Patel', 'Maya Costa', 'Sofia Reyes']);
  });
  it('still has the Team chat, wearing the team\'s mark rather than its people', () => {
    const team = faceRow(buildMembers(BASE)).find((m) => m.team);
    expect(team).toMatchObject({ kind: 'chat', name: 'Team' });
    expect(team.faces).toEqual([]);
  });
  it('a team chat with a picture of its own keeps it', () => {
    const own = [{ name: 'Lumen', url: 'https://x/lumen.png' }];
    const team = faceRow(buildMembers({ ...BASE, chats: [chat('room:r-team', 'Lumen', { faces: own })] })).find((m) => m.team);
    expect(team.faces).toEqual(own);
  });
  it('draws a person once even when the team list names them twice', () => {
    const names = facesOn(faceRow(buildMembers({ ...BASE, people: [...BASE.people, person('p-dev', 'Dev Patel')] })));
    expect(names.filter((n) => n === 'Dev Patel')).toHaveLength(1);
  });
});
