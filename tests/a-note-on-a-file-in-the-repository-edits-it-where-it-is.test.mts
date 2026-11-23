// A note on a file in the agent's repository asked for a -v2 copy beside it.
// Overnight Cloud test, round four, seen four times: notes on store.test.js,
// docs/persistence.md, docs/pagination-benchmark.md and frontend-smoke.md each
// came back as a second file (store.test-v3.js, ...-v2.md), even when the note
// said "update this same file". The test copy then ran twice, and the original
// stayed old. The words every note is sent with said "save the result as
// <name>-v2 beside the original, keeping the original as it is", whatever the
// file was. The app already shows new bytes at an old path as the next version.
import { describe, expect, it } from 'vitest';
import { notesForTheAgent, repliesForTheAgent } from '../shared/artifact-marks.mts';

const note = { id: 'n1', file: 'v1', place: { kind: 'whole' as const }, text: 'Rename ada to validAppointment' };

describe('a note on a file in the repository edits it where it is', () => {
  it('tells the agent to change a tracked file where it is and commit it', () => {
    const { text } = notesForTheAgent({ notes: [note] }, { id: 'v1', name: 'store.test.js', path: 'tests/store.test.js' }, 1);
    expect(text).toMatch(/If store\.test\.js is tracked in your repository, change it where it is and commit it/);
  });

  it('asks for the repository case before the copy beside it, so the copy reads as the fallback', () => {
    const { text } = notesForTheAgent({ notes: [note] }, { id: 'v1', name: 'persistence.md', path: 'docs/persistence.md' }, 1);
    expect(text.indexOf('tracked in your repository')).toBeGreaterThan(-1);
    expect(text.indexOf('tracked in your repository')).toBeLessThan(text.indexOf('persistence-v2.md'));
    expect(text).toMatch(/Otherwise save the result as persistence-v2\.md beside the original/);
  });

  it('still asks for a design outside the repository as its next version beside the original', () => {
    const { text } = notesForTheAgent({ notes: [note] }, { id: 'v1', name: 'onboarding-a.png', path: '/docs/designs/w-1/onboarding-a.png' }, 1);
    expect(text).toMatch(/save the result as onboarding-a-v2\.png beside the original/);
    expect(text).toMatch(/the next version of onboarding-a\.png/);
  });

  it('says the same on a reply under a note the agent already has', () => {
    const text = repliesForTheAgent(note, [{ id: 'r1', by: null, ts: 2, text: 'and the other fixture too' }], { name: 'store.test.js', path: 'tests/store.test.js' }, 1);
    expect(text).toMatch(/If this asks for changes, make them\. If store\.test\.js is tracked in your repository, change it where it is and commit it/);
  });
});
