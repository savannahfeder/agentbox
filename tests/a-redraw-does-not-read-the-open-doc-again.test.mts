// A REDRAW DID NOT NEED TO READ THE OPEN DOC AGAIN, AND IT DID, TWICE.
// While an agent works the app redraws up to two and a half times a second,
// and each redraw of an open markdown file parsed the whole file twice and
// wrote it back out once, then threw all three away: a ref's first value and
// the editor's starting words were worked out on every render, though only
// the first render and a new editor use them. Measured with
// renderer/src/editor/markdown.ts: 5 ms a redraw for a 26 KB doc, 9.5 ms for
// 104 KB. In a profile of the built app refreshing every 400 ms with a doc
// open, mdToPmDoc and runMd ran on every refresh.
// No jsdom here, so the wiring is read from source, as the other DocText tests do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../renderer/src/components/DocText.tsx', import.meta.url), 'utf8');

describe('the open doc is read', () => {
  it('once for the baseline a save is measured against', () => {
    expect(src).toMatch(/useState\(\(\) => pmDocToMd\(mdToPmDoc\(text\)\)\)/);
    expect(src).not.toMatch(/useRef\(pmDocToMd\(mdToPmDoc\(/);
  });

  it('once for each editor made, for the words it starts with', () => {
    expect(src).toMatch(/useMemo\(\(\) => \(collab \? null : mdToPmDoc\(versions\?\.draft \?\? text\)\), \[extensions\]\)/);
    const options = src.slice(src.indexOf('useEditor({'), src.indexOf('}, [extensions]);'));
    expect(options).not.toMatch(/mdToPmDoc\(/);
  });

  it('again whenever the file on disk changes under it', () => {
    expect(src).toMatch(/const doc = mdToPmDoc\(text\);\n\s*onDisk\.current = text;\n\s*editor\.commands\.setContent\(doc, \{ emitUpdate: false \}\);/);
  });
});
