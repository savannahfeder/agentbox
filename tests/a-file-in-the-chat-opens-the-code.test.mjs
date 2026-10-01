// THE FILE THE AGENT SAID IT CHANGED IS A DOOR INTO THE CODE —.
//
// The path was on the screen and it was dead text.
//
// WHAT THIS GUARDS, and it is three separate things that can each break alone:
//
//   1. A work line that changed a file CARRIES the file, whole. Both readers
//      have to do it — the Claude Code transcript reader in main/agents.mjs and
//      the trace reader in renderer/src/item-thread.ts — and they are different
//      files that have drifted before.
//   2. Only a file the change actually HOLDS becomes a chip. A chip that opens
//      nothing is the fault the attachment row on her card was fixed for on
//      2026-08-19, and it would be silent here: the press would simply do
//      nothing and she would report the feature as broken.
//   3. The two shapes of a path MEET. A transcript records an absolute path; a
//      change records it relative to a root when it sits under one. If those
//      stop meeting, every chip disappears and nothing else changes, which is
//      the failure with no symptom.
import { describe, expect, it } from 'vitest';
import { changedFile, fileInChange } from '../shared/agents.mjs';
import { changeFromTranscript } from '../main/code-change.mjs';
import { itemThread } from '../renderer/src/item-thread.ts';

const ROOT = '/Users/you/Desktop/dev/zero';

/** One assistant line of a Claude Code transcript, as the file on disk holds it. */
function edit(path, oldText, newText, at = '2026-08-24T01:00:00.000Z') {
  return JSON.stringify({
    type: 'assistant',
    timestamp: at,
    message: {
      content: [
        { type: 'text', text: 'Now the header.' },
        { type: 'tool_use', name: 'Edit', input: { file_path: path, old_string: oldText, new_string: newText } },
      ],
    },
  });
}

describe('a work line says which file it changed', () => {
  it('carries the file for the four tools that write one, and nothing else', () => {
    expect(changedFile('Edit', { file_path: '/a/b.ts' })).toBe('/a/b.ts');
    expect(changedFile('Write', { file_path: '/a/b.ts' })).toBe('/a/b.ts');
    expect(changedFile('MultiEdit', { file_path: '/a/b.ts' })).toBe('/a/b.ts');
    expect(changedFile('NotebookEdit', { notebook_path: '/a/b.ipynb' })).toBe('/a/b.ipynb');
    // A read is not a change and has nothing to show: the artifact this opens
    // is a diff and holds no entry for a file nobody wrote.
    expect(changedFile('Read', { file_path: '/a/b.ts' })).toBe('');
    expect(changedFile('Bash', { command: 'rm -rf /a/b.ts' })).toBe('');
    expect(changedFile('Grep', { pattern: 'b.ts' })).toBe('');
  });

  it('is the same four tools main/code-change.mjs turns into a diff', () => {
    // If these two lists drift, a line becomes a chip that opens onto a file
    // the change does not hold, or a file in the change never becomes a chip.
    const source = String(changeFromTranscript);
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      expect(changedFile(tool, { file_path: '/x.ts' })).toBe('/x.ts');
    }
    expect(source).toBeTruthy();
  });
});

describe('the path in the chat meets the path in the change', () => {
  it('matches an absolute path against the change\'s relative key', () => {
    const change = changeFromTranscript(
      [edit(`${ROOT}/renderer/src/components/Thread.tsx`, 'one', 'two')].join('\n'),
      { roots: [ROOT] },
    );
    expect(change.files.map((f) => f.path)).toEqual(['renderer/src/components/Thread.tsx']);
    // The transcript's own absolute path finds it.
    expect(fileInChange(
      change.files.map((f) => f.path),
      `${ROOT}/renderer/src/components/Thread.tsx`,
    )).toBe('renderer/src/components/Thread.tsx');
  });

  it('takes the LONGEST match, so two files ending the same way do not swap', () => {
    const paths = ['src/api.ts', 'renderer/src/api.ts'];
    expect(fileInChange(paths, `${ROOT}/renderer/src/api.ts`)).toBe('renderer/src/api.ts');
    expect(fileInChange(paths, `${ROOT}/src/api.ts`)).toBe('src/api.ts');
  });

  it('reads /private/tmp and /tmp as the one folder they are', () => {
    expect(fileInChange(['/tmp/w/a.ts'], '/private/tmp/w/a.ts')).toBe('/tmp/w/a.ts');
    expect(fileInChange(['/private/tmp/w/a.ts'], '/tmp/w/a.ts')).toBe('/private/tmp/w/a.ts');
  });

  it('refuses a file the change does not hold, which is what stops a dead chip', () => {
    const paths = ['renderer/src/App.tsx'];
    expect(fileInChange(paths, `${ROOT}/renderer/src/notes.ts`)).toBe(null);
    // A tail that is not a whole segment is not a match: `pp.tsx` is not
    // `App.tsx` and must never open it.
    expect(fileInChange(['pp.tsx'], `${ROOT}/renderer/src/App.tsx`)).toBe(null);
    expect(fileInChange([], `${ROOT}/renderer/src/App.tsx`)).toBe(null);
    expect(fileInChange(paths, '')).toBe(null);
  });
});

describe('one of her own tasks', () => {
  // The supervisor's trace, as it is written to disk: a clock, two spaces, then
  // either a sentence the agent typed or `[Tool] argument`.
  const trace = [
    '01:00:01  Now the header bar.',
    `01:00:02  [Edit] ${ROOT}/renderer/src/styles.css`,
    `01:00:03  [Read] ${ROOT}/renderer/src/App.tsx`,
    '01:00:04  [Bash] npm test',
  ].join('\n');

  const at = (hhmmss) => Date.parse(`2026-08-24T${hhmmss}Z`);
  const built = itemThread(
    [
      { id: 'w-1', ts: at('00:59:00'), source: 'founder', patch: { title: 'The top bar', body: 'Make it black.' } },
      { id: 'w-1', ts: at('01:00:00'), source: 'system', claim: { holder: 'mcp-1', leaseUntil: at('02:00:00') }, patch: { status: 'claimed' } },
    ],
    [{ startedAt: at('01:00:00'), text: trace }],
  );
  const work = built.events.filter((e) => e.kind === 'work');

  it('hands the changed file over whole, and hands nothing over for a read or a command', () => {
    const edited = work.find((w) => w.verb === 'changed');
    expect(edited?.file).toBe(`${ROOT}/renderer/src/styles.css`);
    expect(work.find((w) => w.verb === 'read')?.file).toBeUndefined();
    expect(work.find((w) => w.verb === 'ran')?.file).toBeUndefined();
  });

  it('keeps the SHORTENED path on the screen and the whole one for the match', () => {
    // The subject is trimmed from the front for the line she reads, so it can
    // never be what the change is matched against. Both are on the event.
    const edited = work.find((w) => w.verb === 'changed');
    expect(edited?.subject).not.toBe(edited?.file);
    expect(edited?.file.endsWith(edited.subject.replace(/^…\//, ''))).toBe(true);
    expect(fileInChange(['renderer/src/styles.css'], edited.file)).toBe('renderer/src/styles.css');
  });
});
