// A TABLE WRITTEN UNDER A BULLET IS DRAWN AS A TABLE.
//
// An agent wrote a document with a bullet ending in a colon and a pipe table
// indented beneath it. The docs pane drew every row as a line of text, pipes
// and dashes included, because the markdown reader only knew tables at the
// top level: an indented line under a bullet was always more of the bullet's
// sentence. Measured by reading that shape through `mdToPmDoc`: the list item
// held one paragraph with the table's rows as line breaks.
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { buildExtensions } from '../renderer/src/editor/extensions.ts';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown.ts';

const TABLE_IN_A_BULLET = [
  '- Then: only the $200 plan loses money.',
  '- For you, the plans as they are set in the code (`plans.mjs`):',
  '  | Plan | Price | Agents at once |',
  '  |---|---|---|',
  '  | Free | $0 | 2 |',
  '  | Pro | $40 | 10 |',
  '  Waiting for your reply costs nothing.',
  '',
  'After the list.',
  '',
].join('\n');

const itemsOf = (doc) => doc.content[0].content;
const textOf = (node) => JSON.stringify(node).match(/"text":"[^"]*"/g)?.map((t) => t.slice(8, -1)).join('') ?? '';

describe('a table under a bullet', () => {
  it('is a table inside that bullet, between its sentence and the line after it', () => {
    const doc = mdToPmDoc(TABLE_IN_A_BULLET);
    const item = itemsOf(doc)[1];
    expect(item.content.map((n) => n.type)).toEqual(['paragraph', 'table', 'paragraph']);
    const [header, ...rows] = item.content[1].content;
    expect(header.content.map(textOf)).toEqual(['Plan', 'Price', 'Agents at once']);
    expect(rows.map((r) => r.content.map(textOf))).toEqual([['Free', '$0', '2'], ['Pro', '$40', '10']]);
    expect(textOf(item.content[2])).toBe('Waiting for your reply costs nothing.');
    expect(doc.content[1]).toMatchObject({ type: 'paragraph' });
  });

  it('is a table when it is the last thing in the bullet, after a blank line', () => {
    const md = '- The plans:\n\n  | Plan | Price |\n  |---|---|\n  | Pro | $40 |\n';
    const item = itemsOf(mdToPmDoc(md))[0];
    expect(item.content.map((n) => n.type)).toEqual(['paragraph', 'table']);
  });

  it('is one the full editor accepts, so the pane opens rather than failing', () => {
    const schema = getSchema(buildExtensions('Write anything…'));
    expect(() => schema.nodeFromJSON(mdToPmDoc(TABLE_IN_A_BULLET)).check()).not.toThrow();
  });

  it('is written back as the same table under the same bullet, and settles', () => {
    const once = pmDocToMd(mdToPmDoc(TABLE_IN_A_BULLET));
    expect(once).toContain('  | Plan | Price | Agents at once |\n  | --- | --- | --- |\n  | Free | $0 | 2 |');
    expect(once).toContain('|\n  Waiting for your reply costs nothing.');
    expect(pmDocToMd(mdToPmDoc(once))).toBe(once);
  });

  it('leaves pipes in a bullet alone when no divider row follows them', () => {
    const md = '- a | b | c\n  | not | a table |\n  more words\n';
    const item = itemsOf(mdToPmDoc(md))[0];
    expect(item.content.map((n) => n.type)).toEqual(['paragraph']);
  });

  it('still reads a table at the top level as before', () => {
    const doc = mdToPmDoc('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(doc.content.map((n) => n.type)).toEqual(['table']);
  });
});
