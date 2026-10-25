// A CODEX MODEL THIS MAC DOES NOT OFFER SAYS SO ON ITS ROW.
//
// What broke (2026-10-19): two Codex threads sat in In Progress and never ran.
// Both asked for gpt-6.1-sol. The Codex on this Mac was signed in with a free
// plan, whose list (models_cache.json) offers gpt-6-luna, gpt-5.6-terra and
// gpt-5.6-luna. `codexModelRefusal` stopped each run with "...which is not a
// model the Codex on this computer knows. It offers ...", but `troubleCause`
// knew only its other sentence (another login has the model), so the row got
// the generic one: "Codex stopped before it did anything ... Agentbox keeps
// trying". Nothing she could act on, and the run retried on a model it could
// never get.
//
// Now both sentences read as the plan lacking the model, whose row says to
// pick another model or sign in an account that has it.
import { describe, it, expect } from 'vitest';
import { troubleCause, deadRunSentence, deadRunCause, needsHerHands } from '../shared/spawn-trouble.mjs';

const SAID = 'this row asks to run on "gpt-6.1-sol", which is not a model the Codex on this computer knows. It offers gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna. Nothing here will pick a stand-in for her, so this run is stopping rather than doing her work on a model she did not choose';
const WORKSPACE = 'every Codex agent here is set to run on "gpt-6.1-sol", which is not a model the Codex on this computer knows. It offers gpt-6-luna.';

describe('a model the Codex here does not offer', () => {
  it('is read as a model the plan lacks, from a row or from the workspace setting', () => {
    expect(troubleCause(SAID)).toBe('model-not-on-plan');
    expect(troubleCause(`stderr: ${SAID}`)).toBe('model-not-on-plan');
    expect(troubleCause(WORKSPACE)).toBe('model-not-on-plan');
  });

  it('puts the fix on her row, not "keeps trying"', () => {
    const line = deadRunSentence({ engineWord: 'Codex', cause: troubleCause(SAID) });
    expect(line).toMatch(/Pick another model for this task/);
    expect(line).not.toMatch(/keeps trying/);
    expect(deadRunCause(line)).toBe('model-not-on-plan');
  });

  it('does not bench the login, which runs every other model', () => {
    expect(needsHerHands(troubleCause(SAID))).toBe(false);
  });

  it('leaves the unrelated failures as they were', () => {
    expect(troubleCause("The model 'gpt-9' does not exist")).not.toBe('model-not-on-plan');
    expect(troubleCause('Codex knows nothing about this folder')).not.toBe('model-not-on-plan');
    expect(troubleCause('')).toBe('unknown');
  });
});
