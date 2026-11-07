// TWO PEOPLE EDITING ONE DOCUMENT BOTH KEEP THEIR WORDS.
//
// What broke: on a YC application thread the one-liner on line 13 was changed
// to "Manage hundreds of AI agents like email." four or five times and kept
// coming back as "An inbox for running hundreds of AI agents at once", because
// each new version an agent wrote was copied from the version THAT AGENT had
// written last, not from the newest one. v13 was a person's edit; v14 was the
// agent's copy of v12, and v13's words were gone with nobody told.
//
// So a write that starts from an older version is merged against the newest
// one, line by line, with the version it started from as the base. This is
// that merge on its own: the shape of the loss, the boundaries either side of
// it, and the case that must NOT merge, where both changed the same lines.
import { describe, it, expect } from 'vitest';
import { mergeThree } from '../shared/doc-merge.mjs';

const doc = (one) => [
  '# Agentbox', '', '## What', '', 'We build an inbox for agents.', '',
  '## One-liner', '', one, '', '## Why now', '', 'Agents got good in 2026.', '',
].join('\n');

describe('merging a write made from an older version', () => {
  it('keeps a person\'s new one-liner and the agent\'s changes elsewhere', () => {
    const base = doc('An inbox for running hundreds of AI agents at once');
    const ours = doc('Manage hundreds of AI agents like email.');
    const theirs = base.replace('Agents got good in 2026.', 'Agents got good in 2026, and nobody can watch them.');
    const out = mergeThree({ base, ours, theirs });
    expect(out.ok).toBe(true);
    expect(out.text).toContain('Manage hundreds of AI agents like email.');
    expect(out.text).toContain('nobody can watch them');
    expect(out.text).not.toContain('An inbox for running hundreds');
  });

  it('takes the words of whichever side changed, when only one did', () => {
    const base = 'a\nb\nc\n';
    expect(mergeThree({ base, ours: 'a\nB\nc\n', theirs: base })).toEqual({ ok: true, text: 'a\nB\nc\n' });
    expect(mergeThree({ base, ours: base, theirs: 'a\nb\nC\n' })).toEqual({ ok: true, text: 'a\nb\nC\n' });
    expect(mergeThree({ base, ours: base, theirs: base })).toEqual({ ok: true, text: base });
  });

  it('keeps a line a person deleted deleted, and the sentence added beside it', () => {
    const base = 'Keep this.\nDelete this one.\nAnd this stays.\n';
    const ours = 'Keep this.\nAnd this stays.\n';
    const theirs = 'Keep this.\nDelete this one.\nAnd this stays.\nA new last line.\n';
    const out = mergeThree({ base, ours, theirs });
    expect(out.ok).toBe(true);
    expect(out.text).toBe('Keep this.\nAnd this stays.\nA new last line.\n');
  });

  it('merges additions at the very start and the very end', () => {
    const base = 'middle\n';
    const out = mergeThree({ base, ours: 'top\nmiddle\n', theirs: 'middle\nbottom\n' });
    expect(out).toEqual({ ok: true, text: 'top\nmiddle\nbottom\n' });
  });

  it('counts the same change made twice as one, not a clash', () => {
    const base = 'a\nb\n';
    expect(mergeThree({ base, ours: 'a\nB\n', theirs: 'a\nB\n' })).toEqual({ ok: true, text: 'a\nB\n' });
  });

  it('refuses when both changed the same line to different words', () => {
    const base = doc('An inbox for running hundreds of AI agents at once');
    const ours = doc('Manage hundreds of AI agents like email.');
    const theirs = doc('An inbox for your agents.');
    const out = mergeThree({ base, ours, theirs });
    expect(out.ok).toBe(false);
    expect(out.clashes).toBe(1);
  });

  it('refuses a document too long to line up, rather than guessing', () => {
    const many = (n, word) => Array.from({ length: n }, (_, i) => `${word} ${i}`).join('\n');
    const out = mergeThree({ base: many(4000, 'a'), ours: many(4000, 'b'), theirs: many(4000, 'c') });
    expect(out.ok).toBe(false);
    expect(out.tooBig).toBe(true);
  });

  it('takes a side whole when there is nothing to merge against', () => {
    expect(mergeThree({ base: '', ours: '', theirs: 'new\n' })).toEqual({ ok: true, text: 'new\n' });
    expect(mergeThree({ base: 'a\n', ours: 'a\n', theirs: '' }).text).toBe('');
  });
});
