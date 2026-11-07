// TWO WRITERS CHANGING DIFFERENT SENTENCES BOTH LAND.
//
// A person changed one sentence of a document five times and it kept going back:
// versions were whole files, so whichever writer saved last replaced the other.
// Markdown keeps a paragraph on one line, so a merge by lines calls two different
// sentences of one paragraph a clash. Measured on a 110 KB document with v13 and
// v14 each changing a different sentence of a paragraph. This merge goes by lines
// and then by words, and says when it could not tell what was meant.
import { describe, it, expect } from 'vitest';
import { changeSize, mergeText } from '../shared/text-merge.mjs';

const para = 'One sentence here. A second sentence there. A third one follows.';

describe('a merge', () => {
  it('keeps both sentences changed in one paragraph, the reported case', () => {
    const out = mergeText(para, 'One sentence CHANGED. A second sentence there. A third one follows.', 'One sentence here. A second sentence there. A third one REWRITTEN.');
    expect(out.text).toBe('One sentence CHANGED. A second sentence there. A third one REWRITTEN.');
    expect(out.clashes).toEqual([]);
  });
  it('keeps changes on different lines, and text added at each end', () => {
    expect(mergeText('a\nb\nc\n', 'a\nB\nc\n', 'a\nb\nc\nd\n').text).toBe('a\nB\nc\nd\n');
    expect(mergeText('a\nb\nc\n', 'z\na\nb\nc\n', 'a\nb\nC\n').text).toBe('z\na\nb\nC\n');
  });
  it('takes one change made the same way by both once', () => {
    const out = mergeText(para, para.replace('here', 'now'), para.replace('here', 'now'));
    expect(out.text).toBe(para.replace('here', 'now'));
    expect(out.clashes).toEqual([]);
  });
  it('gives back the other side when only one changed', () => {
    expect(mergeText(para, para, para.replace('here', 'now')).text).toBe(para.replace('here', 'now'));
    expect(mergeText(para, para.replace('here', 'now'), para).text).toBe(para.replace('here', 'now'));
  });
  it('honours a deletion by the writer who made it', () => {
    expect(mergeText('a\nb\nc\n', 'a\nc\n', 'a\nb\nc\nd\n').text).toBe('a\nc\nd\n');
  });
  it('reports the same words changed two ways and keeps the side it was told to', () => {
    const head = para.replace('here', 'over there');
    const mine = para.replace('here', 'right now');
    const a = mergeText(para, head, mine, { overlap: 'mine' });
    const b = mergeText(para, head, mine, { overlap: 'head' });
    expect(a.text).toBe(mine);
    expect(b.text).toBe(head);
    expect(a.clashes).toHaveLength(1);
    expect(a.clashes[0]).toMatchObject({ head: expect.stringContaining('over'), mine: expect.stringContaining('right') });
  });
  it('keeps a word put right beside a word the other side changed', () => {
    const out = mergeText('We need plan today', 'We need roadmap today', 'We need a plan today');
    expect(out.text).toBe('We need a roadmap today');
    expect(out.clashes).toEqual([]);
  });
  it('calls two different words put in the same spot a clash', () => {
    const out = mergeText('a b', 'a x b', 'a y b', { overlap: 'head' });
    expect(out.text).toBe('a x b');
    expect(out.clashes).toHaveLength(1);
  });
  it('does not stitch two rewrites of one paragraph word by word', () => {
    const head = 'Completely different words about another subject, nothing shared at all.';
    const mine = 'Yet another way to put it where few of the terms overlap whatsoever.';
    expect(mergeText(para, head, mine).clashes).toHaveLength(1);
  });
  it('says it could not tell when the place changed is repeated word for word', () => {
    const row = '| same | row | of | a | table | that | repeats | itself |\n';
    const base = row.repeat(6);
    const head = row.repeat(2) + row.replace('same', 'HEAD') + row.repeat(3);
    const mine = row.repeat(4) + row.replace('table', 'MINE') + row.repeat(1);
    expect(mergeText(base, head, mine).ambiguous).toBe(true);
  });
  it('is sure when the place changed is unique', () => {
    expect(mergeText('intro\nsame\nmiddle\nsame\nend\n', 'intro\nsame\nmiddle\nSAME\nend\n', 'INTRO\nsame\nmiddle\nsame\nend\n').ambiguous).toBe(false);
  });
  it('copes with nothing at all on any side', () => {
    expect(mergeText('', '', '').text).toBe('');
    expect(mergeText('', 'a', '').text).toBe('a');
    expect(mergeText('', '', 'b').text).toBe('b');
  });
});

describe('the founder\'s arithmetic: five agents and a person on one document', () => {
  const lines = Array.from({ length: 1500 }, (_, i) => `Paragraph ${i} of the long document, with enough words to look like one.`);
  const base = `${lines.join('\n')}\n`;
  it('merges a publish from each writer in order, each onto the result of the last, keeping all six', () => {
    let head = base;
    const t0 = performance.now();
    for (let w = 0; w < 6; w += 1) {
      // Each writer made 600 edits, ten a second for a minute, on its own copy of what it started from.
      let mine = base;
      for (let e = 0; e < 600; e += 1) mine = mine.replace(`Paragraph ${w * 200 + e % 150} of`, `Paragraph ${w * 200 + e % 150} (writer ${w}) of`);
      const out = mergeText(base, head, mine);
      expect(out.clashes).toEqual([]);
      head = out.text;
    }
    const took = performance.now() - t0;
    for (let w = 0; w < 6; w += 1) expect(head).toContain(`Paragraph ${w * 200 + 149} (writer ${w}) of`);
    expect(took).toBeLessThan(5000);
  });
  it('gives up on a difference too big to align rather than running on', () => {
    const other = Array.from({ length: 3000 }, (_, i) => `Nothing alike ${i}`).join('\n');
    const t0 = performance.now();
    expect(changeSize(base, other)).toBeGreaterThan(base.length / 2);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
