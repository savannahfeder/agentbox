// CODE WRITTEN UNDER A BULLET IS DRAWN AS CODE.
//
// Test day 2026-11-18: an agent documented an API with each endpoint as a
// bullet and its curl and JSON examples fenced beneath it, indented two
// spaces, as Markdown nests them. The docs pane drew loose backticks, "bash"
// and "json" as words, and every line of the command as inline code. Read
// through `mdToPmDoc`, the item held paragraphs only: an indented line under
// a bullet was always more of its sentence, trimmed of its indent.
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { buildExtensions } from '../renderer/src/editor/extensions.ts';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown.ts';

const CODE_IN_A_BULLET = [
  '- `POST /appointments` creates an appointment.',
  '',
  '  Send `who`, `start` and `end`.',
  '',
  '  ```bash',
  "  curl -i -X POST 'http://localhost:3000/appointments' \\",
  "    -H 'Content-Type: application/json'",
  '',
  "    --data '{}'",
  '  ```',
  '',
  '  Response: `201 Created`.',
  '- `GET /appointments` lists them.',
  '',
  'After the list.',
  '',
].join('\n');

const itemsOf = (doc) => doc.content[0].content;
const textOf = (node) => (node.content ?? []).map((t) => t.text ?? '').join('');

describe('code under a bullet', () => {
  it('is a code block inside that bullet, its own lines and indents kept', () => {
    const item = itemsOf(mdToPmDoc(CODE_IN_A_BULLET))[0];
    expect(item.content.map((n) => n.type)).toEqual(['paragraph', 'codeBlock', 'paragraph']);
    expect(item.content[1].attrs).toEqual({ language: 'bash' });
    expect(textOf(item.content[1])).toBe([
      "curl -i -X POST 'http://localhost:3000/appointments' \\",
      "  -H 'Content-Type: application/json'",
      '',
      "  --data '{}'",
    ].join('\n'));
    expect(JSON.stringify(item.content[2])).toContain('Response: ');
  });

  it('does not read a bullet inside the code as an item of the list', () => {
    const md = '- Run this:\n  ```\n  - not an item\n  ```\n- Next item\n';
    const items = itemsOf(mdToPmDoc(md));
    expect(items).toHaveLength(2);
    expect(textOf(items[0].content[1])).toBe('- not an item');
  });

  it('is one the full editor accepts, so the pane opens rather than failing', () => {
    const schema = getSchema(buildExtensions('Write anything…'));
    expect(() => schema.nodeFromJSON(mdToPmDoc(CODE_IN_A_BULLET)).check()).not.toThrow();
  });

  it('is written back as the same fenced code under the same bullet, and settles', () => {
    const once = pmDocToMd(mdToPmDoc(CODE_IN_A_BULLET));
    expect(once).toContain([
      '  ```bash',
      "  curl -i -X POST 'http://localhost:3000/appointments' \\",
      "    -H 'Content-Type: application/json'",
      '',
      "    --data '{}'",
      '  ```',
    ].join('\n'));
    expect(pmDocToMd(mdToPmDoc(once))).toBe(once);
  });

  it('still reads fenced code at the top level as before', () => {
    const doc = mdToPmDoc('```json\n{"a": 1}\n```\n');
    expect(doc.content.map((n) => n.type)).toEqual(['codeBlock']);
  });
});
