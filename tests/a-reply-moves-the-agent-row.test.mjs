// A REPLY MOVES THE AGENT ROW. Found while testing the reply box the same item
// had shipped an hour earlier.
//
// Nothing in this app had ever heard of a reply to an agent, so nothing
// anywhere recorded that she had spoken.
//
// A row that looks the same after she acts on it is the same shape as the
// system swallowing what she said, which is the failure this codebase cares
// about most.
//
// The measurement this rests on, taken on a real machine (claude 2.1.234): a
// session publishes `status` as one of busy, shell, idle, waiting, and stamps
// `statusUpdatedAt` whenever that moves. 15 of 16 live sessions
// were publishing one; session-a6 was `idle`, stamped, and one was `waiting`.
//
// Four ways this goes wrong with no symptom, all pinned here:
//
//   1. Reading the status alone. The session is STILL IDLE for the moment
//      between her pressing send and it picking the message up, so a rule that
//      does not compare stamps sends the row straight back to the inbox — her
//      own bug, wearing a hat.
//   2. The row never coming back. In progress is a promise that something is on
//      this; a row that goes in and never leaves turns the promise into a list
//      that only grows.
//   3. Both lists at once. "One row, two tabs" is a failure this app has
//      already had, and it is the tab she believed that lied.
//   4. Promising it for a session that publishes nothing. Agentbox cannot see
//      that one work and cannot see it stop, so it must not claim either.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  agentKey, agentRow, agentTitle, reachesInbox, progressAfterReply, stoppedSince, tookHerReply,
} from '../shared/agents.mjs';
import { AgentSchedule } from '../main/agent-schedule.mjs';

const SPOKE = Date.parse('2026-08-17T18:52:00Z');

// session-a6 exactly as her machine reported it in ~/.claude/sessions/78245.json.
const quiet = {
  pid: 78245,
  sessionId: '37045ab9-7b2f-486e-b73c-077ded6ec2a9',
  name: 'session-a6',
  cwd: '/tmp/agentbox-fixture-repo',
  about: 'Import Zero designs into Paper project',
  startedAt: Date.parse('2026-08-14T19:15:28Z'),
  status: 'idle',
  statusAt: SPOKE - 60_000,
  waitingFor: null,
  lastActiveAt: SPOKE - 60_000,
  asked: [],
  touched: [],
  startedByZero: false,
};

// Her reply is delivered and the session goes to work.
const working = { ...quiet, repliedAt: SPOKE, status: 'busy', statusAt: SPOKE + 1_200 };
// It finishes the turn and comes back to its prompt.
const answered = { ...working, status: 'idle', statusAt: SPOKE + 240_000, lastActiveAt: SPOKE + 240_000 };

describe('a reply moves the agent row out of her inbox and into In progress', () => {
  it('was the bug: nothing about the row changed when she replied', () => {
    // With no mark, the row is exactly where it was and says what it said.
    expect(tookHerReply(quiet)).toBe(false);
    expect(reachesInbox(quiet)).toBe(true);
    expect(progressAfterReply(quiet)).toBe(false);
    expect(agentRow(quiet).body).toContain('Close session-a6 if you no longer need it here');
  });

  it('moves to In progress the moment the message is delivered', () => {
    expect(tookHerReply(working)).toBe(true);
    expect(progressAfterReply(working)).toBe(true);
    expect(reachesInbox(working)).toBe(false);
  });

  it('stays there while the session is still idle, because the stamp is older than her reply', () => {
    // The trap. The session has not picked the message up yet, so `status` is
    // the same word it was before she typed. Only the stamp can tell them apart.
    const notYet = { ...quiet, repliedAt: SPOKE };
    expect(notYet.status).toBe('idle');
    expect(stoppedSince(notYet, SPOKE)).toBe(false);
    expect(tookHerReply(notYet)).toBe(true);
    expect(progressAfterReply(notYet)).toBe(true);
  });

  it('comes back to her inbox when the session stops, and the promise ends there', () => {
    expect(stoppedSince(answered, SPOKE)).toBe(true);
    expect(tookHerReply(answered)).toBe(false);
    expect(progressAfterReply(answered)).toBe(false);
    expect(reachesInbox(answered)).toBe(true);
  });

  it('comes back when it stops to ask her something, too', () => {
    const asking = { ...working, status: 'waiting', waitingFor: 'input needed', statusAt: SPOKE + 90_000 };
    expect(tookHerReply(asking)).toBe(false);
    expect(reachesInbox(asking)).toBe(true);
    expect(progressAfterReply(asking)).toBe(false);
  });

  it('is never in both lists at once', () => {
    for (const agent of [quiet, working, answered, { ...working, status: 'shell' }]) {
      expect(reachesInbox(agent) && progressAfterReply(agent)).toBe(false);
    }
  });

  it('promises nothing about a session that publishes no status', () => {
    // 1 of her 16 on 2026-08-17. Agentbox cannot see this one work and cannot see
    // it stop, so it is not moved anywhere; the message is still delivered.
    const silent = { ...quiet, status: null, statusAt: 0, repliedAt: SPOKE };
    expect(tookHerReply(silent)).toBe(false);
    expect(progressAfterReply(silent)).toBe(false);
    expect(reachesInbox(silent)).toBe(true);
  });

  it('says she replied, instead of saying it is asking for nothing', () => {
    const body = agentRow(working).body;
    expect(body).toContain('**You replied, and session-a6 is working on it.**');
    expect(body).not.toContain('asking for nothing');
    // The first sentence carries the whole point inside SUMMARY_BUDGET (112).
    const opening = body.split('\n')[0].replace(/\*\*/g, '');
    expect(opening.length).toBeLessThanOrEqual(112);
  });

  it('is not "quiet for three days" once she has spoken to it', () => {
    const nameless = { ...working, about: '' };
    expect(agentTitle(nameless)).toBe('session-a6 is working on what you told it');
    expect(agentTitle({ ...quiet, about: '' }, SPOKE)).toContain('has been quiet for');
  });

  it('off means off: no agent row reaches either list', () => {
    expect(progressAfterReply(working, Date.now(), 'off')).toBe(false);
    expect(reachesInbox(working, Date.now(), 'off')).toBe(false);
  });

  it('Zero\'s own workers are never in it; they are already work items', () => {
    expect(progressAfterReply({ ...working, startedByZero: true })).toBe(false);
  });

  it('does NOT move a session that is merely busy, which is the thing she killed', () => {
    // That stays dead. What moves a row is her reply and nothing else.
    const busyOnItsOwn = { ...quiet, status: 'busy', statusAt: SPOKE + 5_000 };
    expect(busyOnItsOwn.repliedAt).toBeUndefined();
    expect(tookHerReply(busyOnItsOwn)).toBe(false);
    expect(progressAfterReply(busyOnItsOwn)).toBe(false);
    expect(reachesInbox(busyOnItsOwn)).toBe(true);
  });

  it('a row she closed does not come back as In progress', () => {
    // Closing is her saying she is done with it here. Leaving the reply mark
    // standing would put it in In progress the moment she undid the close.
    expect(tookHerReply({ ...working, doneThrough: SPOKE })).toBe(false);
  });
});

describe('the mark survives, and only a delivered message writes one', () => {
  let dir;
  let sched;
  const key = agentKey(quiet);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-reply-'));
    sched = new AgentSchedule(dir);
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('survives a restart of the app, like the other two facts do', () => {
    sched.replied(key, SPOKE);
    const reread = new AgentSchedule(dir);
    expect(reread.repliedAt(key)).toBe(SPOKE);
    expect(reread.decorate([quiet])[0].repliedAt).toBe(SPOKE);
  });

  it('is keyed on the session, never the pid, so a reused pid inherits nothing', () => {
    sched.replied(key, SPOKE);
    const nextTenant = { ...quiet, sessionId: 'someone-else', name: 'session-99' };
    expect(sched.decorate([quiet, nextTenant])[1].repliedAt).toBeUndefined();
  });

  it('is undone by withdrawing the reply, which puts the row back', () => {
    sched.replied(key, SPOKE);
    sched.replied(key, 0);
    expect(sched.repliedAt(key)).toBe(0);
    expect(sched.decorate([quiet])[0].repliedAt).toBeUndefined();
  });

  it('does not lose a deferral or a close that is standing beside it', () => {
    const soon = Date.now() + 3_600_000;
    sched.set(key, soon);
    sched.replied(key, SPOKE);
    expect(sched.runAt(key)).toBe(soon);
    expect(sched.repliedAt(key)).toBe(SPOKE);
  });

  it('closing the row clears the reply, so undoing the close does not resurrect it', () => {
    sched.replied(key, SPOKE);
    sched.close(key, SPOKE + 1000);
    expect(sched.repliedAt(key)).toBe(0);
    expect(sched.doneThrough(key)).toBe(SPOKE + 1000);
  });

  it('is not swept away by an empty reading, which is what every boot starts with', () => {
    sched.replied(key, SPOKE);
    sched.decorate([]);                       // listAgents answers [] on the first call
    expect(sched.repliedAt(key)).toBe(SPOKE);
  });

  it('goes when the session it names is gone from a real reading', () => {
    sched.replied(key, SPOKE);
    sched.decorate([{ ...quiet, sessionId: 'a-different-session' }]);
    expect(sched.repliedAt(key)).toBe(0);
  });
});
