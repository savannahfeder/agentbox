// AN OUT-OF-USAGE THREAD DOES NOT SAY "IT HANDED THIS BACK" OVER AND OVER.
//
// Found 2026-10-12 by the pre-deploy check's breaker (an agent told to break
// the app through its screen, .claude/skills/verify-agentbox): a thread whose
// logins were out of usage opened with five identical "It handed this back"
// lines above the app's own note that nothing had been done.
//
// Why. When a run dies before doing anything, the app writes its own sentence
// as the result (main/supervisor.mts, `sayTheRunDied`) and then puts the row back
// to open with a system line. thread-history drew that system 'open' as the
// agent handing the thread back, once per attempt. Nobody handed anything back:
// it is the app delivering its own note, the same pair the 'blocked' branch
// already stays silent for. Measured on the verify copy with two logins out:
// result, system open, result, system open, 1.1 s apart.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-10-12T16:59:58-07:00');
const NOTE = 'Claude Code is at its usage limit, so nothing has been done on this task. It starts again on its own at 11:59pm.';
const line = (ts, source, patch) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const born = [
  line(T0, 'system', { title: 'Out everywhere', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 4, 'founder', { title: 'Out everywhere', model: 'opus' }),
];
const said = (lines) => threadEvents(lines).map((e) => e.said);

describe('the app writing its own note and reopening the row', () => {
  it('does not say the thread was handed back, however many attempts', () => {
    const lines = [...born,
      line(T0 + 511, 'agent', { result: NOTE }), line(T0 + 512, 'system', { status: 'open' }),
      line(T0 + 1648, 'agent', { result: NOTE }), line(T0 + 1648, 'system', { status: 'open' })];
    expect(said(lines)).not.toContain('It handed this back');
  });
});

describe('what still reads as handed back', () => {
  it('an agent itself putting the row back to open', () => {
    const lines = [...born, line(T0 + 60_000, 'agent', { status: 'open' })];
    expect(said(lines)).toContain('It handed this back');
  });

  it('a system reopen that does not follow a result', () => {
    const lines = [...born, line(T0 + 60_000, 'agent', { status: 'claimed' }), line(T0 + 90_000, 'system', { status: 'open' })];
    expect(said(lines)).toContain('It handed this back');
  });

  it('the person sending it back is still theirs', () => {
    const lines = [...born, line(T0 + 60_000, 'agent', { result: 'Done.' }), line(T0 + 120_000, 'founder', { status: 'open' })];
    expect(said(lines)).toContain('You sent it back');
  });
});
