// A FILE NAMED IN A THREAD READS AS ITS NAME, NOT A DISK PATH.
//
// Maya's thread showed "Notes on
// designs/w-e6b4931021/lumen-launch-posts-v4.md", "a computer path", and Sofia's
// read "Notes on /Users/.../store/accounts/.../designs/w-f9685b42f1/
// group-seat-picker-v4.png". Measured from the code: a path named in a sentence
// became a link whose words were the whole path. The link now reads as the
// file's name and still opens the path; a picture is still drawn.
import { describe, it, expect } from 'vitest';
import { linkArtifactPaths } from '../renderer/src/remark-artifact-paths.ts';

const para = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const text = (value) => ({ type: 'text', value });
const only = (tree) => tree.children[0].children;
const run = (value, opts) => { const tree = para(text(value)); linkArtifactPaths(tree, opts); return only(tree); };
const linkWords = (nodes) => nodes.filter((n) => n.type === 'link').map((n) => [n.url, n.children.map((c) => c.value).join('')]);

const DIR = '/Users/you/Zero/accounts/acct/company';

describe('a path in a sentence', () => {
  it("reads as the file's name and opens the path", () => {
    expect(linkWords(run('Notes on designs/w-e6b4931021/lumen-launch-posts-v4.md: tighten it'))).toEqual([
      ['designs/w-e6b4931021/lumen-launch-posts-v4.md', 'lumen-launch-posts-v4.md'],
    ]);
  });
  it('a full path inside the project reads as the name too', () => {
    expect(linkWords(run(`Saved at ${DIR}/designs/w-3a/changes.md now.`, { dir: DIR }))).toEqual([
      ['designs/w-3a/changes.md', 'changes.md'],
    ]);
  });
  it('a bare name stays as it is', () => {
    expect(linkWords(run('See changes.md for the list.'))).toEqual([['changes.md', 'changes.md']]);
  });
  it('a picture is still drawn, not linked as words', () => {
    const nodes = run('Here: designs/w-f9/group-seat-picker-v4.png');
    expect(nodes.filter((n) => n.type === 'image').map((n) => n.url)).toEqual(['designs/w-f9/group-seat-picker-v4.png']);
    expect(linkWords(nodes)).toEqual([]);
  });
  it('a local address keeps its words', () => {
    expect(linkWords(run('Open localhost:3000/a.html'))).toEqual([['http://localhost:3000/a.html', 'localhost:3000/a.html']]);
  });
});

describe('a markdown link that spells out its own path', () => {
  it("reads as the file's name", () => {
    const tree = para({ type: 'link', url: 'designs/w-1/plan.md', children: [text('designs/w-1/plan.md')] });
    linkArtifactPaths(tree);
    expect(linkWords(only(tree))).toEqual([['designs/w-1/plan.md', 'plan.md']]);
  });
  it('keeps words that are not the path', () => {
    const tree = para({ type: 'link', url: 'designs/w-1/plan.md', children: [text('the plan')] });
    linkArtifactPaths(tree);
    expect(linkWords(only(tree))).toEqual([['designs/w-1/plan.md', 'the plan']]);
  });
  it('leaves a web address as it was written', () => {
    const tree = para({ type: 'link', url: 'https://example.com/a/b.md', children: [text('https://example.com/a/b.md')] });
    linkArtifactPaths(tree);
    expect(linkWords(only(tree))).toEqual([['https://example.com/a/b.md', 'https://example.com/a/b.md']]);
  });
});
