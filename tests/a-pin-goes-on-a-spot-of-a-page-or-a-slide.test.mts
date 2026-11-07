// A PIN GOES ON A SPOT OF A PAGE OR A SLIDE, THE WAY IT DOES ON A PICTURE.
//
// Sofia, asked what would still send her back to Figma and
// Frame.io: "Pin on a page or a slide. Pages and decks take whole-file or
// per-slide comments only." On the deck she "clicked the headline: nothing
// happened, no pin, no chip"; on seat-picker-demo.html her comment was labelled
// "Whole file". Measured in the code: a page place had only a slide number,
// cleanMark dropped anything else, and the page and deck stages took no click.
// Now a slide or a page of a PDF takes a spot as well as its number, an html
// page takes a pin like a picture while Pin a spot is on, and both are
// numbered, drawn, and read out to the agent like picture pins.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cleanMark, marksOf, notesForTheAgent, placeWords } from '../shared/artifact-marks.mts';
import { notePlaceWords, pagePins, pinned } from '../renderer/src/artifact-pins.ts';

const note = (id, place, over = {}) => ({ do: 'note', id, file: 'deck.pdf', place, text: `about ${id}`, by: 'sofia', ts: Number(id.slice(1)) || 1, ...over });

describe('what is kept of a spot on a slide', () => {
  it('its number, its word and the spot', () => {
    expect(cleanMark(note('n1', { kind: 'page', n: 2, word: 'Slide', x: 0.4, y: 0.3 })).place).toEqual({ kind: 'page', n: 2, word: 'Slide', x: 0.4, y: 0.3 });
  });
  it('a slide with no spot stays a whole-slide comment', () => {
    expect(cleanMark(note('n1', { kind: 'page', n: 2, word: 'Slide' })).place).toEqual({ kind: 'page', n: 2, word: 'Slide' });
  });
  it('a spot off the slide is dropped, not the comment', () => {
    expect(cleanMark(note('n1', { kind: 'page', n: 2, x: 1.4, y: 0.3 })).place).toEqual({ kind: 'page', n: 2 });
  });
});

describe('numbers and words', () => {
  const marks = marksOf([
    note('n1', { kind: 'page', n: 1, word: 'Slide' }),
    note('n2', { kind: 'page', n: 2, word: 'Slide', x: 0.4, y: 0.3 }),
    note('n3', { kind: 'page', n: 3, word: 'Slide', x: 0.1, y: 0.9 }),
  ]);
  it('a spot on a slide is a numbered pin; a whole-slide comment is not', () => {
    expect(marks.notes.map((n) => n.pin)).toEqual([undefined, 1, 2]);
  });
  it('says which pin on which slide', () => {
    expect(placeWords(marks.notes[1])).toBe('Pin 1 on Slide 2');
    expect(placeWords(marks.notes[0])).toBe('Slide 1');
    expect(placeWords({ place: { kind: 'page', n: 4, x: 0.5, y: 0.5 }, pin: 3 })).toBe('Pin 3 on Page 4');
  });
  it('a carried pin keeps its version in its words', () => {
    expect(notePlaceWords({ ...marks.notes[1], from: 'v1' })).toBe('Pin v1·1 on Slide 2');
  });
  it('the agent is told the pin, the slide and where on it', () => {
    const { text } = notesForTheAgent(marks, { id: 'deck.pdf', path: 'deck.pdf', name: 'deck.pdf' }, 1);
    expect(text).toContain('- Pin 1 on Slide 2, 40% across and 30% down: about n2');
    expect(text).toContain('- Slide 1: about n1');
  });
});

describe('which pins a slide wears', () => {
  const marks = marksOf([
    note('n1', { kind: 'page', n: 2, word: 'Slide' }),
    note('n2', { kind: 'page', n: 2, word: 'Slide', x: 0.4, y: 0.3 }),
    note('n3', { kind: 'page', n: 3, word: 'Slide', x: 0.1, y: 0.9 }),
    note('n4', { kind: 'page', n: 2, word: 'Slide', x: 0.7, y: 0.7 }),
    { do: 'resolve', on: 'n4', ts: 9 },
  ]);
  it('only the spots on the slide in view', () => {
    expect(pagePins(marks.notes, [], null, 2).map((p) => p.id)).toEqual(['n2']);
    expect(pagePins(marks.notes, [], null, 3).map((p) => p.id)).toEqual(['n3']);
  });
  it('a resolved one only while its undo is offered', () => {
    expect(pagePins(marks.notes, [], null, 2, { keep: 'n4' }).map((p) => p.id)).toEqual(['n2', 'n4']);
  });
  it('a picture pin and a whole-file note are not slide pins', () => {
    expect(pagePins([{ id: 'p', file: 'x', place: { kind: 'pin', x: 0.5, y: 0.5 }, text: 't', by: null, ts: 1 }], [], null, 1)).toEqual([]);
  });
  it('a pin, a film spot and a slide spot all count as pins; a slide, a moment and a quote do not', () => {
    expect([{ kind: 'pin', x: 0, y: 0 }, { kind: 'time', s: 1, x: 0.5, y: 0.5 }, { kind: 'page', n: 1, x: 0.5, y: 0.5 }].map(pinned)).toEqual([true, true, true]);
    expect([{ kind: 'page', n: 1 }, { kind: 'time', s: 1 }, { kind: 'quote', text: 'a' }, { kind: 'whole' }].map(pinned)).toEqual([false, false, false, false]);
  });
});

describe('the wiring', () => {
  const read = (f) => fs.readFileSync(new URL(`../renderer/src/components/${f}`, import.meta.url), 'utf8');
  it('a slide and a PDF page take a click as a spot', () => {
    expect(read('DeckSlides.tsx')).toMatch(/onSpot\?\.\(/);
    expect(read('PdfPages.tsx')).toMatch(/onSpot\?\.\(/);
  });
  it('a page takes a pin while Pin a spot is on, sized to its whole height so a pin stays on its spot', () => {
    const stage = read('ArtifactStage.tsx');
    expect(stage).toContain('Pin a spot');
    expect(stage).toContain("'agentbox-height'");
    expect(stage).toMatch(/av-page-pins/);
  });
});
