// A THREAD CALLS A VERSION BY ITS NUMBER ON THE LINE.
//
// Sofia: a pin she made on v7 read "Pin v6·1", and Maya's note on
// the investor update's v6 was labelled "v3". Measured from the code: the
// thread's words counted only the versions its own lines named. With the
// file's line (main/files-place.mts lineFor) they say the number Files says.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { messageKind } from '../renderer/src/threads/message-kind.ts';
import { carriedNotes, threadFiles, filesInLines, notesForTheAgent } from '../shared/artifact-marks.mts';

const agent = (ts, result) => ({ ts, source: 'agent', patch: { result } });
const note = (ts, file) => ({ ts, source: 'founder', patch: { artifact: { do: 'note', id: `n${ts}`, file, place: { kind: 'pin', x: 0.5, y: 0.5 }, text: 'Tighten this' } } });
const kinds = (lines, numbers) => threadEvents(lines, null, numbers).filter((e) => e.fileMark).map((e) => messageKind(e)?.word);

// This thread made v1 and v7; v2 to v6 were made on other threads.
const lines = [
  agent(1, '[group-seat-picker.png](designs/group-seat-picker.png)'),
  agent(2, '[group-seat-picker-v5.png](designs/group-seat-picker-v5.png)'),
  note(3, 'group-seat-picker-v5.png'),
];
const numbers = { 'designs/group-seat-picker.png': 1, 'designs/group-seat-picker-v5.png': 7 };

describe('the words for a note', () => {
  it('say the number the line gave, not the count on this thread', () => {
    expect(kinds(lines, numbers)).toEqual(['Note on group-seat-picker.png, v7, Pin 1']);
  });
  it('say what they always said with no line', () => {
    expect(kinds(lines)).toEqual(['Note on group-seat-picker.png, v2, Pin 1']);
  });
  it('a lone version later on the line still says its number', () => {
    expect(kinds([lines[1], lines[2]], { 'designs/group-seat-picker-v5.png': 7 })).toEqual(['Note on group-seat-picker.png, v7, Pin 1']);
  });
});

describe('an agent sent notes', () => {
  // Sofia's agent called its new picture "v5" while the app called it v6.
  it('is told the app numbers the version, so it gives none of its own', () => {
    const [family] = threadFiles(filesInLines(lines), numbers);
    const { text } = notesForTheAgent({ notes: [{ id: 'n3', file: 'group-seat-picker-v5.png', place: { kind: 'whole' }, text: 'Bigger' }] }, family.versions[1], family.versions.length);
    expect(text).toMatch(/the next version of group-seat-picker\.png/);
    expect(text).toMatch(/not a number of your own/);
  });
});

describe('a pin carried to a newer version', () => {
  it('says the version it was made on by its number on the line', () => {
    const [family] = threadFiles(filesInLines([...lines, agent(4, '[group-seat-picker-v6.png](designs/group-seat-picker-v6.png)')]), { ...numbers, 'designs/group-seat-picker-v6.png': 8 });
    const notes = [{ id: 'n3', file: 'group-seat-picker-v5.png', place: { kind: 'pin', x: 0.5, y: 0.5 }, text: 'x' }];
    expect(carriedNotes(family, family.versions.length - 1, notes).map((n) => n.from)).toEqual(['v7']);
  });
});
