// OPENING A DOCUMENT SAVES NOTHING UNTIL SOMEONE TYPES IN IT.
//
// Measured on a three-person test team (2026-11-11): a teammate opened the
// owner's markdown file in the review view, typed only in Notes, and a new
// file add-an-idempotency-key-to-v2.md appeared in the owner's store, the
// thread said she had edited it, and the header read "v1 of 2". Two causes:
// filling the editor with the file (setContent, or the live room's first
// sync) ran autolink over the first line and linked `payments-idempotency.md`,
// and the review view's flush on blur or close wrote back any difference from
// the file, typed or not. Run on the editor's own plugins: before the fix the
// loaded first line came back as `[payments-idempotency.md](http://...)`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Editor } from '@tiptap/core';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { buildExtensions } from '../renderer/src/editor/extensions.ts';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown.ts';
import { isTypedHere, wordsTheyChanged } from '../renderer/src/editor/typed-links.ts';

const FILE = '# add an idempotency key to POST /payments and write up what changed in payments-idempotency.md\n\nSee www.example.com for the old flow.\n';

const editor = new Editor({ element: null, extensions: buildExtensions(''), content: mdToPmDoc('') });
const empty = () => EditorState.create({ schema: editor.schema, doc: editor.schema.nodeFromJSON(mdToPmDoc('')), plugins: editor.extensionManager.plugins });
const fill = (state: EditorState, md: string): Transaction => state.tr.replaceWith(0, state.doc.content.size, editor.schema.nodeFromJSON(mdToPmDoc(md)).content);
const mdOf = (state: EditorState) => pmDocToMd(state.doc.toJSON());

describe('filling the editor with a file', () => {
  it('changes nothing in it, as the app loads it', () => {
    const tr = fill(empty(), FILE).setMeta('preventUpdate', true);
    expect(isTypedHere(tr)).toBe(false);
    expect(mdOf(empty().applyTransaction(tr).state)).toBe(FILE);
  });

  it('changes nothing in it, as a live room first fills it', () => {
    const tr = fill(empty(), FILE).setMeta(ySyncPluginKey, { isChangeOrigin: true });
    expect(isTypedHere(tr)).toBe(false);
    expect(mdOf(empty().applyTransaction(tr).state)).toBe(FILE);
  });

  it('is told apart from a keystroke', () => {
    const state = empty().applyTransaction(fill(empty(), FILE).setMeta('preventUpdate', true)).state;
    expect(isTypedHere(state.tr.insertText('x', 3))).toBe(true);
  });
});

describe('what a sitting with the document writes back', () => {
  const baseline = pmDocToMd(mdToPmDoc(FILE));

  it('is nothing when the document was opened and left with no input', () => {
    expect(wordsTheyChanged({ touched: false, baseline, now: baseline })).toBeNull();
  });

  it('is nothing when only the editor re-wrote the markdown and nobody typed', () => {
    const SOURCE = '* one\n* two\n\n__bold__ words\n';
    const loaded = pmDocToMd(mdToPmDoc(SOURCE));
    expect(loaded).not.toBe(SOURCE);
    expect(wordsTheyChanged({ touched: false, baseline: loaded, now: loaded })).toBeNull();
    // A link the editor made on its own, with nobody typing, still writes nothing.
    expect(wordsTheyChanged({ touched: false, baseline: loaded, now: loaded.replace('one', '[one](http://one)') })).toBeNull();
  });

  it('is the new words after one real keystroke', () => {
    let state = empty().applyTransaction(fill(empty(), FILE).setMeta('preventUpdate', true)).state;
    const key = state.tr.insertText('!', state.doc.content.size - 1);
    state = state.applyTransaction(key).state;
    const now = mdOf(state);
    expect(wordsTheyChanged({ touched: isTypedHere(key), baseline, now })).toBe(now);
    expect(now).toContain('the old flow.!');
  });

  it('is nothing when someone typed and took it back', () => {
    expect(wordsTheyChanged({ touched: true, baseline, now: baseline })).toBeNull();
  });
});

describe('the review view', () => {
  const src = fs.readFileSync(new URL('../renderer/src/components/DocText.tsx', import.meta.url), 'utf8');
  it('counts only a change typed here, or a draft kept from before, as touching the file', () => {
    expect(src).toMatch(/const touched = useRef\(!!versions\?\.draft\);/);
    expect(src).toMatch(/if \(transaction\.docChanged && isTypedHere\(transaction\)\) touched\.current = true;/);
  });
  it('writes back from a sitting only what was touched', () => {
    expect(src).toMatch(/wordsTheyChanged\(\{ touched: touched\.current \|\| !!room, baseline: baseMd\.current, now: md \}\)/);
  });
  it('takes the editor\'s own reading of a file it loads as the baseline', () => {
    expect(src).toMatch(/editor\.commands\.setContent\(doc, \{ emitUpdate: false \}\);\n\s*baseMd\.current = pmDocToMd\(editor\.getJSON\(\)\);/);
  });
});
