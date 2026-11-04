// One picture named in a sentence is drawn large under it.
//
// "Needs you: what waits on you. ... 1-needs-you.png" drew the picture in the
// media row under the sentence, and that row draws every picture 240px tall,
// so a 1200px-wide column showed a screenshot about 420px wide and every one
// had to be opened to be read. Measured in renderer/src/media-row.ts and the
// .media-row rule in styles.css. A lone picture under its sentence is now its
// own paragraph, drawn like a picture alone on its line; two or more still
// share a row.
//
// The whole column (1114px in a 1710px window) was then a tad too large, so a
// thread's picture stops at the sentences' 760px measure.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mediaUnderSentences, MEDIA_ROW, NAME_ONLY } from '../renderer/src/media-row';

const tree = (md) => { const t = fromMarkdown(md); mediaUnderSentences(t); return t; };
const isRow = (n) => n.data?.hProperties?.className === MEDIA_ROW;

describe('one picture named in a sentence', () => {
  const t = tree('Needs you: what waits on you. ![1-needs-you.png](designs/a/1-needs-you.png)');

  it('keeps the sentence whole, naming the picture', () => {
    expect(t.children[0].type).toBe('paragraph');
    expect(t.children[0].children.some((c) => c.data?.hProperties?.[NAME_ONLY] === '1')).toBe(true);
  });

  it('draws it under the sentence as a paragraph of its own, not in a row', () => {
    expect(t.children).toHaveLength(2);
    expect(isRow(t.children[1])).toBe(false);
    expect(t.children[1].type).toBe('paragraph');
    expect(t.children[1].children.map((c) => c.url)).toEqual(['designs/a/1-needs-you.png']);
  });

  it('the same for a path in code and a markdown link', () => {
    for (const md of ['See `shot.png` for it.', 'See [the shot](shot.png) for it.']) {
      const out = tree(md);
      expect(isRow(out.children[1]), md).toBe(false);
      expect(out.children[1].children[0].url ?? out.children[1].children[0].value, md).toBe('shot.png');
    }
  });
});

describe('what stays a row', () => {
  it('two pictures in one sentence', () => {
    const t = tree('Compare ![a](a.png) with ![b](b.png) here.');
    expect(isRow(t.children[1])).toBe(true);
  });

  it('one film in a sentence', () => {
    const t = tree('The clip `a.mp4` is short.');
    expect(isRow(t.children[1])).toBe(true);
  });

  it('a picture and a film in one sentence', () => {
    const t = tree('See `a.png` and `b.mp4` now.');
    expect(isRow(t.children[1])).toBe(true);
  });
});

describe('how wide a picture in a thread is drawn', () => {
  const css = fs.readFileSync(new URL('../renderer/src/workspace-navigation.css', import.meta.url), 'utf8');
  it('as wide as the sentences, never the whole column', () => {
    expect(css).toMatch(/\.workspace-layout \.focus \.markdown \.inline-image \{ max-width:min\(100%, 760px\); \}/);
  });
  it('the sentences still keep the same 760px measure', () => {
    expect(css).toMatch(/:not\(:has\(img, video, \.inline-media, \.inline-image\)\)\s*\{ max-width:760px; \}/);
  });
});
