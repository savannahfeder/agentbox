// APPROVING A FILED TASK ON THE PHONE ASKS BEFORE WORDS GO TO AN AGENT.
//
// The phone asks once before your words go to Claude Code or Codex (App Review
// 5.1.2(i)), and "Not now, I'll just read" promises the app stays read-only.
// Both Codex reviewers on the app review board (2026-11-08) found two presses
// that sent words to an agent without that yes: approving a filed task, which
// replies "Approved. Run it.", and "do it here", which sends the task into its
// parent thread. Both now wait for the yes like a reply. Run now, Send now,
// closing and stopping send no words of yours, so they still never wait.
import { describe, it, expect } from 'vitest';
import { needsNotice } from '../mobile/src/lib/ai-notice';

describe('what waits for the yes', () => {
  it('approving a filed task and doing it here, as a reply and a new thread do', () => {
    for (const kind of ['approve-filed', 'do-here', 'reply', 'pick', 'new']) expect(needsNotice(kind), kind).toBe(true);
  });
  it('never closing, putting off, stopping, Run now, Send now or a permission card', () => {
    for (const kind of ['close', 'later', 'stop', 'approve', 'run-now', 'send-now', 'reopen', 'pin']) expect(needsNotice(kind), kind).toBe(false);
  });
});
