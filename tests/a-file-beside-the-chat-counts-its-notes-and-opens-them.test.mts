// A FILE BESIDE THE CHAT COUNTS ITS NOTES AND OPENS THEM (2026-11-12).
//
// Notes are drawn full screen only. Beside the chat, where a document opens
// first, nothing said a file had any: a tester opened the v2 of a file both
// people had noted and read "an editable document with no Notes controls or
// visible earlier notes"; another opened a handed-on task's report and found
// "no Notes section". The pane now wears the same corner mark full screen
// has, counting the file's notes (every version, and every copy Files knows),
// and pressing it opens the file full screen with the notes open. On a
// teammate's copy the count is the thread's own, and the mark opens the review.
// Measured on the rules and by reading the window.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileFamilyFor, notesBesideCount } from '../renderer/src/notes-sidebar.ts';
import { notesOnFile } from '../renderer/src/threads/teammate-thread.ts';
import { NotesBesideMark } from '../renderer/src/components/NotesSidebar.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const line = (path, at, by = 'agent') => ({ by, ts: at, patch: { artifact: { do: 'edit', path, by } } });
const lines = [line('designs/w-1/finding.md', 1), line('designs/w-1/finding-v2.md', 2)];
const note = (id, file) => ({ id, file, by: 'u-lena', ts: 3, text: 'Is this right?', place: { kind: 'whole' } });

describe('the family a document beside the chat belongs to', () => {
  it('is every version of it, so v2 carries the notes on v1', () => {
    const fam = fileFamilyFor(lines, 'designs/w-1/finding-v2.md');
    expect(fam.fileIds).toHaveLength(2);
    expect(fam.copies.map((c) => c.path)).toEqual(['designs/w-1/finding.md', 'designs/w-1/finding-v2.md']);
    expect(fam.version?.n).toBe(2);
  });
  it('is a line of its own for a document no message named', () => {
    const fam = fileFamilyFor(lines, 'notes/plan.md');
    expect(fam.fileIds).toHaveLength(1);
    expect(fam.copies).toHaveLength(1);
  });
});

describe('the count', () => {
  const [v1, v2] = fileFamilyFor(lines, 'designs/w-1/finding-v2.md').fileIds;
  it('counts the notes on any version, resolved ones too, and leaves out another file\'s', () => {
    const own = [note('a', v1), { ...note('b', v2), resolved: true }, note('c', 'designs/w-1/other.md')];
    expect(notesBesideCount(own, [v1, v2], [])).toBe(2);
  });
  it('adds what Files knows from other copies, each note once', () => {
    const own = [note('a', v1)];
    const elsewhere = [{ key: 'k1', notes: [{ ...note('a', v1), key: 'k1' }, { ...note('d', v1), key: 'k1' }], approvals: [] }];
    expect(notesBesideCount(own, [v1, v2], elsewhere)).toBe(2);
  });
  it('is nothing on a file nobody noted', () => {
    expect(notesBesideCount([], [v1], [])).toBe(0);
  });
});

describe("a teammate's copy", () => {
  it('counts the thread\'s notes on any version of the file pressed', () => {
    const [v1, v2] = fileFamilyFor(lines, 'designs/w-1/finding-v2.md').fileIds;
    expect(notesOnFile(lines, [note('a', v1), note('b', v2), note('c', 'x')], 'designs/w-1/finding.md')).toBe(2);
    expect(notesOnFile(lines, [note('a', v1)], 'designs/w-1/nowhere.md')).toBe(0);
  });
});

describe('the mark', () => {
  it('is the notes mark, closed, before anything has loaded', () => {
    const html = renderToStaticMarkup(h(NotesBesideMark, { item: { id: 'w-1', product: 'p', artifacts: { notes: [] } }, src: 'a.md', onOpen() {} }));
    expect(html).toContain('notes-toggle');
    expect(html).toContain('title="Show notes"');
  });
});

describe('the window', () => {
  const app = read('renderer/src/App.tsx');
  const teammate = read('renderer/src/threads/TeammateThread.tsx');
  it('wears the mark beside the chat on a thread\'s file that takes notes, and not full screen, where the sidebar\'s own mark is', () => {
    expect(app).toContain('const notesBeside = !fullScreenDoc && cellsTakeNotes;');
    expect(app).toMatch(/\{notesBeside && focused && <NotesBesideMark [^\n]*onOpen=\{openNotesFull\} \/>\}/);
  });
  it('pressing it opens the notes and goes full screen the way the pane\'s own button does', () => {
    expect(app).toContain('const openNotesFull = () => { rememberNotesSidebar(localStorage, true); setNotesOpen(true); docFull(true); };');
    expect(app).toMatch(/if \(mode === 'focus'\) docFull\(\)/);
  });
  it("on a teammate's copy it counts the notes their thread has, and opens the review", () => {
    expect(app).toContain('const teammateNotesBeside = !fullScreenDoc && !!openDoc?.readOnly && !!openCard && openDoc.notes != null && takesNotesSidebar(openDoc.src);');
    expect(app).toMatch(/\{teammateNotesBeside && <NotesToggle open=\{false\} waiting=\{openDoc\.notes \?\? 0\} onToggle=\{openNotesFull\} \/>\}/);
    expect(teammate).toContain('onOpenDoc(product, src, notesOnFile(work?.lines ?? [], notesHere.current, src))');
    expect(teammate).toContain('onBeside={(path) => { setBig(null); beside(path); }}');
  });
});
