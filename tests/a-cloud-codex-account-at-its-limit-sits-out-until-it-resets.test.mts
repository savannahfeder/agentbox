// A CLOUD CODEX ACCOUNT AT ITS LIMIT SITS OUT UNTIL IT RESETS (2026-11-15).
//
// What broke: the night before Cloud's launch, two power testers ran every
// thread in the real cloud. The cloud's Codex account hit its usage limit
// ("You've hit your usage limit. ... try again at 8:27 PM.") after 7 runs,
// and the next 35 Codex runs across both copies started in the cloud and
// failed the same way within seconds, 70 copies of that line in their logs.
// The account was never benched: its record had no `limitedUntil`, because
// the cloud run read the limit off Claude Code's result line only and never
// off a Codex turn.
//
// Now a failed Codex turn that says the account is at its usage limit benches
// that cloud account until the time it names, as a Claude one already was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { codexLimitInLine } from '../main/cloud/run.mts';
import { limitResetMoment } from '../shared/spawn-trouble.mts';

const frame = (method: string, turn: unknown) => JSON.stringify({ jsonrpc: '2.0', method, params: { threadId: 'th', turn } });
const failed = (message: string, codexErrorInfo: unknown = 'usageLimitExceeded') =>
  frame('turn/completed', { id: 't1', status: 'failed', error: { message, codexErrorInfo }, items: [] });
const SAID = "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 8:27 PM.";
const NOW = new Date(2026, 10, 15, 19, 43).getTime();

describe('a Codex turn that failed at the cloud account\'s usage limit', () => {
  it('names the moment Codex says to try again', () => {
    expect(codexLimitInLine(failed(SAID), NOW)).toBe(new Date(2026, 10, 15, 20, 27).getTime());
    expect(codexLimitInLine(failed(SAID), NOW)).toBe(limitResetMoment(SAID, NOW));
  });

  it('reads a weekly limit\'s date, not only an hour', () => {
    const weekly = "You've hit your usage limit. Try again at Nov 22nd, 2026 1:05 PM.";
    expect(codexLimitInLine(failed(weekly), NOW)).toBe(new Date(2026, 10, 22, 13, 5).getTime());
  });

  it('sits out half an hour when Codex names no time', () => {
    expect(codexLimitInLine(failed("You've hit your usage limit."), NOW)).toBe(NOW + 30 * 60_000);
  });

  it('is read off turn/failed as well, and off the code when the sentence changes', () => {
    expect(codexLimitInLine(frame('turn/failed', { status: 'failed', error: { message: SAID } }), NOW)).toBe(new Date(2026, 10, 15, 20, 27).getTime());
    expect(codexLimitInLine(failed('Limit reached.', 'usageLimitExceeded'), NOW)).toBe(NOW + 30 * 60_000);
  });
});

describe('what must NOT bench the account', () => {
  it('a turn that worked, even one that talks about usage limits', () => {
    expect(codexLimitInLine(frame('turn/completed', { status: 'completed', items: [{ type: 'agentMessage', text: "You've hit your usage limit. try again at 8:27 PM" }] }), NOW)).toBe(null);
  });

  it('the context window or a run budget, which no reset fixes', () => {
    expect(codexLimitInLine(failed('Context window exceeded.', 'contextWindowExceeded'), NOW)).toBe(null);
    expect(codexLimitInLine(failed('Session budget exceeded.', 'sessionBudgetExceeded'), NOW)).toBe(null);
  });

  it('a refused sign-in, a dropped stream, another frame or a line that is not JSON', () => {
    expect(codexLimitInLine(failed('workspace routing discovery unauthorized (401)', 'other'), NOW)).toBe(null);
    expect(codexLimitInLine(failed('stream disconnected before completion', 'other'), NOW)).toBe(null);
    expect(codexLimitInLine(JSON.stringify({ method: 'item/completed', params: { item: { type: 'agentMessage', text: SAID } } }), NOW)).toBe(null);
    expect(codexLimitInLine('not json', NOW)).toBe(null);
  });
});

describe('the cloud run', () => {
  it('benches the Codex account it ran on when a relayed turn says so', () => {
    const RUN = fs.readFileSync(new URL('../main/cloud/run.mts', import.meta.url), 'utf8');
    expect(RUN).toMatch(/const until = codexLimitInLine\(line\);\s*if \(until\) \{ try \{ onLimit\(\{ until \}\); \}/);
  });
});
