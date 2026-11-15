// A SAVE THAT CHANGES NOTHING MAKES NO VERSION.
//
// In a live document everyone holds the same words, and the copy that saves
// them can change hands: a teammate who keeps the file saves as they leave, the
// next keeper saves as it takes over. Measured on 2026-11-08 with three testers
// on one team: closing the launch plan put two identical "Updated
// launch-plan.md" messages on the owner's thread and a new version beside it,
// though nobody had typed since the last save. Words equal to the newest
// version's now save nothing and say so, and words that differ by one letter
// still make the next version.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveNextVersion } from '../main/file-version.mts';

const said = { id: 'w-1', ts: 1, source: 'agent', by: 'owner', patch: { result: 'I wrote [plan.md](designs/w-1/plan.md).' } };
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unchanged-'));
  fs.mkdirSync(path.join(dir, 'designs/w-1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'designs/w-1/plan.md'), '# Plan\n\nWe launch Tuesday.\n');
});
const files = () => fs.readdirSync(path.join(dir, 'designs/w-1')).sort();

describe('saving the next version', () => {
  it('writes nothing when the words are the newest version\'s', () => {
    const out = saveNextVersion({ dir, threadId: 'w-1', lines: [said], baseId: 'plan.md', text: '# Plan\n\nWe launch Tuesday.\n', by: 'ana' });
    expect(out).toMatchObject({ ok: true, unchanged: true, path: 'designs/w-1/plan.md' });
    expect(files()).toEqual(['plan.md']);
  });

  it('writes nothing for the same words saved twice in a row', () => {
    const first = saveNextVersion({ dir, threadId: 'w-1', lines: [said], baseId: 'plan.md', text: '# Plan\n\nWe launch Monday.\n', by: 'ana' });
    const lines = [said, { id: 'w-1', ts: 2, source: 'founder', by: 'ana', patch: { artifact: { do: 'edit', file: 'plan.md', path: first.path } } }];
    const again = saveNextVersion({ dir, threadId: 'w-1', lines, baseId: 'plan.md', text: '# Plan\n\nWe launch Monday.\n', by: 'jordan' });
    expect(again).toMatchObject({ ok: true, unchanged: true, path: first.path });
    expect(files()).toEqual(['plan-v2.md', 'plan.md']);
  });

  it('still makes the next version for words one letter apart', () => {
    const out = saveNextVersion({ dir, threadId: 'w-1', lines: [said], baseId: 'plan.md', text: '# Plan\n\nWe launch Tuesday!\n', by: 'ana' });
    expect(out).toMatchObject({ ok: true, path: 'designs/w-1/plan-v2.md' });
    expect(out.unchanged).toBeUndefined();
  });
});

describe('the places a version is announced', () => {
  it('post nothing for a save that changed nothing', () => {
    const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
    expect(read('main/team/thread-share.mts')).toMatch(/if \(saved\.unchanged\) continue;/);
    expect(read('main/files-place.mts')).toMatch(/if \(saved\.unchanged\) return \{ ok: true, path: saved\.path \};/);
  });
});
