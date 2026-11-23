// A LINKED FILE'S NAME IS NOT A SECOND FILE.
//
// `[qa-share-doc-v2.md](designs/w-1/qa-share-doc-v2.md)` read as two files: the
// link's target, and its words, which the bare-path scan took for a path at the
// top of the folder. The phone drew "Open qa-share-doc-v2.md" twice in a row at
// the foot of the thread (QA M-56, 2026-11-14).
import { describe, it, expect } from 'vitest';
import { referencedFiles } from '../shared/referenced-files.mts';

describe('a markdown link to a file', () => {
  it('is its target only, when its words are the file name', () => {
    expect(referencedFiles('Saved [qa-share-doc-v2.md](designs/w-1/qa-share-doc-v2.md), from [qa-share-doc.md](qa-share-doc.md).'))
      .toEqual(['designs/w-1/qa-share-doc-v2.md', 'qa-share-doc.md']);
  });

  it('is its target only, when the target is written in full inside the folder', () => {
    expect(referencedFiles('[notes/a.md](/home/u/docs/notes/b.md)', { dir: '/home/u/docs' })).toEqual(['notes/b.md']);
  });

  it('is nothing, when its words name a file and it points at a website', () => {
    expect(referencedFiles('[report.md](https://example.com/report.md)')).toEqual([]);
  });

  it('leaves the same name in plain words beside it as a file', () => {
    expect(referencedFiles('[the doc](designs/a.md) and later.md')).toEqual(['designs/a.md', 'later.md']);
  });
});
