// A SHARED DOC CAN BE DOWNLOADED, AND THE WORDS A LINK COMMENT QUOTES ARE
// MARKED IN ITS OWNER'S COPY.
//
// QA on 2026-11-13, a markdown doc shared as "anyone with the link · can
// comment": the link page offered Download for pictures, PDFs, tables and films
// but not for a doc. A second account quoted "sharing" and commented; the quote
// showed in both comment lists, but the owner's doc, which opens in the editor,
// had no highlight at "sharing", because the editor painted only the owner's
// own notes. Measured on the rendered link page and on what the editor paints.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilePage } from '../renderer/src/shared-file/SharedFilePage.tsx';
import { linkNotesOnTheFile, quotedWords } from '../renderer/src/components/LinkNotes.tsx';

const TOK = '0123456789abcdef0123456789abcdef01234567';
const doc = (extra = {}) => ({ name: 'qa-share-doc.md', kind: 'markdown', type: 'text/markdown', body: '# Plan\n\nAbout sharing.', version: 1, createdAt: 0, updatedAt: 0, ownerName: 'Maya Chen', ownerAvatar: null, mine: false, ...extra });
const page = (file) => renderToStaticMarkup(h(FilePage, { token: TOK, file }));

describe('the link page of a doc', () => {
  it('offers Download, saved under the doc\'s own name', () => {
    const html = page(doc());
    expect(html).toContain('>Download</a>');
    expect(html).toContain('download="qa-share-doc.md"');
  });
  it('downloads from the words it already holds, as the site serves a doc as plain text to read', () => {
    expect(page(doc())).toMatch(/class="sf-download" href="blob:/);
    expect(page(doc({ anyone: false }))).toMatch(/class="sf-download" href="blob:/);
  });
  it('still offers none on an earlier version being looked at', () => {
    const peek = { version: { id: 'a', how: 'shared', byName: 'Maya Chen', byOwner: true, at: 0, current: false }, body: 'Old.', restore: async () => {}, back() {} };
    expect(renderToStaticMarkup(h(FilePage, { token: TOK, file: doc(), peek }))).not.toContain('Download');
  });
});

describe('the owner\'s copy of the doc', () => {
  const comment = (id, place) => ({ id, text: 'B: quote', byName: 'Theo', byOwner: false, at: 1, place });
  it('paints the words a link comment quotes', () => {
    const drawn = linkNotesOnTheFile([comment('c1', { kind: 'quote', text: 'sharing' })], 'link');
    expect(quotedWords(drawn)).toEqual([{ id: 'link-c1', text: 'sharing' }]);
  });
  it('paints nothing for a comment on the whole doc, and leaves a resolved note of its own unpainted', () => {
    expect(quotedWords(linkNotesOnTheFile([comment('c2', null), comment('c3', { kind: 'whole' })], 'link'))).toEqual([]);
    const own = { id: 'n1', file: 'f', place: { kind: 'quote', text: 'Plan' }, text: 'x', by: null, ts: 0, mentions: [], owner: null, uid: null, resolved: true };
    expect(quotedWords([own])).toEqual([]);
  });
  it('is painted in the editor with the link\'s quotes as well as its own', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/paintQuotes\(root, \[\.\.\.liveQuotes, \.\.\.linkQuotes\]/);
  });
});
