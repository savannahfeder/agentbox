// An agent's "I made chart.png, report.pdf and clip.mp4 in your working folder."
// was cut into four fragments around a full-width picture and a full-width player,
// measured in feedback-audit/05-thread-picture-video-inline.png. Now the sentence
// stays whole, naming each file, and what plays or draws sits in one row under it.
import { describe, it, expect } from 'vitest';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mediaUnderSentences, MEDIA_ROW, NAME_ONLY } from '../renderer/src/media-row';
import fs from 'node:fs';
import path from 'node:path';

const tree = (md) => { const t = fromMarkdown(md); mediaUnderSentences(t); return t; };
const isRow = (n) => n.data?.hProperties?.className === MEDIA_ROW;
const named = (n) => n.data?.hProperties?.[NAME_ONLY] === '1';
const textOf = (n) => (n.children ?? []).map((c) => c.value ?? textOf(c)).join('');
const inRow = (n) => n.children.map((c) => c.url ?? c.value);

describe('a sentence naming several files', () => {
  const t = tree('I made `chart.png`, `report.pdf` and `clip.mp4` in your working folder.');
  it('stays one paragraph that reads whole', () => {
    expect(t.children[0].type).toBe('paragraph');
    expect(textOf(t.children[0])).toBe('I made chart.png, report.pdf and clip.mp4 in your working folder.');
    expect(isRow(t.children[0])).toBe(false);
  });
  it('names what moved as a name that opens it', () => {
    expect(t.children[0].children.filter(named).map((c) => c.url)).toEqual(['chart.png', 'clip.mp4']);
  });
  it('puts what draws or plays in one row right under it', () => {
    expect(isRow(t.children[1])).toBe(true);
    expect(inRow(t.children[1])).toEqual(['chart.png', 'clip.mp4']);
    expect(t.children[1].data.hName).toBe('div');
  });
  it('leaves a PDF as its name, since it is a tile under the message', () => {
    expect(inRow(t.children[1])).not.toContain('report.pdf');
    expect(t.children[0].children.find((c) => c.value === 'report.pdf').type).toBe('inlineCode');
  });
});

describe('the other shapes', () => {
  it('a markdown link and a picture in a sentence move the same way', () => {
    const t = tree('See [the shot](a.png) and ![it](b.webp) for detail.');
    expect(inRow(t.children[1])).toEqual(['a.png', 'b.webp']);
    expect(textOf(t.children[0])).toContain('the shot');
    expect(textOf(t.children[0])).toContain('it');
  });
  it('two pictures on a line of their own become a row with no sentence left over', () => {
    const t = tree('![a](a.png) ![b](b.png)');
    expect(t.children).toHaveLength(1);
    expect(isRow(t.children[0])).toBe(true);
    expect(inRow(t.children[0])).toEqual(['a.png', 'b.png']);
  });
  it('a sentence in a list keeps its row in the list', () => {
    const t = tree('- The clip `a.mp4` is short.');
    const item = t.children[0].children[0];
    expect(item.children).toHaveLength(2);
    expect(isRow(item.children[1])).toBe(true);
  });
});

describe('what must not change', () => {
  it('one picture alone on its line is left to draw large', () => {
    const t = tree('![a](a.png)');
    expect(t.children).toHaveLength(1);
    expect(isRow(t.children[0])).toBe(false);
    expect(t.children[0].children[0].type).toBe('image');
  });
  it('a sentence with no media is left alone', () => {
    const md = 'Read `src/app.ts` and [the docs](https://x.test/a.png).';
    expect(tree(md)).toEqual(fromMarkdown(md));
  });
  it('a web address that ends like a picture stays a link', () => {
    expect(tree('See [this](https://x.test/a.png) now.').children).toHaveLength(1);
  });
  it('code that only looks like a file, in a fence, is not touched', () => {
    expect(tree('```\nclip.mp4\n```').children).toHaveLength(1);
  });
  it('a voice note stays where it is, since it is a message of its own', () => {
    const t = tree('Listen to [note](attachments/voice-note-1200.webm) now.');
    expect(t.children).toHaveLength(1);
  });
});

describe('the thread draws it', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it('runs after paths are made links, and honours a name', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/remarkArtifactPaths, \{[^}]*\}\], remarkMediaUnderSentences\]/);
    expect(focus).toContain(`'data-name-only'`);
  });
});
