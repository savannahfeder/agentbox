// A HANDED-OVER THREAD CARRIES ON FROM THE GIVER'S EDITS (w-f702d60afe, 2026-11-21).
//
// A review of the hand-off flow: on a thread handed over to you, the one choice
// was "Give it to an agent", which opened a new thread with "Sam asked: …" and
// the change file attached, and nothing told the agent to start from Sam's
// agent's edits, so it would likely redo the work.
import { describe, it, expect } from 'vitest';
import { taskHandOff } from '../renderer/src/threads/composer-rules';

const brief = (files: { name: string; srcPath: string }[]) => ({ title: 'Refund emails go out twice', body: 'Find why and stop it.', files });

describe('carrying on a handed-over thread with an agent', () => {
  it('tells the agent to start from the change file when one came with it', () => {
    const s = taskHandOff({ from: 'Sam', brief: brief([{ name: 'Refund emails go out twice change.change', srcPath: '/x.change' }]), message: null, nameOf: () => null });
    expect(s.body).toContain("Start from the edits in Refund emails go out twice change.change, attached: they are Sam's agent's work so far, not yet on this computer.");
  });
  it('says nothing of edits when none came', () => {
    const s = taskHandOff({ from: 'Sam', brief: brief([{ name: 'notes.md', srcPath: '/n.md' }]), message: null, nameOf: () => null });
    expect(s.body).not.toContain('Start from the edits');
  });
});
