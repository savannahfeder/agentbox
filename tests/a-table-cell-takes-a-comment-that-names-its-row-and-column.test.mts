// A TABLE CELL TAKES A COMMENT THAT NAMES ITS ROW AND COLUMN (w-2e26d0fb44).
//
// What broke: a table opened full screen from its thread had no way to comment
// on it. The notes sidebar was only offered for markdown, the sidebar only
// looked for a markdown page to take words from, and the grid cannot be
// selected, so there was nothing to quote. In the file viewer a table named in
// a message opens in, the empty sidebar said "Select words to note them", which
// a grid cannot do; Comment sat mid-menu on a right-click; and choosing it gave
// the keys back to the table, so the note typed next went nowhere. The note
// held only the cell's words, so a comment on one "TBD" among forty reached the
// agent as just “TBD” and lit the first "TBD" in the table. Measured in the
// built app, driven by Playwright with a stand-in bridge: the typed note never
// reached fileMark before, and reached it with { row: 4, column: 'Stage' } after.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cleanMark, notesForTheAgent, placeWords } from '../shared/artifact-marks.mts';
import { takesNotesSidebar } from '../renderer/src/notes-sidebar.ts';
import { cellSelector } from '../renderer/src/paint-quotes.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const note = (place) => ({ do: 'note', id: 'n1', file: 'leads.csv', place, text: 'Chase this one' });

describe('a comment on a cell keeps its cell', () => {
  it('keeps the row and the column', () => {
    expect(cleanMark(note({ kind: 'quote', text: 'TBD', cell: { row: 4, column: 'Status' } })).place)
      .toEqual({ kind: 'quote', text: 'TBD', cell: { row: 4, column: 'Status' } });
  });
  it('keeps the quote and drops a cell that does not name one', () => {
    for (const cell of [{ row: 0, column: 'Status' }, { row: 1.5, column: 'Status' }, { row: 3, column: '  ' }, { row: 3 }, 'row 3', null]) {
      expect(cleanMark(note({ kind: 'quote', text: 'TBD', cell })).place, JSON.stringify(cell)).toEqual({ kind: 'quote', text: 'TBD' });
    }
  });
  it('words picked in a document stay a plain quote', () => {
    expect(cleanMark(note({ kind: 'quote', text: 'Set-up is three steps' })).place).toEqual({ kind: 'quote', text: 'Set-up is three steps' });
  });
});

describe('the agent is told which cell', () => {
  it('says the row and the column after the words', () => {
    expect(placeWords({ place: { kind: 'quote', text: 'TBD', cell: { row: 4, column: 'Status' } } })).toBe('“TBD” in row 4, Status');
  });
  it('a quote with no cell reads as it did', () => {
    expect(placeWords({ place: { kind: 'quote', text: 'TBD' } })).toBe('“TBD”');
  });
  it('the notes it is sent carry it', () => {
    const n = { id: 'n1', file: 'v1', place: { kind: 'quote', text: 'TBD', cell: { row: 4, column: 'Status' } }, text: 'Chase this one', by: 'me', replies: [] };
    const { text } = notesForTheAgent({ notes: [n] }, { id: 'v1', path: 'leads.csv', name: 'leads.csv', agent: 'a' }, 1);
    expect(text).toContain('- “TBD” in row 4, Status: Chase this one');
  });
});

describe('a table opened full screen takes notes', () => {
  it('a csv or tsv takes the sidebar, as markdown does', () => {
    for (const f of ['leads.csv', 'docs/out/leads.TSV', 'a.md']) expect(takesNotesSidebar(f), f).toBe(true);
  });
  it('a picture, or nothing, still does not', () => {
    for (const f of ['a.png', 'leads.csv.png', '']) expect(takesNotesSidebar(f), f).toBe(false);
  });
  it('the pane draws the sidebar beside the table and hands it the cell commented on', () => {
    const pane = read('components/DocPane.tsx');
    expect(pane).toMatch(/<Beside aside=\{aside\}>\s*<TableView[^>]*onComment=\{onComment\}/);
  });
  it('the sidebar takes words from the table as well as from a document', () => {
    expect(read('components/NotesSidebar.tsx')).toContain(".doc-rich-content, .code-scroll, .tbl");
  });
  it('the cell menu opens the sidebar with the cell in it, beside the thread or full screen', () => {
    const app = read('App.tsx');
    expect(app).toContain('const cellsTakeNotes = !!focused && openDoc?.product === focused.product && !openDoc.readOnly && takesNotesSidebar(openDoc.src);');
    expect(app).toMatch(/onComment=\{cellsTakeNotes \? commentOnTable : undefined\}/);
    const comment = app.slice(app.indexOf('const commentOnTable = '), app.indexOf('const commentOnTable = ') + 400);
    expect(comment).toContain('setNotesOpen(true)');
    expect(comment).toContain("if (artifactMode !== 'focus') { setArtifactReturnBeside(artifactMode === 'beside'); setArtifactMode('focus'); }");
  });
});

describe('the cell, not the first matching words, is lit', () => {
  it('every cell drawn says its file row and its column', () => {
    const view = read('components/TableView.tsx');
    expect(view).toContain('data-row={hands ? fileRow + 1 : undefined} data-col={hands ? table.columns[i].name : undefined}');
  });
  it('Comment comes first in the menu, hands over the cell under the pick, and leaves the keys with the note box', () => {
    expect(read('components/TableView.tsx')).toMatch(/setFloat\(null\);\s*onComment\(atValue\.trim\(\), \{ row: order\[pick\.a\.r\] \+ 1, column: table\.columns\[pick\.a\.c\]\.name \}\);\s*\}\} \/>\s*<span className="when-sep" \/>\s*<\/>\}\s*<MenuRow label="Open row"/);
  });
  it('an empty viewer says how to note a table', () => {
    expect(read('components/ArtifactView.tsx')).toContain("kind === 'table' ? 'Right-click a cell to note it'");
  });
  it('finds the cell by those two', () => {
    expect(cellSelector({ row: 4, column: 'Status' })).toBe('.tbl-td[data-row="4"][data-col="Status"]');
    expect(cellSelector({ row: 12, column: 'Say "hi"\\' })).toBe('.tbl-td[data-row="12"][data-col="Say \\"hi\\"\\\\"]');
  });
});
