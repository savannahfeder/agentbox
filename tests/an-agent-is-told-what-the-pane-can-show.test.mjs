// AN AGENT IS TOLD WHAT THE PANE CAN SHOW, AND THE LAYOUT IS ITS OWN.
//
// What broke (w-630e526abe, 2026-10-07): a run comparing three designs wrote
// all three explanations first and stacked the screenshots underneath, so
// comparing meant scrolling back up to match words to pictures. Runs that did
// try to put words beside pictures named the path inside a sentence or a
// bullet, and the picture, which draws as a block, split the line.
//
// Measured by reading the shipped rule: its one paragraph about pictures said
// where to save them and to name them "one per line", and nothing about what
// the pane does with them. A first fix prescribed a caption-then-picture
// format. The person who asked turned it down: agents lay out an html page of
// options well when left alone, so the gap is that they are never told what the
// message can draw. So the rule now lists what the pane shows and leaves the
// arrangement to the agent. These tests hold that list, and hold each claim in
// it against the renderer, so the rule cannot drift from what is true.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { linkArtifactPaths } from '../renderer/src/remark-artifact-paths.ts';
import { opensOnItsOwn } from '../renderer/src/message-artifacts.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, 'briefs/message-rules.md'), 'utf8');
const flat = rules.replace(/\s+/g, ' ');
const dir = '/Users/someone/store/acme';

const drawn = (markdown) => {
  const tree = unified().use(remarkParse).parse(markdown);
  linkArtifactPaths(tree, { dir });
  return tree;
};

describe('the rule tells an agent what the pane can show', () => {
  it('says a picture is drawn where it is named, and splits a sentence it sits in', () => {
    expect(flat).toMatch(/A picture's path, anywhere in the message, is drawn right there/);
    expect(flat).toMatch(/inside a sentence or a bullet it splits the line/);
  });

  it('says a folder on its own line draws its pictures, and a design page opens beside', () => {
    expect(flat).toMatch(/A folder's path on a line of its own draws its newest six pictures/);
    expect(flat).toMatch(/An html page in designs\/ opens beside the message by itself/);
  });

  it('leaves the arrangement to the agent instead of prescribing a format', () => {
    expect(flat).toMatch(/The arrangement is yours/);
    expect(flat).not.toMatch(/\*\*A\. The first one's name/);
    expect(flat).not.toMatch(/one per line/);
  });

  it('still says where a picture is saved, and that /tmp is never drawn', () => {
    expect(flat).toMatch(/in designs\/ under this task's id/);
    expect(flat).toMatch(/never in \/tmp/);
  });
});

describe('each claim in it is true of the renderer', () => {
  it('words, picture, words, picture draws in that order', () => {
    const tree = drawn([
      'The first one keeps the list.', `${dir}/designs/w-1/a.png`, '',
      'The second one drops it.', `${dir}/designs/w-1/b.png`,
    ].join('\n'));
    const kinds = tree.children.flatMap((p) => p.children
      .filter((k) => !(k.type === 'text' && !k.value.trim()))
      .map((k) => k.type));
    expect(kinds).toEqual(['text', 'image', 'text', 'image']);
  });

  it('a picture in the middle of a sentence splits it', () => {
    const kids = drawn(`Here is A ${dir}/designs/w-1/a.png which does the thing.`).children[0].children;
    expect(kids.map((k) => k.type)).toEqual(['text', 'image', 'text']);
  });

  it('a folder alone on a line becomes a folder link, and one mid-sentence does not', () => {
    const alone = drawn(`${dir}/designs/w-1`).children[0].children;
    expect(alone.map((k) => [k.type, k.url])).toEqual([['link', 'designs/w-1/']]);
    const inline = drawn(`I put them in ${dir}/designs/w-1 for you.`).children[0].children;
    expect(inline.some((k) => k.type === 'link')).toBe(false);
  });

  it('an html page in designs/ opens on its own, and a report page does not', () => {
    expect(opensOnItsOwn('designs/w-1/options.html')).toBe(true);
    expect(opensOnItsOwn('reports/w-1/summary.html')).toBe(false);
  });
});
