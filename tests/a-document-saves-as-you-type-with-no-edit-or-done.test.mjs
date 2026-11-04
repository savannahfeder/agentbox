// A DOCUMENT SAVES AS YOU TYPE, WITH NO EDIT OR DONE.
//
// Someone editing a document in the big view pressed Done and often found their
// changes gone, and asked for it to work like Notion or Google Docs: type, and
// it saves. Measured from the code: after Done the view waited for the family to
// hold more versions than the edited version's NUMBER. Numbers come from the
// file's version line and can run ahead of what the thread holds (an agent that
// wrote over one path three times gives one version numbered 3), so the new
// version never counted as arrived and the view stayed on the old words.
// Reproduced with the real save code: a document at v3 on a thread holding one
// version, saved, gave a family of two, and 2 > 3 never came true.
//
// Now the newest version opens ready to type, there is no Edit or Done, the
// words are kept as they are typed and become the next version on a pause, on
// leaving or on looking away, and the view waits on the count it saw.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { filesInLines, threadFiles } from '../shared/artifact-marks.mjs';
import { opensForTyping, savedVersionArrived, wordsToSave } from '../renderer/src/edit-sitting.ts';

const view = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
const between = (a, b) => view.slice(view.indexOf(a), view.indexOf(b, view.indexOf(a)));

describe('the saved version reaching the view', () => {
  const said = { id: 'w-1', ts: 1, source: 'agent', patch: { note: 'Here: [accepted.md](accepted.md)' } };
  const edit = { id: 'w-1', ts: 2, source: 'founder', patch: { artifact: { do: 'edit', file: 'accepted.md', path: 'designs/w-1/accepted-v2.md' } } };
  // The line numbered the agent's third write of accepted.md as 3, and the edit as 4.
  const numbers = { 'accepted.md': 3, 'designs/w-1/accepted-v2.md': 4 };
  const [before] = threadFiles(filesInLines([said]), numbers);
  const [after] = threadFiles(filesInLines([said, edit]), numbers);

  it('arrives when the family holds more versions than when it was saved', () => {
    expect(before.versions.map((v) => v.n)).toEqual([3]);
    expect(savedVersionArrived(after, before.versions.length)).toBe(true);
  });
  it('waiting on the version number instead never arrives: the bug', () => {
    expect(savedVersionArrived(after, before.versions.at(-1).n)).toBe(false);
  });
  it('has not arrived while the family is the same size', () => {
    expect(savedVersionArrived(before, before.versions.length)).toBe(false);
    expect(savedVersionArrived(undefined, 0)).toBe(false);
  });
  it('the view waits on the count, in a save and in a restore', () => {
    expect(view).not.toMatch(/count: editing\.base\.n/);
    expect(view).toMatch(/setSavedIn\(\{ fi: at\.fi, count: family\.versions\.length \}\)/);
    expect(view).toMatch(/savedVersionArrived\(families\[savedIn\.fi\], savedIn\.count\)/);
  });
});

describe('opening a document from its thread', () => {
  const focus = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/Focus.tsx'), 'utf8');
  it('a name pressed in the answer opens the newest edit', () => {
    expect(focus).toContain("if (goes === 'pane') { onOpenDoc?.(newestOfFamily(href, edits)); return; }");
    expect(focus).toMatch(/markdownActions\.current = \{[^}]*edits: item\.artifacts\?\.edits/);
  });
  it('a press on a file with no edits opens the file it names', async () => {
    const { newestOfFamily } = await import('../shared/artifact-marks.mjs');
    expect(newestOfFamily('docs/plan.md', [])).toBe('docs/plan.md');
    expect(newestOfFamily('docs/plan.md', [{ path: 'designs/w-1/plan-v2.md' }])).toBe('designs/w-1/plan-v2.md');
    expect(newestOfFamily('docs/other.md', [{ path: 'designs/w-1/plan-v2.md' }])).toBe('docs/other.md');
  });
});

describe('what a save posts', () => {
  it('the typed words', () => {
    expect(wordsToSave({ typed: 'new', posted: null, original: 'old' })).toBe('new');
  });
  it('nothing when nothing was typed', () => {
    expect(wordsToSave({ typed: null, posted: null, original: 'old' })).toBeNull();
  });
  it('nothing when the words were already saved', () => {
    expect(wordsToSave({ typed: 'new', posted: 'new', original: 'old' })).toBeNull();
  });
  it('the original words when they were typed back after a save', () => {
    expect(wordsToSave({ typed: null, posted: 'new', original: 'old' })).toBe('old');
  });
});

describe('opening for typing', () => {
  const base = { canEdit: true, compare: false, editing: false, unreadable: null, version: 'a.md' };
  it('the newest document opens ready to type', () => {
    expect(opensForTyping(base)).toBe(true);
  });
  it('not an older version, side by side, or one already open', () => {
    expect(opensForTyping({ ...base, canEdit: false })).toBe(false);
    expect(opensForTyping({ ...base, compare: true })).toBe(false);
    expect(opensForTyping({ ...base, editing: true })).toBe(false);
  });
  it('not a version that could not be read, though the next one can', () => {
    expect(opensForTyping({ ...base, unreadable: 'a.md' })).toBe(false);
    expect(opensForTyping({ ...base, unreadable: 'b.md' })).toBe(true);
  });
});

describe('the view', () => {
  it('has no Edit or Done button', () => {
    expect(view).not.toMatch(/\/>Edit<\/button>/);
    expect(view).not.toMatch(/>Done<\/button>/);
  });
  it('saves on leaving rather than asking, and leaves only once it saved', () => {
    const leave = between('const leave = ()', 'const liveQuotes');
    expect(leave).not.toContain('setLeaveAsked');
    expect(leave).toMatch(/endSitting\(\)\.then\(\(ok\) => \{ if \(ok\) onClose\(\); \}\)/);
    expect(view).not.toContain('>Discard</button>');
  });
  it('saves before stepping to another file or version, or side by side', () => {
    expect(between('const stepFile', 'const stepVersion')).toContain('away(');
    expect(between('const stepVersion', '// Escape first')).toContain('away(');
    expect(view).toMatch(/away\(\(\) => setCompare\(true\)\)/);
  });
  it('saves when the window loses focus', () => {
    expect(view).toMatch(/addEventListener\('blur', saveNow\)/);
  });
  it('"Show v4" on an older version can be pressed, though the line it sits on lets presses through', () => {
    const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/artifact-view.css'), 'utf8');
    expect(css).toMatch(/\.av-told \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.av-told \.av-btn \{[^}]*pointer-events: auto/);
  });
  it('words typed into the document can still be commented on', () => {
    expect(between('{editing && !compare && (', '{version && !compare && !editing')).toContain('<SelectionBar');
  });
});
