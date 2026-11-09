// A PAGE OR A SCRIPT OPENED FULL SCREEN HAS THE NOTES SIDEBAR TOO (w-858a033e54, 2026-11-09).
//
// What broke: the notes sidebar (Unsent, Send N, Sent) was built for markdown
// only, so an html page or a script opened full screen from a thread showed
// the one-line reply bar and no way to leave notes that wait for one Send.
// Measured in the fixtures app: a full-screen page drew no `.sb` and kept the
// reply line. Pictures, PDFs, films and tables open in the big viewer, whose
// own notes column covers them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { takesNotesSidebar } from '../renderer/src/notes-sidebar.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('which files take the sidebar', () => {
  it('a page, a script, a text file and a table, as well as a document', () => {
    for (const f of ['options.html', 'designs/w-1/page.htm', 'cart.mjs', 'notes.txt', 'data.json', 'leads.csv', 'plan.md', 'designs/w-1/page-v2.html?x=1']) {
      expect(takesNotesSidebar(f), f).toBe(true);
    }
  });
  it('not a page on the web, even one ending in .html', () => {
    for (const f of ['https://example.com/report.html', 'http://example.com/a.md']) expect(takesNotesSidebar(f), f).toBe(false);
  });
  it('not a change, whose review is its own, nor nothing', () => {
    for (const f of ['runs/w-1/the-change-it-made.change', '', null, undefined]) expect(takesNotesSidebar(f), String(f)).toBe(false);
  });
  it('not what the big viewer opens with its own notes', () => {
    for (const f of ['a.png', 'deck.pdf', 'clip.mp4', 'notes.md.png']) expect(takesNotesSidebar(f), f).toBe(false);
  });
});

describe('the pane', () => {
  const pane = read('components/DocPane.tsx');
  it('sets the sidebar beside a page, a table and a script, not only a document', () => {
    expect(pane.match(/<Beside aside=\{aside\}>/g)?.length).toBeGreaterThanOrEqual(4);
  });
  it('lets whatever sits beside the notes take the room', () => {
    expect(read('components/notes-sidebar.css')).toContain('.doc-notes-split > :not(.sb) { flex: 1; min-width: 0; min-height: 0; }');
  });
});

describe('the sidebar on a page with no words to select', () => {
  const side = read('components/NotesSidebar.tsx');
  it('finds a script\'s text as the page to select in', () => {
    expect(side).toContain("card.querySelector<HTMLElement>('.doc-rich-content, .code-scroll')");
  });
  it('asks only for a note where nothing can be selected', () => {
    expect(side).toContain("page.current ? 'Add a note, or select words in the page' : 'Add a note'");
  });
});
