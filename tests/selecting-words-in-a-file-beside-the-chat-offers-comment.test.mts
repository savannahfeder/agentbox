// SELECTING WORDS IN A FILE BESIDE THE CHAT OFFERS COMMENT (w-07c0b010fd).
//
// What broke: a document opened beside its thread showed the selection and
// nothing else. The Comment bar lived only inside the notes sidebar, and the
// sidebar is drawn full screen only, so beside the chat (where a file opens
// first) and full screen with the notes closed there was no bar to come up.
// Measured by reading DocPane and App: no SelectionBar was mounted unless
// `aside` (the sidebar) was. The pane now draws the bar over a document's or a
// script's words whenever the sidebar is not drawn and the file takes notes,
// and Comment opens the notes full screen with the words quoted.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { paneOffersComment } from '../renderer/src/doc-pane.ts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('the pane offers Comment on selected words', () => {
  it('beside the chat, on a document or a script that takes notes', () => {
    expect(paneOffersComment('markdown', false, true)).toBe(true);
    expect(paneOffersComment('text', false, true)).toBe(true);
  });
  it('not when the notes sidebar is drawn, which has its own bar', () => {
    expect(paneOffersComment('markdown', true, true)).toBe(false);
  });
  it("not on a file that takes no notes, such as a teammate's copy", () => {
    expect(paneOffersComment('markdown', false, false)).toBe(false);
  });
  it('not on a table, whose cell menu already says Comment, nor on a page, picture or film', () => {
    for (const kind of ['table', 'html', 'image', 'film', 'pdf', 'website', 'code'] as const) {
      expect(paneOffersComment(kind, false, true), kind).toBe(false);
    }
  });
});

describe('the window', () => {
  const pane = read('components/DocPane.tsx');
  const app = read('App.tsx');
  it('the pane draws the bar over the words it holds', () => {
    expect(pane).toMatch(/paneOffersComment\(kind, !!aside, !!onComment\) && <SelectionBar page=\{words\}/);
    expect(pane).toMatch(/<Beside aside=\{aside\} at=\{words\}>\s*<DocText/);
    expect(pane).toMatch(/<Beside aside=\{aside\} at=\{words\}><div className="code-scroll"/);
  });
  it('a file that takes notes hands its Comment to the app beside the chat as well as full screen', () => {
    expect(app).toMatch(/onComment=\{cellsTakeNotes \? commentOnFile : undefined\}/);
  });
  it('Comment opens the notes full screen with the words in the note box', () => {
    const comment = app.slice(app.indexOf('const commentOnFile = '), app.indexOf('const commentOnFile = ') + 400);
    expect(comment).toContain('setFileComment(cell ? { text, cell } : { text })');
    expect(comment).toContain('setNotesOpen(true)');
    expect(comment).toContain("if (artifactMode !== 'focus')");
    expect(app).toMatch(/asked=\{fileComment\} onAsked=\{\(\) => setFileComment\(null\)\}/);
  });
});
