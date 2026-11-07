// A COMMENT CARRIED FROM V1 DRAWS ITS PIN ON V2.
//
// An open pin on v1 came along to v2 in the comment list ("From v1,
// still open"), but nothing was drawn on the v2 picture, so the list said Pin 1
// and the picture showed no 1 anywhere. Measured in ArtifactView: the stage was
// handed `marks.notes.filter((n) => n.file === id)`, the notes of that version
// alone, while the list was handed those plus the carried ones.
//
// A carried pin is labelled with its version ("v1·1"), so it never reads as
// v2's own Pin 1, and the card says the same words as the tag.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { carriedNotes, marksOf, threadFiles } from '../shared/artifact-marks.mts';
import { pinLabel, pinsToDraw, notePlaceWords } from '../renderer/src/artifact-pins.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const pin = (id, file, x, by = 'sofia', ts = 1) => ({ do: 'note', id, file, place: { kind: 'pin', x, y: 0.5 }, text: `on ${file}`, by, ts });

const family = threadFiles([{ path: 'designs/slots.png' }, { path: 'designs/slots-v2.png' }])[0];
const marks = marksOf([
  pin('n1', 'slots.png', 0.1, 'sofia', 1),
  pin('n2', 'slots.png', 0.2, 'sofia', 2),
  { do: 'resolve', on: 'n2', by: 'dev', ts: 3 },
  pin('n3', 'slots-v2.png', 0.3, 'maya', 4),
  { do: 'note', id: 'n4', file: 'slots.png', place: { kind: 'whole' }, text: 'Overall fine', by: 'sofia', ts: 5 },
]);
const onV2 = () => pinsToDraw(marks.notes.filter((n) => n.file === 'slots-v2.png'), carriedNotes(family, 1, marks.notes), null);

describe('the pins drawn on v2', () => {
  it('are its own and the open ones carried from v1', () => {
    expect(onV2().map((p) => [p.id, p.label, p.carried])).toEqual([['n3', '1', false], ['n1', 'v1·1', true]]);
  });
  it('sit where they were put on v1', () => {
    expect(onV2().find((p) => p.id === 'n1')).toMatchObject({ x: 0.1, y: 0.5 });
  });
  it('leave out a resolved v1 pin and a comment on the whole file', () => {
    expect(onV2().map((p) => p.id)).not.toContain('n2');
    expect(onV2().map((p) => p.id)).not.toContain('n4');
  });
  it('on v1 itself, the same pin carries no version in its label', () => {
    const v1 = pinsToDraw(marks.notes.filter((n) => n.file === 'slots.png'), [], null);
    expect(v1.map((p) => p.label)).toEqual(['1']);
  });
});

describe('the words on the card', () => {
  it('match the tag', () => {
    const carried = carriedNotes(family, 1, marks.notes)[0];
    expect(pinLabel(carried)).toBe('v1·1');
    expect(notePlaceWords(carried)).toBe('Pin v1·1');
    expect(notePlaceWords(marks.notes.find((n) => n.id === 'n3'))).toBe('Pin 1');
    expect(notePlaceWords(marks.notes.find((n) => n.id === 'n4'))).toBe('Whole file');
  });
});

describe('the wiring', () => {
  it('hands the stage the carried comments, and a press on a carried pin picks it', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/carried=\{/);
    expect(view).toMatch(/\[\.\.\.notesHere, \.\.\.carried\]\.find/);
  });
});
