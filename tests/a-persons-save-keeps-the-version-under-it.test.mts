// A PERSON'S SAVE KEEPS THE VERSION THAT LANDED UNDER IT.
//
// A sitting holds the version it opened on and saves after a pause, so a save on
// v13 after an agent's v14 wrote the typed words over everything and v14's changes
// left the newest version: the reported bug the other way round. Now the save merges
// with the newest version, and what the person typed wins where both touched the
// same words, since it is on their screen. A later save in the sitting starts from
// what the last one sent, or a word they deleted since would come back.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveNextVersion } from '../main/file-version.mts';
import { keptDraft } from '../renderer/src/edit-sitting.ts';

const doc = (a, b = 'b', c = 'c') => `${a}\n\n${b}\n\n${c}\n`;
let dir;
const put = (name, text) => { const p = `designs/w-1/${name}`; fs.mkdirSync(path.join(dir, 'designs/w-1'), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); return p; };
const agent = (p, ts) => ({ id: 'w-1', ts, source: 'agent', by: 'owner', patch: { result: `I wrote [x](${p}).` } });
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const save = (lines, basePath, text, more = {}) => saveNextVersion({ dir, threadId: 'w-1', lines, basePath, text, ...more });

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-')); });

describe('words a failed save kept', () => {
  const v1 = { path: 'a.md' }; const v2 = { path: 'a-v2.md' }; const v3 = { path: 'a-v3.md' };
  const held = (m) => (p) => m[p] ?? null;
  it('come back on the newest version though they were kept under the one the sitting opened on', () => {
    expect(keptDraft([v1, v2], v2, held({ 'a.md': 'words' }))).toEqual({ draft: 'words', base: v1 });
  });
  it('prefer the version nearest the one opened', () => {
    expect(keptDraft([v1, v2, v3], v3, held({ 'a.md': 'old', 'a-v2.md': 'newer' }))).toEqual({ draft: 'newer', base: v2 });
  });
  it('do not come from a version after the one opened', () => {
    expect(keptDraft([v1, v2], v1, held({ 'a-v2.md': 'later' }))).toBeNull();
  });
  it('are nothing when none were kept', () => {
    expect(keptDraft([v1], v1, held({}))).toBeNull();
  });
});

describe('a save from a sitting', () => {
  it('keeps an agent\'s version that landed under it, and the typed words', () => {
    const v1 = put('p.md', doc('a'));
    const v2 = put('p-v2.md', doc('a', 'b', 'agent'));
    const saved = save([agent(v1, 1), agent(v2, 2)], v1, doc('typed'));
    expect(read(saved.path)).toBe(doc('typed', 'b', 'agent'));
    expect(saved.merged).toBe(true);
    expect(saved.over).toBe('p-v2.md');
  });
  it('lets the typed words win where both changed the same words, and counts it', () => {
    const v1 = put('p.md', doc('a'));
    const v2 = put('p-v2.md', doc('agent'));
    const saved = save([agent(v1, 1), agent(v2, 2)], v1, doc('typed'));
    expect(read(saved.path)).toBe(doc('typed'));
    expect(saved.clashes).toBe(1);
  });
  it('writes the words as they are when nothing landed under it', () => {
    const v1 = put('p.md', doc('a'));
    const saved = save([agent(v1, 1)], v1, doc('typed'));
    expect(read(saved.path)).toBe(doc('typed'));
    expect(saved.merged).toBeUndefined();
  });
  it('a word deleted since the last save stays deleted', () => {
    const v1 = put('p.md', doc('a'));
    const first = save([agent(v1, 1)], v1, doc('a word'));
    const lines = [agent(v1, 1), { id: 'w-1', ts: 2, source: 'founder', by: 'owner', patch: { artifact: { do: 'edit', file: 'p.md', path: first.path } } }];
    const second = save(lines, v1, doc('a'), { since: doc('a word') });
    expect(read(second.path)).toBe(doc('a'));
  });
  it('and an agent\'s change stays as well, across two saves of one sitting', () => {
    const v1 = put('p.md', doc('a'));
    const v2 = put('p-v2.md', doc('a', 'b', 'agent'));
    const lines = [agent(v1, 1), agent(v2, 2)];
    const first = save(lines, v1, doc('a word'));
    lines.push({ id: 'w-1', ts: 3, source: 'founder', by: 'owner', patch: { artifact: { do: 'edit', file: 'p.md', path: first.path } } });
    const second = save(lines, v1, doc('a'), { since: doc('a word') });
    expect(read(second.path)).toBe(doc('a', 'b', 'agent'));
  });
  it('a teammate\'s later save with no record of the last one, all theirs, is taken whole', () => {
    const v1 = put('p.md', doc('a'));
    const first = save([agent(v1, 1)], v1, doc('a word'));
    const lines = [agent(v1, 1), { id: 'w-1', ts: 2, source: 'founder', by: 'maya', patch: { artifact: { do: 'edit', file: 'p.md', path: first.path } } }];
    const second = save(lines, v1, doc('a'), { by: 'maya' });
    expect(read(second.path)).toBe(doc('a'));
  });
  it('restoring an older version is taken whole, since it is based on the newest', () => {
    const v1 = put('p.md', doc('a'));
    const v2 = put('p-v2.md', doc('z'));
    const saved = save([agent(v1, 1), agent(v2, 2)], v2, doc('a'));
    expect(read(saved.path)).toBe(doc('a'));
  });
  it('still saves if the version under it cannot be read', () => {
    const v1 = put('p.md', doc('a'));
    const saved = save([agent(v1, 1), agent('designs/w-1/p-v2.md', 2)], v1, doc('typed'));
    expect(read(saved.path)).toBe(doc('typed'));
  });
});
