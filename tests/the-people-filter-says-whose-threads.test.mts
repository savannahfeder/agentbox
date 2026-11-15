// WHOSE THREADS ARE ON THE PAGE IS ONE FILTER WITH A WORD IN IT, NOT A ROW OF FACES.
//
// The tab bar ended in up to four face chips plus a "+N", which is five things
// to read at the end of a row whose job is to be quiet, and which say nothing
// at a glance that one phrase does not say better. Reviewed on 2026-10-01 and
// rejected as cluttered, so the chips became a single filter reading Everyone,
// Just you, You and Maya, or You and 2 others.
//
// The word has to be right in every shape the picked list comes in: nobody but
// you, you and one other, you and several, somebody else's threads without your
// own, a person with no name, somebody who has left the team since the list was
// written, and a team of one where no filter is drawn at all.
import { describe, it, expect } from 'vitest';
import { whoseWord } from '../renderer/src/threads/people-rules.ts';

const me = { id: 'p-me', name: 'Sam Rivera', email: 'sam@example.test' };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test' };
const theo = { id: 'p-theo', name: 'Theo Park', email: 'theo@example.test' };
const jun = { id: 'p-jun', name: '', email: 'jun@example.test' };
const team = [me, maya, theo, jun];

describe('what the people filter says', () => {
  it('says Everyone when nobody is filtered out', () => {
    expect(whoseWord(team, team.map((p) => p.id), me.id)).toBe('Everyone');
  });

  it('says Just you when the page is your own inbox', () => {
    expect(whoseWord(team, [me.id], me.id)).toBe('Just you');
  });

  it('names the one teammate, by first name, so the button stays short', () => {
    expect(whoseWord(team, [me.id, maya.id], me.id)).toBe('You and Maya');
  });

  it('counts them once there is more than one, rather than listing them', () => {
    expect(whoseWord(team, [me.id, maya.id, theo.id], me.id)).toBe('You and 2 others');
  });

  it('leaves you out of the word when your own threads are not on the page', () => {
    expect(whoseWord(team, [maya.id], me.id)).toBe('Maya');
    expect(whoseWord(team, [maya.id, theo.id], me.id)).toBe('2 people');
  });

  it('falls back to the part of the email before the @ when a person has no name', () => {
    expect(whoseWord(team, [me.id, jun.id], me.id)).toBe('You and jun');
  });

  it('is never Everyone on a team of one, which draws no filter at all', () => {
    expect(whoseWord([me], [me.id], me.id)).toBe('Just you');
  });

  it('ignores anyone who has left the team since the picked list was written', () => {
    expect(whoseWord([me, maya], [me.id, maya.id, 'p-gone'], me.id)).toBe('Everyone');
  });
});
