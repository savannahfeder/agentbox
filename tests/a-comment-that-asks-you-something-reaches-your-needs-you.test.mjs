// A COMMENT THAT ASKS YOU SOMETHING BY NAME REACHES YOUR NEEDS YOU.
//
// At 8:27pm Sofia replied under her own note on the investor deck,
// "Maya, can you give me the Lumen mark as an SVG for this slide?". Maya found it
// by chance at 2:55am, six and a half hours later, though she had cleared Needs
// you twice; an @mention on the same deck reached her at once. Measured on
// fileNewsFor: a note counted as naming you only through its picked mentions,
// and a reply only reached people who had already spoken on that comment.
// Now one that opens on your name, or asks a question with your name in it,
// is "named you" news, the same as an @mention.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileNewsFor, marksOf } from '../shared/artifact-marks.mjs';
import { groupFileRow } from '../shared/room-needs-you.mjs';

const FILE = 'october-investor-deck.pdf';
const note = (text, extra = {}) => ({ do: 'note', id: 'n1', file: FILE, place: { kind: 'whole' }, text, by: 'sofia', ts: 10, owner: 'sofia', ...extra });
const reply = (text, extra = {}) => ({ do: 'reply', id: 'r1', on: 'n1', file: FILE, text, by: 'sofia', ts: 20, ...extra });
const news = (entries, me = 'maya', myName = 'Maya Chen') => fileNewsFor({ artifacts: marksOf(entries), createdBy: 'sofia' }, me, { myName });

describe('a reply under someone else’s comment', () => {
  it('Sofia’s question to Maya reaches her, as naming her', () => {
    const out = news([note('Slide 1 needs the mark'), reply('Maya, can you give me the Lumen mark as an SVG for this slide?')]);
    expect(out.map((n) => n.kind)).toEqual(['named']);
  });
  it('a question with her name anywhere in it', () => {
    expect(news([note('Slide 1'), reply('Does Maya have the SVG?')])).toHaveLength(1);
  });
  it('an @ to her', () => {
    expect(news([note('Slide 1'), reply('@Maya the SVG please')])).toHaveLength(1);
  });
});

describe('a note itself', () => {
  it('that opens on her name reaches her though nobody picked her from the list', () => {
    expect(news([note('Maya, is 42 right?')]).map((n) => n.kind)).toEqual(['named']);
  });
});

describe('what does not reach her', () => {
  it('her name said in passing, without asking her anything', () => {
    expect(news([note('Slide 1'), reply("Maya's numbers are in now.")])).toHaveLength(0);
  });
  it('a name that only starts like hers', () => {
    expect(news([note('Slide 1'), reply('Mayan red for the rule?')])).toHaveLength(0);
  });
  it('a question that does not name her, on a comment she never spoke on', () => {
    expect(news([note('Slide 1'), reply('Can someone send the SVG?')])).toHaveLength(0);
  });
  it('her own words', () => {
    expect(news([note('Slide 1', { by: 'maya' }), reply('Maya, note to self?', { by: 'maya' })], 'maya')).toHaveLength(0);
  });
  it('a copy that does not know her name reads it as before', () => {
    expect(news([note('Slide 1'), reply('Maya, can you send it?')], 'maya', null)).toHaveLength(0);
  });
});

it('in a group, the row says she was named', () => {
  const marks = [
    { id: 'm1', by: 'sofia', at: 10, mark: { do: 'note', id: 'n1', file: FILE, place: { kind: 'whole' }, text: 'Slide 1', owner: 'sofia' } },
    { id: 'm2', by: 'sofia', at: 20, mark: { do: 'reply', id: 'r1', on: 'n1', file: FILE, text: 'Maya, can you send the SVG?' } },
  ];
  expect(groupFileRow({ roomId: 'r', roomName: 'Lumen', marks, me: 'maya', myName: 'Maya Chen', nameOf: (id) => id })?.body).toBe(`named you on ${FILE}: Maya, can you send the SVG?`);
});

it('every Needs you door passes your name', () => {
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  expect(read('renderer/src/App.tsx')).toMatch(/fileNewsFor\(i, team\?\.me \?\? null, \{ myName \}\)/);
  expect(read('main/team/rooms.mjs')).toMatch(/groupFileRow\(\{[^}]*myName/);
  expect(read('main/team/thread-share.mjs')).toMatch(/createdBy: owner \}, me, \{ myName: myName\(\) \}\)/);
});
