// THE NOTES MARK OPENS THE NEWEST VERSION, WHERE EVERY NOTE IS (2026-11-12).
//
// A tester opened a handed-on task's audit beside the chat, read "3" on the
// notes mark, pressed it, and the file opened full screen on "v1 of 2" with
// an empty notes column; the three notes were on v2, one press further. The
// mark counts the notes on every version of the file, and a note carries
// forward to newer versions, never back. So a press on the mark lands on the
// newest version, where all of them are. A press on a file's own link still
// opens exactly the version it names.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const view = read('renderer/src/components/ArtifactView.tsx');

describe('the mark beside the chat', () => {
  it('asks the full-screen view for the newest version', () => {
    expect(app).toContain('const openNotesFull = () => { rememberNotesSidebar(localStorage, true); setNotesOpen(true); docFull(true); };');
    const full = app.slice(app.indexOf('const docFull = (forNotes = false) => {'), app.indexOf('const openNotesFull'));
    expect(full).toContain("...(forNotes ? { newest: true as const } : {})");
  });
  it('the pane\'s own full-screen button still opens the version beside the chat', () => {
    expect(app).toMatch(/if \(mode === 'focus'\) docFull\(\)/);
  });
});

describe('the full-screen view', () => {
  it('lands on the last version of the file the press names when asked for the newest', () => {
    expect(view).toContain('setAt(open.newest ? { fi: hit.fi, vi: families[hit.fi].versions.length - 1 } : hit);');
  });
  it('a press on a note still opens the version the note is on', () => {
    const press = view.slice(view.indexOf('placedFor.current = press;'), view.indexOf('const family = at ?'));
    expect(press).toContain('whereAPressLands(families, { path: open.path, file: wanted })');
  });
});
