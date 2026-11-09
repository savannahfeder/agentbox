// A NOTE ON AN HTML PAGE NEVER OPENS A PICTURE.
//
// Dev: "Maya named you on group-seat-picker.html" and "Note on
// group-seat-picker.html, Pin 1" both opened seat-picker-open1-desktop.png.
// Measured from the code: Maya's note was on a page the thread's own lines
// never linked, so the view found no version for it and fell back to the
// thread's last file. A press now lands on the file it names or on nothing.
import { describe, it, expect } from 'vitest';
import { filesInLines, otherFilesInLines, threadFiles, whereAPressLands } from '../shared/artifact-marks.mts';

const said = (ts, result) => ({ ts, source: 'agent', patch: { result } });
const picture = said(1, 'The desktop shot: [seat-picker-open1-desktop.png](designs/seat-picker-open1-desktop.png)');
const page = said(2, 'The live page is `group-seat-picker.html`');
const familiesOf = (lines) => threadFiles([...filesInLines(lines), ...otherFilesInLines(lines)]);

describe('a press on a note about a page', () => {
  it('opens nothing rather than a picture, when the thread never named the page', () => {
    expect(whereAPressLands(familiesOf([picture]), { file: 'group-seat-picker.html' })).toBeNull();
  });

  it('opens the page when the thread names it', () => {
    const families = familiesOf([picture, page]);
    const at = whereAPressLands(families, { file: 'group-seat-picker.html' });
    expect(families[at.fi].versions[at.vi].name).toBe('group-seat-picker.html');
  });

  it('a path to the page never opens the picture', () => {
    expect(whereAPressLands(familiesOf([picture]), { path: 'group-seat-picker.html' })).toBeNull();
  });

  it('a note on the picture still opens the picture', () => {
    const families = familiesOf([picture, page]);
    const at = whereAPressLands(families, { file: 'seat-picker-open1-desktop.png' });
    expect(families[at.fi].versions[at.vi].name).toBe('seat-picker-open1-desktop.png');
  });
});
