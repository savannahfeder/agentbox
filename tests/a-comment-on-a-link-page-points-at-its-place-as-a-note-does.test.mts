// A comment on a shared file's page could only be words about the whole file,
// while a note in the app pins a moment in a film, a spot on its frame or a
// spot on a picture ("much worse in shared than actually in agentbox",
// 2026-11-10). renderer/src/shared-file/link-notes.ts gives the link page the
// app's places: the numbers on pins, the marks on a film's timeline, the
// words on each comment and where the one being written goes.
import { describe, it, expect } from 'vitest';
import { draftWords, filmMarks, filmPins, picturePins, pinNumbers, placeLabel, placeToSend, quoteOf } from '../renderer/src/shared-file/link-notes.ts';

const film = [
  { id: 'a', place: { kind: 'time', s: 24 } },
  { id: 'b', place: { kind: 'time', s: 31.5, x: 0.4, y: 0.6 } },
  { id: 'c' },
  { id: 'd', place: { kind: 'time', s: 48, x: 0.1, y: 0.2 } },
] as const;

describe('on a film', () => {
  it('every moment is a mark on the timeline, and the chosen one is lit', () => {
    expect(filmMarks(film, 'b')).toEqual([
      { id: 'a', s: 24, on: false, pin: false },
      { id: 'b', s: 31.5, on: true, pin: true },
      { id: 'd', s: 48, on: false, pin: true },
    ]);
  });
  it('a moment with a spot is a pin on its frame, numbered in order', () => {
    expect(filmPins(film, null).map((p) => [p.id, p.label, p.s, p.x, p.y])).toEqual([['b', '1', 31.5, 0.4, 0.6], ['d', '2', 48, 0.1, 0.2]]);
  });
  it('each comment says its place in the app\'s words, and nothing for the whole film', () => {
    const n = pinNumbers(film);
    expect(film.map((c) => placeLabel(c, n))).toEqual(['0:24', 'Pin 1 at 0:31', null, 'Pin 2 at 0:48']);
  });
  it('the comment being written goes on the moment showing, unless taken off it or pinned', () => {
    expect(placeToSend('film', null, 12.34, false)).toEqual({ kind: 'time', s: 12.3 });
    expect(placeToSend('film', null, 12.34, true)).toBeNull();
    expect(placeToSend('film', { kind: 'time', s: 5, x: 0.5, y: 0.5 }, 12, false)).toEqual({ kind: 'time', s: 5, x: 0.5, y: 0.5 });
    expect(draftWords('film', { kind: 'time', s: 72 })).toBe('At 1:12');
    expect(draftWords('film', { kind: 'time', s: 5, x: 0.5, y: 0.5 })).toBe('Pin at 0:05');
    expect(draftWords('film', null)).toBe('On the whole film');
  });
});

describe('on a picture', () => {
  it('a spot is a numbered pin, and nothing goes on a spot nobody picked', () => {
    const pic = [{ id: 'p', place: { kind: 'pin', x: 0.2, y: 0.3 } }, { id: 'q' }] as const;
    expect(picturePins(pic, 'p').map((p) => [p.label, p.on])).toEqual([['1', true]]);
    expect(placeLabel(pic[0], pinNumbers(pic))).toBe('Pin 1');
    expect(placeToSend('picture', null, 0, false)).toBeNull();
    expect(draftWords('picture', null)).toBe('Click the picture to pin a spot');
  });
});

describe('in a document', () => {
  it('words picked become a quote, cut to 500 characters, and a stray click is no quote', () => {
    expect(quoteOf('  ship on\n Tuesday ')).toEqual({ kind: 'quote', text: 'ship on Tuesday' });
    expect(quoteOf('x')).toBeNull();
    expect((quoteOf('a'.repeat(900)) as { text: string }).text).toHaveLength(500);
    expect(draftWords('words', { kind: 'quote', text: 'ship on Tuesday' })).toBe('On “ship on Tuesday”');
    expect(draftWords('words', null)).toBe('Select words to comment on them');
  });
});
