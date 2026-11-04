// THE EDITOR IS THE SAME EDITOR ON TIPTAP 3 (w-0240d72133).
//
// tiptap 2 carries an advisory with no fix on 2.x (GHSA-cp6q-959q-f8rh), so the
// doc pane, the sidebar note and the chat box moved to 3. Measured on the move:
// `@tiptap/extension-table` has no default export any more, so the old import
// made the table undefined; StarterKit 3 brings its own link and underline, so
// both were registered twice; and `setContent` now counts as an edit unless
// told otherwise, so an agent's rewrite of an open doc would be saved straight
// back and the sidebar note would write its seeded description to disk.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getSchema, flattenExtensions } from '@tiptap/core';
import { buildExtensions } from '../renderer/src/editor/extensions.ts';
import { chatExtensions } from '../renderer/src/team/chat-editor.ts';

const names = (list) => flattenExtensions(list).map((e) => e.name);
const sorted = (obj) => Object.keys(obj).sort();

describe('the doc editor', () => {
  it('has the blocks and styles it had on tiptap 2', () => {
    const schema = getSchema(buildExtensions(''));
    expect(sorted(schema.nodes)).toEqual([
      'blockquote', 'bulletList', 'codeBlock', 'doc', 'hardBreak', 'heading', 'horizontalRule', 'image',
      'listItem', 'orderedList', 'paragraph', 'table', 'tableCell', 'tableHeader', 'tableRow',
      'taskItem', 'taskList', 'text',
    ]);
    expect(sorted(schema.marks)).toEqual(['bold', 'code', 'italic', 'link', 'strike', 'underline']);
  });

  it('has no table in the sidebar note', () => {
    const schema = getSchema(buildExtensions('', { tables: false }));
    expect(Object.keys(schema.nodes).filter((n) => n.startsWith('table'))).toEqual([]);
  });

  it('registers each extension once, and none of the ones StarterKit 3 added', () => {
    for (const list of [buildExtensions(''), chatExtensions()]) {
      const all = names(list);
      expect(all.filter((n, i) => all.indexOf(n) !== i)).toEqual([]);
      expect(all).not.toContain('trailingNode');
      expect(all).not.toContain('listKeymap');
    }
  });

  it('builds without tiptap warning about a duplicate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getSchema(buildExtensions(''));
    getSchema(chatExtensions());
    expect(warn.mock.calls.flat().join('\n')).not.toMatch(/duplicate/i);
    warn.mockRestore();
  });
});

describe('the chat box', () => {
  it('still has no underline, heading or rule', () => {
    const schema = getSchema(chatExtensions());
    expect(sorted(schema.marks)).toEqual(['bold', 'code', 'italic', 'link', 'strike']);
    expect(schema.nodes.heading).toBeUndefined();
    expect(schema.nodes.horizontalRule).toBeUndefined();
  });
});

describe('loading content into an editor', () => {
  const root = new URL('../renderer/src/', import.meta.url).pathname;
  const files = fs.readdirSync(root, { recursive: true })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => path.join(root, f));

  it('says every time whether it counts as an edit, because the default flipped in tiptap 3', () => {
    const calls = files.flatMap((f) => (fs.readFileSync(f, 'utf8').match(/setContent\([^;]*;/g) ?? [])
      .map((call) => `${path.relative(root, f)}: ${call}`));
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.filter((c) => !/emitUpdate:/.test(c))).toEqual([]);
  });
});
