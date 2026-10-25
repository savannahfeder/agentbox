// THE NEW THREAD CARD SAID "AGENT" AND MEANT ONE OF TWO PROGRAMS.
//
// Both testers in the power test of 2026-10-20 opened the card in their first
// minute and pressed To, which offered exactly one row, "Agent", and did
// nothing. Which coding agent it meant was readable only as a column heading
// behind "All models", so a model in Recent ("stub-model") belonged to no
// visible agent at all (run 2, issues 33 and 34).
//
// So To names the agent on a Mac that has two of them, and every Recent row
// wears the agent that runs it.
//
// THE CASE THAT MUST NOT MATCH is every Mac she has today: with one coding
// agent there is no choice to offer, so the word stays "Agent", the menu keeps
// its one row, and no row wears a tag (tests/one-coding-agent-draws-nothing-new).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { agentChoices, agentWordFor } from '../renderer/src/threads/composer-rules';
import { ENGINES } from '../shared/engines.mjs';

const CLAUDE = ENGINES[0];
const CODEX = ENGINES.find((e) => e.id === 'codex');

describe('the word on the To field', () => {
  it('names the agent when this Mac has two', () => {
    expect(agentWordFor([CLAUDE, CODEX], 'claude')).toBe('Claude Code');
    expect(agentWordFor([CLAUDE, CODEX], 'codex')).toBe('Codex');
  });

  it('stays "Agent" on a Mac with one', () => {
    expect(agentWordFor([CLAUDE], 'claude')).toBe('Agent');
    expect(agentWordFor([CODEX], 'codex')).toBe('Agent');
  });

  it('stays "Agent" when the list is not known yet', () => {
    expect(agentWordFor([], 'claude')).toBe('Agent');
    expect(agentWordFor(undefined, 'claude')).toBe('Agent');
  });
});

describe('the rows the To menu offers', () => {
  it('is one row per agent on a Mac with two', () => {
    expect(agentChoices([CLAUDE, CODEX])).toEqual([
      { id: 'claude', label: 'Claude Code' },
      { id: 'codex', label: 'Codex' },
    ]);
  });

  // The boundary either side: one engine offers nothing to choose between, so
  // the card keeps the row it has always drawn.
  it('is nothing at all on a Mac with one', () => {
    expect(agentChoices([CLAUDE])).toEqual([]);
    expect(agentChoices([])).toEqual([]);
    expect(agentChoices(undefined)).toEqual([]);
  });
});

describe('the card draws what the rules say', () => {
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

  it('asks the rules for the word and the rows rather than spelling them again', () => {
    expect(card).toContain('agentWordFor(');
    expect(card).toContain('agentChoices(');
    expect(card).not.toMatch(/tc-row-label">Claude Code</);
  });

  it('tags a Recent row with its agent only where there are two', () => {
    expect(card).toContain('engineTags');
  });

  // The All models columns are headed by the agent already, so a row there
  // wears no tag. `.map(modelRow)` would hand the row its INDEX as the tag and
  // tag every row but the first.
  it('never hands a model row the index as its tag', () => {
    expect(card).not.toMatch(/\.map\(modelRow\)/);
  });
});
