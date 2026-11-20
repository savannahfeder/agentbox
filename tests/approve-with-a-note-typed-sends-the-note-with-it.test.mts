// APPROVE WITH A NOTE TYPED SENDS THE NOTE WITH IT (2026-11-20).
//
// Synthetic team run: Priya typed a note on Lena's empty-state-a.png and
// pressed Approve. The button turned to "Approved" and the note stayed in the
// box, unsent, until she noticed and pressed "Send to Lena" as well. Measured
// on the open picture (the run's approved-with-note.png) and in the view:
// approving wrote the approval only. Now the button says "Approve and send"
// while words are typed, and pressing it sends the note first, then approves.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { approveWords } from '../renderer/src/artifact-pins.ts';

describe('the approve button', () => {
  it('says it sends the note when one is typed: the reported case', () => {
    expect(approveWords({ approved: false, typed: true })).toBe('Approve and send');
  });
  it('is plain Approve with nothing typed', () => {
    expect(approveWords({ approved: false, typed: false })).toBe('Approve');
  });
  it('must NOT offer to send once approved, where pressing takes the approval back', () => {
    expect(approveWords({ approved: true, typed: true })).toBe('Approved');
  });
});

describe('the view', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
  it('sends what is typed before it approves, and not if the note did not save', () => {
    expect(view).toMatch(/const approveWithNote = async \(v: FileVersion\) => \{\s*if \(v\.id === version\?\.id && \(words\.trim\(\) \|\| pictures\.length\) && !\(await send\(\)\)\) return;\s*return approveNow\(v\);/);
  });
  it('both ways to approve the version in hand go through it', () => {
    expect(view).toContain('return approveWithNote(version);');
    expect(view).toContain('onClick={() => void approveWithNote(version)}>{approveAsked.yes}');
    expect(view).toContain('approveWords({ approved: mineApproved, typed: !!(words.trim() || pictures.length) })');
  });
});
