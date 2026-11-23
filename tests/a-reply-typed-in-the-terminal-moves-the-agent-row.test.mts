// A REPLY TYPED IN THE TERMINAL MOVES THE AGENT ROW, the same as one sent from
// here.
//
// After the first onboarding call (2026-11-21) the founder: "If somebody sends
// a response to an agent in the terminal, you don't want it still in your
// inbox." Only a reply sent from the app wrote `repliedAt`, so a session she
// answered in its own window stayed in Needs you, busy on her answer, until it
// stopped again. `asked` already held every message typed into the session,
// with its time, read off the transcript; `tookHerReply` never looked at it.
import { describe, it, expect } from 'vitest';
import { agentRow, progressAfterReply, reachesInbox, tookHerReply } from '../shared/agents.mts';

const TYPED = Date.parse('2026-11-21T19:10:00Z');

const waiting = {
  pid: 4242,
  sessionId: '5b0c7f2e-9d1a-4c3e-8f00-2a6d1e9b7c11',
  name: 'session-b2',
  cwd: '/tmp/agentbox-fixture-repo',
  about: 'Move the billing page to the new plan names',
  startedAt: TYPED - 3_600_000,
  status: 'idle',
  statusAt: TYPED - 600_000,
  waitingFor: null,
  lastActiveAt: TYPED - 600_000,
  asked: [{ at: TYPED - 3_600_000, text: 'Move the billing page to the new plan names' }],
  touched: [],
  startedByZero: false,
};

// She answers it in the terminal, and it goes to work on that.
const answeredThere = {
  ...waiting,
  asked: [...waiting.asked, { at: TYPED, text: 'Yes, keep the old names in the receipts' }],
  status: 'busy',
  statusAt: TYPED + 800,
  lastActiveAt: TYPED + 800,
};

describe('a reply typed into the session itself', () => {
  it('takes the row out of Needs you and puts it in In progress while the session works', () => {
    expect(reachesInbox(waiting)).toBe(true);
    expect(tookHerReply(answeredThere)).toBe(true);
    expect(reachesInbox(answeredThere)).toBe(false);
    expect(progressAfterReply(answeredThere)).toBe(true);
    expect(agentRow(answeredThere).body).toContain('**You replied, and session-b2 is working on it.**');
  });

  it('counts in the moment before the session picks it up, while it still reads idle', () => {
    const notYet = { ...answeredThere, status: 'idle', statusAt: waiting.statusAt };
    expect(tookHerReply(notYet)).toBe(true);
    expect(reachesInbox(notYet)).toBe(false);
  });

  it('brings the row back when the session stops again, finished or asking', () => {
    const finished = { ...answeredThere, status: 'idle', statusAt: TYPED + 240_000 };
    expect(tookHerReply(finished)).toBe(false);
    expect(reachesInbox(finished)).toBe(true);
    const asking = { ...answeredThere, status: 'waiting', waitingFor: 'permission prompt', statusAt: TYPED + 60_000 };
    expect(tookHerReply(asking)).toBe(false);
    expect(reachesInbox(asking)).toBe(true);
  });

  it('does not count a message older than the session\'s last stop', () => {
    // Her opening message, typed an hour before it stopped: the stop answered it.
    expect(tookHerReply(waiting)).toBe(false);
    expect(progressAfterReply(waiting)).toBe(false);
  });

  it('is the newer of the two when she has spoken both here and there', () => {
    const both = { ...answeredThere, repliedAt: TYPED - 300_000 };
    expect(tookHerReply(both)).toBe(true);
    const stoppedAfterBoth = { ...both, status: 'idle', statusAt: TYPED + 120_000 };
    expect(tookHerReply(stoppedAfterBoth)).toBe(false);
  });

  it('still promises nothing for a session that publishes no status', () => {
    const silent = { ...answeredThere, status: null, statusAt: 0 };
    expect(tookHerReply(silent)).toBe(false);
    expect(reachesInbox(silent)).toBe(true);
  });

  it('still leaves a row she closed closed', () => {
    expect(tookHerReply({ ...answeredThere, doneThrough: TYPED - 1 })).toBe(false);
  });

  it('still keeps every session out of the inbox when outside agents are off', () => {
    expect(progressAfterReply(answeredThere, TYPED, 'off')).toBe(false);
    expect(reachesInbox(answeredThere, TYPED, 'off')).toBe(false);
  });
});
