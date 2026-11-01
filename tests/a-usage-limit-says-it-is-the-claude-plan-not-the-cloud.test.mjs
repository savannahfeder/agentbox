// A USAGE LIMIT DID NOT SAY WHOSE LIMIT IT WAS.
//
// A tester on Claude Pro with the cloud on hit her limit three times in an
// afternoon and wrote: "It wasn't clear whether Cloud's hours or my own Claude
// plan is the limit." The thread said "Claude Code is at its usage limit ...
// It starts again on its own at 6pm", and the cloud menu said "Your cloud
// account is at its usage limit", which reads as the Agentbox Cloud plan and
// its hours. Both were the Claude plan.
//
// Measured by building each sentence with the cloud on and off: none named the
// plan. Now the thread says which plan's limit resets, and the menu names the
// Claude account the cloud runs on.
//
// THE CASES THAT MUST NOT MATCH: an engine with no plan to name keeps the old
// words, other causes say nothing of a plan's limit, and the opener that
// `deadRunCause` reads back off stored threads is unchanged.
import { describe, it, expect } from 'vitest';
import { deadRunCause, deadRunSentence } from '../shared/spawn-trouble.mts';
import { cloudFootLine } from '../renderer/src/cloud-menu';

const limit = (extra) => deadRunSentence({ cause: 'at-limit', ...extra });

describe('the thread line when a limit stops a run', () => {
  it('names the Claude plan with the hour it resets', () => {
    expect(limit({ engineWord: 'Claude Code', resetsAt: '6pm' })).toBe(
      'Claude Code is at its usage limit, so nothing has been done on this task.'
      + " It starts again on its own at 6pm, when your Claude plan's limit resets.",
    );
  });

  it('names the Claude plan with no hour', () => {
    expect(limit({ engineWord: 'Claude Code' })).toBe(
      'Claude Code is at its usage limit, so nothing has been done on this task.'
      + " It starts again on its own when your Claude plan's limit resets.",
    );
  });

  it('names the ChatGPT plan for Codex', () => {
    expect(limit({ engineWord: 'Codex', worked: true, resetsAt: '6pm' })).toBe(
      'Codex hit its usage limit partway through, so this task is not finished.'
      + " It starts again on its own at 6pm, when your ChatGPT plan's limit resets.",
    );
  });

  it('names the plan when it has stopped trying, before the reply', () => {
    expect(limit({ engineWord: 'Claude Code', resetsAt: '6pm', gaveUp: true }))
      .toContain("Your Claude plan's limit resets at 6pm. Then reply here to start it again.");
  });

  it('keeps the old words for an engine with no plan to name', () => {
    expect(limit({ resetsAt: '6pm' })).toBe(
      'The agent is at its usage limit, so nothing has been done on this task. It starts again on its own at 6pm.',
    );
    expect(limit({})).toMatch(/It starts again on its own when the limit resets\.$/);
  });

  it('says nothing of a plan limit on another cause', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out' })).not.toMatch(/plan's limit/);
  });

  it('still reads back as a limit, named login or not', () => {
    expect(deadRunCause(limit({ engineWord: 'Claude Code', resetsAt: '6pm' }))).toBe('at-limit');
    expect(deadRunCause(limit({ engineWord: 'Claude Code', account: 'alex@work.com' }))).toBe('at-limit');
  });
});

describe('the cloud menu when the cloud\'s account is at its limit', () => {
  const at = (h, m) => new Date(2026, 9, 27, h, m, 0, 0).getTime();
  const now = at(20, 13);
  const acct = (limitedUntil) => ({ engine: 'claude', key: 'a', name: null, ready: !limitedUntil, state: limitedUntil ? 'limited' : 'ready', limitedUntil, inUse: true });
  const cloud = (accounts, mode = 'all') => ({ setUp: true, mode, whenOn: 'all', running: 0, accounts, signIns: [], month: { runs: 0, agentHours: 0 } });

  it('names the Claude account, not the cloud', () => {
    const line = cloudFootLine(cloud([acct(at(22, 10))]), now);
    expect(line).toBe('The Claude account the cloud runs on is at its usage limit until 10:10pm. Threads run on this Mac until then.');
    expect(line).not.toMatch(/^Your cloud account/);
  });

  it('says nothing of a limit with the cloud off', () => {
    expect(cloudFootLine(cloud([acct(at(22, 10))], 'mac'), now)).toBe('Nothing running in the cloud now');
  });
});
