// A FILE NAME IN A DOCUMENT IS NOT A WEB ADDRESS.
//
// Measured on a three-person test team (2026-11-11): an agent's document began
//   # add an idempotency key to POST /payments and write up what changed in payments-idempotency.md
// and after a teammate only opened it, the saved copy read
//   ... in [payments-idempotency.md](http://payments-idempotency.md)
// The editor's autolink (linkifyjs) reads `.md`, `.py` and `.mov` as country
// or brand domains. A bare word ending in a kind of file the app opens is a
// file name; a word with a scheme, a `www.` or a path after a real host is
// still an address. The chat box has the same autolink and the same rule.
import { describe, it, expect } from 'vitest';
import { Editor, type AnyExtension } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { linksAsAddress } from '../renderer/src/editor/typed-links.ts';
import { buildExtensions } from '../renderer/src/editor/extensions.ts';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown.ts';
import { chatExtensions, chatDoc, chatMarkdown } from '../renderer/src/team/chat-editor.ts';

describe('which typed words become links', () => {
  it('leaves file names the app opens as words', () => {
    for (const w of ['payments-idempotency.md', 'readme.md', 'checkout.html', 'rows.csv', 'notes.txt', 'data.json', 'run.py', 'phone-unknown.png', 'deck.pptx', 'demo.mov']) {
      expect(linksAsAddress(w), w).toBe(false);
    }
  });

  it('still links real addresses', () => {
    for (const w of ['https://example.com', 'http://example.com', 'www.example.com', 'example.com', 'example.com/pricing', 'mailto:ana@example.com']) {
      expect(linksAsAddress(w), w).toBe(true);
    }
  });

  it('links a file name inside a real address as that address', () => {
    expect(linksAsAddress('https://example.com/a/readme.md')).toBe(true);
    expect(linksAsAddress('example.com/a/readme.md')).toBe(true);
    expect(linksAsAddress('www.example.com/notes.txt')).toBe(true);
  });

  it('does not link a word with no dot, or a bare number address', () => {
    expect(linksAsAddress('localhost')).toBe(false);
    expect(linksAsAddress('10.0.0.1')).toBe(false);
  });
});

// The editor's own plugins on a bare state: an Editor with no element mounts nothing.
const typeInto = (extensions: AnyExtension[], doc: object, words: string): string => {
  const editor = new Editor({ element: null, extensions, content: { type: 'doc', content: [{ type: 'paragraph' }] } });
  let state = EditorState.create({ schema: editor.schema, doc: editor.schema.nodeFromJSON(doc), plugins: editor.extensionManager.plugins });
  for (const ch of words) state = state.applyTransaction(state.tr.insertText(ch, state.doc.content.size - 1)).state;
  editor.destroy();
  return JSON.stringify(state.doc.toJSON());
};

describe('typing in the document', () => {
  const doc = buildExtensions('');
  it('leaves a file name as a word', () => {
    const out = typeInto(doc, mdToPmDoc('see'), ' payments-idempotency.md ');
    expect(out).not.toContain('"link"');
  });
  it('links an address', () => {
    const out = typeInto(doc, mdToPmDoc('see'), ' example.com/pricing ');
    expect(out).toContain('"href":"http://example.com/pricing"');
  });
  it('writes the file name back as it was typed', () => {
    const editor = new Editor({ element: null, extensions: doc, content: mdToPmDoc('') });
    let state = EditorState.create({ schema: editor.schema, doc: editor.schema.nodeFromJSON(mdToPmDoc('see')), plugins: editor.extensionManager.plugins });
    for (const ch of ' readme.md ') state = state.applyTransaction(state.tr.insertText(ch, state.doc.content.size - 1)).state;
    expect(pmDocToMd(state.doc.toJSON())).toBe('see readme.md \n');
    editor.destroy();
  });
});

describe('typing in the chat box', () => {
  const chat = chatExtensions('');
  it('leaves a file name as a word', () => {
    const out = typeInto(chat, chatDoc('see'), ' checkout.html and readme.md ');
    expect(out).not.toContain('"link"');
  });
  it('links an address', () => {
    const out = typeInto(chat, chatDoc('see'), ' www.example.com ');
    expect(out).toContain('"link"');
    expect(chatMarkdown(JSON.parse(out))).toContain('](http://www.example.com)');
  });
});
