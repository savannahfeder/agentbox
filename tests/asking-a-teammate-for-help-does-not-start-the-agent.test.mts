// ASKING A TEAMMATE FOR HELP DOES NOT START THE AGENT (2026-11-20).
//
// Rerun on two copies: Theo asked Sam for help with a step at 02:04:32 and
// his Codex agent ran again at 02:05:41, before Sam had said anything, and
// posted the same table and question again (Theo's ledger and runs.jsonl:
// the ask's line, then a claim and a second run). The ask writes `asked`
// with the wait, in Theo's hand, and the supervisor counts any field of hers
// after the agent's answer as a reply unless it is on its list of filing
// edits. `asked` is one now. Measured on the supervisor's own rule.
import { describe, it, expect } from 'vitest';
import { awaitingHer } from '../main/supervisor.mts';

const row = (extra: Record<string, { ts: number; source: string }>) => ({
  id: 'w-ask', product: 'api', status: 'open', kind: 'directive', labels: ['founder'],
  wrote: { body: { ts: 1_000, source: 'founder' }, result: { ts: 2_000, source: 'agent' }, ...extra },
});

describe('the ask on a thread whose agent is waiting on you', () => {
  it('leaves it waiting, with no run', () => {
    expect(awaitingHer(row({ blockedBy: { ts: 3_000, source: 'founder' }, asked: { ts: 3_000, source: 'founder' } }))).toBe(true);
  });
  it('a reply after it still starts one', () => {
    expect(awaitingHer(row({ asked: { ts: 3_000, source: 'founder' }, answer: { ts: 4_000, source: 'founder' } }))).toBe(false);
  });
});
