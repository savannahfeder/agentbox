// NOTES SIT BESIDE A FULL-SCREEN DOCUMENT, OPEN UNLESS YOU CLOSED THEM (w-4ad34d6a27, 2026-11-03).
//
// What was asked: the full-screen document was the nicer place to read, but the
// only way to give feedback there was the one-line reply bar, and the notes you
// could pin on specific words lived in a different viewer. Now a thread's
// markdown document opened full screen has a notes sidebar: open by default,
// remembered closed across windows once you close it, taking the reply bar's
// place while open, and a box that grows and takes pasted pictures and files.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { NOTES_CLOSED_KEY, noteAttachments, notesSidebarOpen, rememberNotesSidebar, sidebarNotes, takesNotesSidebar } from '../renderer/src/notes-sidebar.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('open or closed', () => {
  it('is open the first time', () => {
    expect(notesSidebarOpen(memory())).toBe(true);
    expect(notesSidebarOpen(null)).toBe(true);
  });
  it('stays closed once closed, and opens again once opened', () => {
    const s = memory();
    rememberNotesSidebar(s, false);
    expect(s.getItem(NOTES_CLOSED_KEY)).toBe('1');
    expect(notesSidebarOpen(s)).toBe(false);
    rememberNotesSidebar(s, true);
    expect(notesSidebarOpen(s)).toBe(true);
  });
  it('is open when storage throws', () => {
    expect(notesSidebarOpen({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
  });
  it('another window closing it is heard', () => {
    const app = read('App.tsx');
    expect(app).toContain("window.addEventListener('storage', heard)");
    expect(app).toMatch(/e\.key === NOTES_CLOSED_KEY/);
  });
});

describe('which documents take it', () => {
  it('a markdown document', () => {
    for (const f of ['answers.md', 'docs/plan.markdown', 'designs/w-1/plan-v2.md?x=1']) expect(takesNotesSidebar(f), f).toBe(true);
  });
  it('not a page, a picture, a script or nothing', () => {
    for (const f of ['options.html', 'a.png', 'cart.mjs', 'notes.md.png', '', null]) expect(takesNotesSidebar(f), String(f)).toBe(false);
  });
  it('only full screen, on the thread you are in, and never a teammate\'s read-only copy', () => {
    const app = read('App.tsx');
    expect(app).toContain('const notesHere = fullScreenDoc && !!focused && openDoc?.product === focused.product && !openDoc.readOnly && takesNotesSidebar(openDoc.src);');
  });
});

describe('which notes are waiting', () => {
  const n = (id, extra = {}) => ({ id, file: 'a.md', place: { kind: 'whole' }, text: 'x', by: 'me', ts: Number(id.slice(1)), mentions: [], owner: null, uid: null, ...extra });
  it('splits unsent notes for the agent from sent ones, oldest first', () => {
    const { waiting, said } = sidebarNotes([n('n3'), n('n1', { sent: true }), n('n2')], ['a.md']);
    expect(waiting.map((x) => x.id)).toEqual(['n2', 'n3']);
    expect(said.map((x) => x.id)).toEqual(['n1']);
  });
  it('leaves out resolved notes and notes on other files', () => {
    const { waiting, said } = sidebarNotes([n('n1', { resolved: true }), n('n2', { file: 'b.md' })], ['a.md']);
    expect([...waiting, ...said]).toEqual([]);
  });
  it('counts every version of the document', () => {
    expect(sidebarNotes([n('n1', { file: 'a-v2.md' })], ['a.md', 'a-v2.md']).waiting).toHaveLength(1);
  });
  it('a note written to a teammate is not one Send would tell the agent', () => {
    const { waiting, said } = sidebarNotes([n('n1', { mentions: ['p-maya'] })], ['a.md'], [{ id: 'p-maya', name: 'Maya' }]);
    expect(waiting).toEqual([]);
    expect(said).toHaveLength(1);
  });
});

describe('the note box', () => {
  const side = read('components/NotesSidebar.tsx');
  it('grows with what is written, up to under half the window', () => {
    expect(side).toMatch(/el\.style\.height = 'auto';\s*el\.style\.height = `\$\{Math\.min\(el\.scrollHeight, Math\.round\(window\.innerHeight \* 0\.45\)\)\}px`/);
  });
  it('takes pasted pictures, dropped files and any file from the picker', () => {
    expect(side).toContain('onPaste=');
    expect(side).toContain('fromPaste(e)');
    expect(side).toContain('onDrop=');
    expect(side).toMatch(/<input ref=\{fileInput\} type="file" multiple hidden/);
    expect(side).not.toMatch(/type="file" accept=/);
  });
  it('marks every note it writes to wait for Send', () => {
    expect(side).toMatch(/mark: \{ do: 'note', id, file: version\.id, place, text, wait: true/);
    expect(side).toMatch(/mark: \{ do: 'toagent', on \}/);
  });
  it('lifts attached files out of a note to draw as chips, leaving pictures and other links', () => {
    expect(noteAttachments('Look at this [brief.pdf](attachments/x/brief.pdf) please')).toEqual({ words: 'Look at this please', files: [{ name: 'brief.pdf', src: 'attachments/x/brief.pdf' }] });
    expect(noteAttachments('![shot.png](attachments/shot.png)').files).toEqual([]);
    expect(noteAttachments('[site](https://example.com)').files).toEqual([]);
  });
});

describe('the reply line', () => {
  it('gives way to the notes while they are open', () => {
    expect(read('components/notes-sidebar.css')).toMatch(/\.workspace-layout\.notes-open\[data-artifact-layout="focus"\]:not\(\.workspace-settings\) > \.body > \.list-pane \{ display: none; \}/);
    expect(read('App.tsx')).toContain("${notesShown ? ' notes-open' : ''}");
  });
});
