// A FAILURE WE CANNOT NAME POINTS AT THE AGENT, NOT AT THE APP.
//
// What broke (2026-10-19): the line a row gets when a run dies for a reason the
// app cannot place ended "Agentbox keeps trying, and it will keep failing the
// same way until this is fixed." The person read it as Agentbox being broken.
// It named no next step, and "this" pointed at nothing. The same complaint
// about the usage line was fixed on 2026-10-11 by pointing at the account
// (tests/a-usage-failure-we-do-not-recognise-blames-nobody).
//
// The first sentence stays word for word, because rows already carrying it are
// read back by `deadRunCause` and counted as stranded.
import { describe, it, expect } from 'vitest';
import { deadRunSentence, deadRunCause } from '../shared/spawn-trouble.mjs';
import { Name } from '../shared/product-name.mjs';

describe('the line for a failure we cannot name', () => {
  it('points a Codex run at the ChatGPT plan and the codex command', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'unknown' }))
      .toBe(`Codex stopped before it did anything, so this task has not been started. Check that your ChatGPT plan is active at chatgpt.com, or run codex in a terminal to see what it says. ${Name} tries again on its own.`);
  });

  it('points a Claude Code run at the Claude plan and the claude command', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown' }))
      .toBe(`Claude Code stopped before it did anything, so this task has not been started. Check that your Claude plan is active at claude.ai, or run claude in a terminal to see what it says. ${Name} tries again on its own.`);
  });

  // No engine to name means no command to name either.
  it('names no command when it does not know the engine', () => {
    expect(deadRunSentence({ cause: 'unknown' }))
      .toBe(`The agent stopped before it did anything, so this task has not been started. ${Name} tries again on its own.`);
  });

  it('still says how many times it has happened', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'unknown', runs: 3 })).toMatch(/This has happened 3 times on this task\. Check that/);
  });

  it('no longer says it will keep failing, and carries no colon or dash', () => {
    for (const engineWord of ['Codex', 'Claude Code', 'The agent']) {
      const line = deadRunSentence({ engineWord, cause: 'unknown' });
      expect(line).not.toMatch(/keep failing|until this is fixed/);
      expect(line).not.toMatch(/[:—–]/);
    }
  });

  it('is still read back as a row nothing ran on', () => {
    expect(deadRunCause(deadRunSentence({ engineWord: 'Codex', cause: 'unknown' }))).toBe('unknown');
    // A row written before this change.
    expect(deadRunCause(`Codex stopped before it did anything, so this task has not been started. ${Name} keeps trying, and it will keep failing the same way until this is fixed.`)).toBe('unknown');
  });

  // Must not move: the folder line names its own fix in its first sentence.
  it('leaves the folder line as it was', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'workspace' }))
      .toBe(`Claude Code would not start in this project's folder, so nothing has been done here. ${Name} keeps trying, and it will keep failing the same way until this is fixed.`);
  });
});
