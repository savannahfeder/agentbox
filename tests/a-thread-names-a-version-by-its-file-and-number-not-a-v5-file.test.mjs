// A THREAD NAMES A VERSION BY ITS FILE AND NUMBER, NOT AS A "-v5" FILE.
//
// Maya: the investor update's thread read "Edited
// october-investor-update-v2.md", "-v3.md", "-v5.md", which look like three
// separate files, while Files shows one file with versions. Measured from the
// code: the line printed the saved copy's name off its path. It now prints the
// file's one name and the version, as the big view counts them.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { messageKind } from '../renderer/src/threads/message-kind.ts';

const agent = (ts, result) => ({ ts, source: 'agent', patch: { result } });
const edit = (ts, file) => ({ ts, source: 'founder', patch: { artifact: { do: 'edit', file, path: `designs/w-1/${file}` } } });
const note = (ts, file) => ({ ts, source: 'founder', patch: { artifact: { do: 'note', id: `n${ts}`, file, place: { kind: 'pin', x: 0.5, y: 0.5 }, text: 'Tighten this' } } });
const kinds = (lines) => threadEvents(lines).filter((e) => e.fileMark).map((e) => messageKind(e)?.word);

describe('the words for an edit', () => {
  it('names the one file and the version number', () => {
    const lines = [
      agent(1, 'Here it is: [october-investor-update.md](designs/w-1/october-investor-update.md)'),
      edit(2, 'october-investor-update-v2.md'),
      edit(3, 'october-investor-update-v3.md'),
    ];
    expect(kinds(lines)).toEqual(['Edited october-investor-update.md, v2', 'Edited october-investor-update.md, v3']);
  });
  it('a file with one version keeps its own name and no number', () => {
    expect(kinds([edit(2, 'notes.md')])).toEqual(['Edited notes.md']);
  });
  it('two different files are never given one name', () => {
    const lines = [
      agent(1, '[plan.md](designs/w-1/plan.md) and [plan-notes.md](designs/w-1/plan-notes.md)'),
      edit(2, 'plan-notes-v2.md'),
    ];
    expect(kinds(lines)).toEqual(['Edited plan-notes.md, v2']);
  });
});

describe('the words for a note', () => {
  it('a pin on v4 says the file and v4', () => {
    const lines = [
      agent(1, 'group-seat-picker.png'),
      agent(2, 'group-seat-picker-v2.png'),
      agent(3, 'group-seat-picker-v3.png'),
      agent(4, 'group-seat-picker-v4.png'),
      note(5, 'group-seat-picker-v4.png'),
    ];
    expect(kinds(lines)).toEqual(['Note on group-seat-picker.png, v4, Pin 1']);
  });
  it('still opens the version it was made on', () => {
    const lines = [agent(1, 'a.png'), agent(2, 'a-v2.png'), note(3, 'a-v2.png')];
    expect(threadEvents(lines).find((e) => e.fileMark)?.fileMark?.file).toBe('a-v2.png');
  });
});
