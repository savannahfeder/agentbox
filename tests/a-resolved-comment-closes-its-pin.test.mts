// A RESOLVED COMMENT CLOSES ITS PIN.
//
// Resolving a pinned comment left its pin on the picture, only
// greyed, so a picture reviewed twice wore every pin it had ever had and the
// open ones were hard to find. Figma closes a resolved pin. Measured in
// ArtifactStage: every pin note was drawn, `is-settled` only faded it.
//
// A resolved pin shows again only while its card is picked from the resolved list.
import { it, expect, describe } from 'vitest';
import { marksOf } from '../shared/artifact-marks.mts';
import { pinsToDraw } from '../renderer/src/artifact-pins.ts';

const marks = marksOf([
  { do: 'note', id: 'n1', file: 'a.png', place: { kind: 'pin', x: 0.1, y: 0.1 }, text: 'Open', by: 's', ts: 1 },
  { do: 'note', id: 'n2', file: 'a.png', place: { kind: 'pin', x: 0.2, y: 0.2 }, text: 'Done', by: 's', ts: 2 },
  { do: 'resolve', on: 'n2', by: 'd', ts: 3 },
  { do: 'note', id: 'n3', file: 'a.png', place: { kind: 'pin', x: 0.3, y: 0.3 }, text: 'Back', by: 's', ts: 4 },
  { do: 'resolve', on: 'n3', by: 'd', ts: 5 },
  { do: 'reopen', on: 'n3', by: 's', ts: 6 },
]);

describe('which pins a picture wears', () => {
  it('leaves the resolved one off', () => {
    expect(pinsToDraw(marks.notes, [], null).map((p) => p.id)).toEqual(['n1', 'n3']);
  });
  it('draws a reopened one again', () => {
    expect(pinsToDraw(marks.notes, [], null).map((p) => p.id)).toContain('n3');
  });
  it('shows a resolved one, settled, while its card is picked', () => {
    const drawn = pinsToDraw(marks.notes, [], 'n2');
    expect(drawn.find((p) => p.id === 'n2')).toMatchObject({ settled: true, on: true });
  });
  it('keeps the numbers the comments were given', () => {
    expect(pinsToDraw(marks.notes, [], null).map((p) => p.label)).toEqual(['1', '3']);
  });
});
