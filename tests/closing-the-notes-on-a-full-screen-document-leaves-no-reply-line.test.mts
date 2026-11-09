// CLOSING THE NOTES ON A FULL-SCREEN DOCUMENT LEAVES NO REPLY LINE (w-a21d7e5613, 2026-11-06).
//
// What broke: the notes sidebar takes the reply line's place while it is open,
// but closing it brought the reply line back under the page. Closing the notes
// is asking to read with nothing else on screen. Measured in the stylesheet:
// the only rule hiding `.list-pane` in full screen was keyed on `.notes-open`.
//
// R still brings the box up on purpose (`.composing`), so a reply is one key
// away and folds back on a click into the page as before.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const css = read('components/notes-sidebar.css');
const app = read('App.tsx');
const FOCUS = '[data-artifact-layout="focus"]:not(.workspace-settings)';

describe('a full-screen document whose notes are closed', () => {
  it('marks the window when the notes could be open and are closed', () => {
    expect(app).toContain('const notesClosed = notesHere && !notesOpen;');
    expect(app).toContain("${notesClosed ? ' notes-closed' : ''}");
  });

  it('hides the reply line unless R was pressed to write', () => {
    expect(css).toContain(`.workspace-layout.notes-closed${FOCUS}:not(.composing) > .body > .list-pane { display: none; }`);
  });

  it('still hides it while the notes are open', () => {
    expect(css).toContain(`.workspace-layout.notes-open${FOCUS} > .body > .list-pane { display: none; }`);
  });

  it('leaves the reply line on a full-screen page that takes no notes', () => {
    // A picture has no notes to close, so neither class is set
    // and the line stays, as a-tall-picture-in-full-screen… pins.
    expect(app).toContain('const notesHere = fullScreenDoc && !!focused && openDoc?.product === focused.product && !openDoc.readOnly && takesNotesSidebar(openDoc.src);');
    expect(css).not.toMatch(/\.workspace-layout\[data-artifact-layout="focus"\][^{]*> \.list-pane \{ display: none; \}/);
  });
});
