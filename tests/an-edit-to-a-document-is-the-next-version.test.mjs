// The big viewer could read a document and not edit it: Approve, Open outside and
// comments were the only controls on a thread, measured on screen, and a group's
// Edit opened a raw markdown box. Now a save writes the next version beside the
// file through the version chain, marks it as an edit by whoever saved, and a
// second person's save is kept beside the first and said out loud. A person who
// cannot read the file cannot edit it, and an agent is pointed at the new version.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanMark, editClash, editedFilesLine, filesInLines, marksOf, newestOfFamily, sharedByWords, threadFiles } from '../shared/artifact-marks.mjs';
import { saveNextVersion } from '../main/file-version.mjs';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const said = (over = {}) => ({ id: 'w-1', ts: 1, source: 'agent', by: 'owner', patch: { result: 'I wrote [plan.md](designs/w-1/plan.md).' }, ...over });
const edit = (over = {}) => ({ id: 'w-1', ts: 2, source: 'founder', by: 'maya', patch: { artifact: { do: 'edit', file: 'plan.md', path: 'designs/w-1/plan-v2.md' } }, ...over });

describe('an edit as a mark', () => {
  it('reads back with where the new version is', () => {
    expect(cleanMark({ do: 'edit', file: 'plan.md', path: 'designs/w-1/plan-v2.md' })).toEqual({ do: 'edit', file: 'plan.md', path: 'designs/w-1/plan-v2.md' });
  });
  it('from a teammate carries the words instead', () => {
    expect(cleanMark({ do: 'edit', file: 'plan.md', text: '# Plan' })).toEqual({ do: 'edit', file: 'plan.md', text: '# Plan' });
  });
  it('cannot name a place outside the project, or a kind that is not a document', () => {
    for (const p of ['../../.ssh/id_rsa.md', '/etc/passwd.md', 'designs/../../x.md', 'designs/w-1/a.png']) {
      expect(cleanMark({ do: 'edit', file: 'plan.md', path: p })).toBeUndefined();
    }
  });
  it('cannot be empty, or too big for the cloud to carry', () => {
    expect(cleanMark({ do: 'edit', file: 'plan.md', text: '   ' })).toBeUndefined();
    expect(cleanMark({ do: 'edit', file: 'plan.md', text: 'x'.repeat(21_000) })).toBeUndefined();
    expect(cleanMark({ do: 'edit', file: 'plan.md', text: 'é'.repeat(11_000) })).toBeUndefined();
    expect(cleanMark({ do: 'edit', file: 'plan.md', text: 'x'.repeat(19_000) })).toBeTruthy();
  });
});

describe('in the version chain', () => {
  it('is the next version of the same file, and says who edited it', () => {
    const [family] = threadFiles(filesInLines([said(), edit()]));
    expect(family.versions.map((v) => [v.n, v.name, !!v.edited])).toEqual([[1, 'plan.md', false], [2, 'plan-v2.md', true]]);
    const words = (v, me) => sharedByWords(v, { me, nameOf: () => 'Maya' });
    expect(words(family.versions[1], 'sofia')).toBe('Edited by Maya');
    expect(words(family.versions[1], 'maya')).toBe('Edited by you');
    expect(words(family.versions[0], 'maya')).toMatch(/^Shared by/);
  });
  it('a group message saying Updated is an edit too, and an ordinary message is not', () => {
    const line = (body) => ({ id: 'm', ts: 3, source: 'founder', by: 'maya', patch: { body } });
    const [a] = filesInLines([line('Updated plan.md.\n\n[plan.md](attachments/mh2xk3a1-ab12cd-plan.md)')]);
    const [b] = filesInLines([line('Here it is.\n\n[plan.md](attachments/mh2xk3a1-ab12cd-plan.md)')]);
    expect(a.edited).toBe(true);
    expect(b.edited).toBeUndefined();
  });
  it('a teammate\'s edit still on its way adds no version: it has no file yet', () => {
    const line = edit({ patch: { artifact: { do: 'edit', file: 'plan.md', text: '# Words' } } });
    expect(threadFiles(filesInLines([said(), line])).flatMap((f) => f.versions)).toHaveLength(1);
  });
  it('the row keeps its edits, so a preview can show the newest', () => {
    const marks = marksOf([{ do: 'edit', file: 'plan.md', path: 'designs/w-1/plan-v2.md', by: 'maya', ts: 2 }]);
    expect(marks.edits).toEqual([{ file: 'plan.md', path: 'designs/w-1/plan-v2.md', by: 'maya', ts: 2 }]);
    expect(newestOfFamily('designs/w-1/plan.md', marks.edits)).toBe('designs/w-1/plan-v2.md');
    expect(newestOfFamily('designs/w-1/other.md', marks.edits)).toBe('designs/w-1/other.md');
    expect(marksOf([]).edits).toBeUndefined();
  });
});

describe('when two people edit', () => {
  const versions = [{ n: 1, by: 'owner' }, { n: 2, by: 'sofia' }, { n: 3, by: 'maya' }];
  const nameOf = () => 'Sofia';
  it('says who got there first, and that their changes are merged in', () => {
    expect(editClash({ versions: versions.slice(0, 2) }, 1, 'maya', nameOf)).toBe('Sofia saved v2 while you were editing. Yours saves as v3, with their changes merged in.');
  });
  it('says nothing when nobody else saved', () => {
    expect(editClash({ versions: versions.slice(0, 1) }, 1, 'maya', nameOf)).toBeNull();
  });
  it('says nothing about your own earlier save in the same sitting', () => {
    expect(editClash({ versions: [versions[0], versions[2]] }, 1, 'maya', nameOf)).toBeNull();
  });
});

describe('saving on disk', () => {
  let dir;
  const lines = [said()];
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-version-'));
    fs.mkdirSync(path.join(dir, 'designs/w-1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'designs/w-1/plan.md'), 'v1');
  });

  it('writes the next version and leaves the first alone', () => {
    const out = saveNextVersion({ dir, threadId: 'w-1', lines, basePath: 'designs/w-1/plan.md', text: 'v2' });
    expect(out).toMatchObject({ ok: true, path: 'designs/w-1/plan-v2.md', file: 'plan.md' });
    expect(fs.readFileSync(path.join(dir, 'designs/w-1/plan-v2.md'), 'utf8')).toBe('v2');
    expect(fs.readFileSync(path.join(dir, 'designs/w-1/plan.md'), 'utf8')).toBe('v1');
  });
  it('a save from an older version never overwrites the newer one, and says it was not the newest', () => {
    const second = saveNextVersion({ dir, threadId: 'w-1', lines, basePath: 'designs/w-1/plan.md', text: 'first' });
    const later = [...lines, edit({ patch: { artifact: { do: 'edit', file: 'plan.md', path: second.path } } })];
    const third = saveNextVersion({ dir, threadId: 'w-1', lines: later, basePath: 'designs/w-1/plan.md', text: 'second' });
    expect(third).toMatchObject({ ok: true, path: 'designs/w-1/plan-v3.md', over: 'plan-v2.md' });
    expect(fs.readFileSync(path.join(dir, second.path), 'utf8')).toBe('first');
    expect(fs.readFileSync(path.join(dir, third.path), 'utf8')).toBe('second');
  });
  it('two saves that both believe they are next still make two files', () => {
    const a = saveNextVersion({ dir, threadId: 'w-1', lines, basePath: 'designs/w-1/plan.md', text: 'a' });
    const b = saveNextVersion({ dir, threadId: 'w-1', lines, basePath: 'designs/w-1/plan.md', text: 'b' });
    expect(a.path).not.toBe(b.path);
    expect(fs.readFileSync(path.join(dir, a.path), 'utf8')).toBe('a');
    expect(fs.readFileSync(path.join(dir, b.path), 'utf8')).toBe('b');
  });
  it('finds the file by the id a teammate\'s mark names', () => {
    expect(saveNextVersion({ dir, threadId: 'w-1', lines, baseId: 'plan.md', text: 'x' })).toMatchObject({ ok: true, path: 'designs/w-1/plan-v2.md' });
  });
  it('refuses a file that is not on this thread, writing nothing', () => {
    const out = saveNextVersion({ dir, threadId: 'w-1', lines, basePath: 'designs/w-9/secret.md', text: 'x' });
    expect(out.ok).toBe(false);
    expect(fs.readdirSync(path.join(dir, 'designs/w-1'))).toEqual(['plan.md']);
  });
  it('refuses what is not a document, and a thread id that is a path', () => {
    const png = [said({ patch: { result: 'See `designs/w-1/a.png`' } })];
    expect(saveNextVersion({ dir, threadId: 'w-1', lines: png, basePath: 'designs/w-1/a.png', text: 'x' }).ok).toBe(false);
    expect(saveNextVersion({ dir, threadId: '../..', lines, basePath: 'designs/w-1/plan.md', text: 'x' }).ok).toBe(false);
  });
});

describe('an agent told about the file', () => {
  it('is pointed at the newest version when a person edited it', () => {
    const line = editedFilesLine([said(), edit()]);
    expect(line).toContain('designs/w-1/plan-v2.md');
    expect(line).toContain('plan.md');
  });
  it('hears nothing on a thread nobody edited', () => {
    expect(editedFilesLine([said()])).toBeNull();
  });
  it('hears nothing once its own later version is the newest', () => {
    const mine = said({ ts: 3, patch: { result: 'Now see [plan-v3.md](designs/w-1/plan-v3.md).' } });
    expect(editedFilesLine([said(), edit(), mine])).toBeNull();
  });
  it('the line rides in every run\'s system prompt', () => {
    expect(read('main/supervisor.mjs')).toMatch(/this\.teamLookLine\(item\.product, product\), this\.editedFilesLine\(item\)/);
  });
});

describe('the screen', () => {
  const view = read('renderer/src/components/ArtifactView.tsx');
  it('edits in the page, not in a raw box', () => {
    expect(view).not.toContain('av-edit');
    expect(view).not.toContain('<textarea className="av-edit"');
    expect(view).toContain('<DocText');
  });
  it('opens for typing only on its newest version, and not one the editor could not read', () => {
    expect(view).toMatch(/onNewVersion && kind === 'markdown' && version && isNewest && !version\.newer/);
    expect(view).toMatch(/if \(text === null\) \{ setUnreadable\(v\.id\); return; \}/);
  });
  it('a thread and a teammate\'s thread both pass a way to save', () => {
    expect(read('renderer/src/components/ThreadArtifacts.tsx')).toContain('onNewVersion=');
    expect(read('renderer/src/threads/TeammateThread.tsx')).toContain('onNewVersion=');
  });
  it('a comment saying more than one thing grows, rather than printing over its own words', () => {
    const css = read('renderer/src/components/artifact-view.css');
    expect(css).toMatch(/\.av-note-acts \{[^}]*flex-wrap: wrap[^}]*min-height: 28px/);
    expect(css).not.toMatch(/\.av-note-acts \{[^}]*[^-]height: 28px/);
  });
  it('a version arriving does not pull the view off the page in hand', () => {
    expect(view).toContain('inHand.current');
    expect(view).toMatch(/lines\.length > 0/);
  });
  it('typing in the page does not walk to the next file', () => {
    expect(view).toContain('isContentEditable');
  });
});
