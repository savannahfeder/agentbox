// AN AGENT ROW CAN BE PUT OFF, LIKE ANY OTHER ROW IN THE INBOX.
//
// The row was session-71, waiting four days in her inbox — one of the agents
// the new feature surfaces, running in a terminal that did not start in Agentbox.
// Every deferring path in the app refused it on sight, and refused it in
// silence: `openSnooze` returned early on `item.agent`, the focus footer drew no
// button, and S in the inbox did nothing at all. She pressed a key, the app took
// the keystroke, and nothing happened.
//
// The refusal was right about work items and wrong about this one gesture.
// Closing, restarting and stopping are all promises about somebody else's
// terminal and Agentbox keeps none of them. Putting a row off is a promise about
// HER INBOX, and her inbox is hers: nothing is sent, no process is touched, and
// the session keeps waiting exactly as it was.
//
// Two ways this goes wrong with no symptom, which is why both are pinned here:
//
//   1. The moment is keyed on the pid. A pid is not an identity (sameInstant,
//      and the whole reason `stillTheSame` exists): pids are reused, so the
//      next session to land on 68909 would inherit a deferral she set on
//      session-71 and would be missing from her inbox with nothing to see.
//   2. The file gets swept against an empty reading. `listAgents` answers []
//      on the first call of every boot and again whenever a `ps` fails, so a
//      sweep that trusts it clears every moment she has ever set, at every app
//      start, and every deferred row comes back at once.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentKey, putOff, putAway, listed, reachesInbox } from '../shared/agents.mjs';
import { AgentSchedule } from '../main/agent-schedule.mjs';
import { NAME } from '../shared/product-name.mjs';

const NOW = Date.parse('2026-08-16T23:40:00Z');
const TOMORROW = NOW + 8 * 3_600_000;

// session-71 exactly as her machine reported it.
const stalled = {
  pid: 68909,
  ppid: 68899,
  sessionId: 'a71-real-session-id',
  name: 'session-71',
  cwd: '/tmp/agentbox-fixture-repo',
  startedAt: Date.parse('2026-08-12T22:57:59Z'),
  status: 'waiting',
  waitingFor: 'input needed',
  lastActiveAt: Date.parse('2026-08-12T17:03:00Z'),
  lastSaid: 'Which of the two names do you want on the button?',
  startedByZero: false,
};

describe('an agent she has put off stops interrupting her, and nothing else changes', () => {
  it('leaves her inbox until the moment she named', () => {
    expect(reachesInbox(stalled, NOW)).toBe(true);
    const later = { ...stalled, runAt: TOMORROW };
    expect(putOff(later, NOW)).toBe(true);
    expect(reachesInbox(later, NOW)).toBe(false);
  });

  it('comes back when the moment passes, and comes back LATE rather than never', () => {
    const later = { ...stalled, runAt: TOMORROW };
    expect(reachesInbox(later, TOMORROW + 1)).toBe(true);
    // Three days asleep past the moment: the predicate is true forever after,
    // so the first look when the lid opens is as good as the one at 8am.
    expect(reachesInbox(later, TOMORROW + 3 * 86_400_000)).toBe(true);
  });

  it('is still listed the whole time, because it is deferred and not hidden', () => {
    expect(listed({ ...stalled, runAt: TOMORROW })).toBe(true);
  });

  it(`never puts one of ${NAME}'s own workers in the inbox by way of a moment`, () => {
    const ours = { ...stalled, startedByZero: true, runAt: 0 };
    expect(reachesInbox(ours, NOW)).toBe(false);
  });
});

// AND CLOSING ONE IS FINAL.
describe('an agent she has closed leaves her inbox, and the inbox can reach zero', () => {
  it('goes when she closes it', () => {
    const closed = { ...stalled, doneThrough: stalled.lastActiveAt };
    expect(putAway(closed)).toBe(true);
    expect(reachesInbox(closed, NOW)).toBe(false);
  });

  // THIS TEST USED TO ASSERT THE OPPOSITE, and the sentence that changed it is
  // in the name. If anyone puts the watermark back, this fails.
  it('stays closed when that session says something newer, because done stays done', () => {
    const closed = { ...stalled, doneThrough: stalled.lastActiveAt };
    const spoke = { ...closed, lastActiveAt: closed.lastActiveAt + 1 };
    expect(putAway(spoke)).toBe(true);
    expect(reachesInbox(spoke, NOW)).toBe(false);
  });

  // The cost of this rule, written down rather than discovered later: a session
  // she closed while it was working does not come back to ask her something.
  it('stays closed even when it stops and asks her a question', () => {
    const closed = { ...stalled, doneThrough: stalled.lastActiveAt };
    const asking = {
      ...closed,
      lastActiveAt: closed.lastActiveAt + 60_000,
      status: 'waiting',
      waitingFor: 'input needed',
    };
    expect(putAway(asking)).toBe(true);
    expect(reachesInbox(asking, NOW)).toBe(false);
  });

  // "unless asked otherwise" has to have a way through, and this is it: the
  // same close with 0, which is exactly what her undo sends.
  it('and comes back when she asks for it, which is the undo sending zero', () => {
    const closed = { ...stalled, doneThrough: stalled.lastActiveAt };
    expect(reachesInbox(closed, NOW)).toBe(false);
    expect(reachesInbox({ ...closed, doneThrough: 0 }, NOW)).toBe(true);
  });

  // The mark is a moment she set, not the session's clock, so its VALUE cannot
  // decide anything any more. A mark far behind the session still closes it.
  it('closes the row whatever the mark is worth against the session', () => {
    expect(putAway({ ...stalled, doneThrough: 1 })).toBe(true);
    expect(putAway({ ...stalled, doneThrough: stalled.lastActiveAt - 86_400_000 })).toBe(true);
  });

  it('and stays closed forever while it sits still, which is what closing means', () => {
    const closed = { ...stalled, doneThrough: stalled.lastActiveAt };
    expect(reachesInbox(closed, NOW + 30 * 86_400_000)).toBe(false);
  });

  it('is still listed, so closing the row never hides the session from her', () => {
    expect(listed({ ...stalled, doneThrough: stalled.lastActiveAt })).toBe(true);
  });

  it('no watermark is not a closed row', () => {
    expect(putAway(stalled)).toBe(false);
    expect(putAway({ ...stalled, doneThrough: 0 })).toBe(false);
  });

  it('THE WHOLE MEASURED MACHINE REACHES INBOX ZERO once the one asking row is closed', () => {
    const machine = [{ ...stalled, doneThrough: stalled.lastActiveAt }];
    expect(machine.filter((a) => reachesInbox(a, NOW))).toHaveLength(0);
    expect(machine.filter(listed)).toHaveLength(1);
  });
});

describe('which agent she put off, and why it is not the pid', () => {
  it('keys on the session, which is the session\'s own name for itself', () => {
    expect(agentKey(stalled)).toBe('session:a71-real-session-id');
  });

  it('a new session at a reused pid does not inherit her deferral', () => {
    const reused = { pid: 68909, sessionId: 'somebody-elses-session', startedAt: NOW };
    expect(agentKey(reused)).not.toBe(agentKey(stalled));
  });

  it('with no sessionId it falls back to the pid AND the instant it started', () => {
    const noSession = { pid: 68909, startedAt: stalled.startedAt };
    const sameSlot = { pid: 68909, startedAt: NOW };
    expect(agentKey(noSession)).toBe(`pid:68909:${stalled.startedAt}`);
    expect(agentKey(sameSlot)).not.toBe(agentKey(noSession));
  });
});

describe('the moment survives a restart, which is the whole reason it is not in the renderer', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-agent-sched-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('is on disk, and a fresh app reads it back', () => {
    new AgentSchedule(root).set(agentKey(stalled), TOMORROW, NOW);
    const reopened = new AgentSchedule(root);
    expect(reopened.runAt(agentKey(stalled))).toBe(TOMORROW);
    expect(reopened.decorate([stalled], NOW)[0].runAt).toBe(TOMORROW);
  });

  it('0 brings it back now, and that survives a restart too', () => {
    const sched = new AgentSchedule(root);
    sched.set(agentKey(stalled), TOMORROW, NOW);
    expect(sched.set(agentKey(stalled), 0, NOW)).toBe(0);
    expect(new AgentSchedule(root).decorate([stalled], NOW)[0].runAt).toBeUndefined();
  });

  it('refuses to store a moment that is already past, which would mean nothing', () => {
    const sched = new AgentSchedule(root);
    expect(sched.set(agentKey(stalled), NOW - 60_000, NOW)).toBe(0);
    expect(sched.runAt(agentKey(stalled))).toBe(0);
  });

  // THE SWEEP THAT WOULD HAVE EATEN THE FILE. Every app start calls this with
  // an empty list before the first measurement lands.
  it('an empty reading is not evidence that every session has exited', () => {
    const sched = new AgentSchedule(root);
    sched.set(agentKey(stalled), TOMORROW, NOW);
    sched.decorate([], NOW);
    expect(sched.runAt(agentKey(stalled))).toBe(TOMORROW);
    expect(new AgentSchedule(root).runAt(agentKey(stalled))).toBe(TOMORROW);
  });

  it('but a real reading without it drops the moment, so the file cannot grow forever', () => {
    const sched = new AgentSchedule(root);
    sched.set(agentKey(stalled), TOMORROW, NOW);
    sched.decorate([{ pid: 1, sessionId: 'someone-else', startedAt: NOW }], NOW);
    expect(sched.runAt(agentKey(stalled))).toBe(0);
  });

  it('and a moment that has passed is dropped rather than kept forever', () => {
    const sched = new AgentSchedule(root);
    sched.set(agentKey(stalled), TOMORROW, NOW);
    const out = sched.decorate([stalled], TOMORROW + 1);
    expect(out[0].runAt).toBeUndefined();
    expect(sched.runAt(agentKey(stalled))).toBe(0);
  });

  it('keeps the close watermark across a restart, and 0 undoes it', () => {
    const sched = new AgentSchedule(root);
    sched.close(agentKey(stalled), stalled.lastActiveAt, NOW);
    expect(new AgentSchedule(root).decorate([stalled], NOW)[0].doneThrough).toBe(stalled.lastActiveAt);
    sched.close(agentKey(stalled), 0, NOW);
    expect(new AgentSchedule(root).decorate([stalled], NOW)[0].doneThrough).toBeUndefined();
  });

  it('holds both facts at once, so closing one does not clear the other', () => {
    const sched = new AgentSchedule(root);
    sched.set(agentKey(stalled), TOMORROW, NOW);
    sched.close(agentKey(stalled), stalled.lastActiveAt, NOW);
    const back = new AgentSchedule(root);
    expect(back.runAt(agentKey(stalled))).toBe(TOMORROW);
    expect(back.doneThrough(agentKey(stalled))).toBe(stalled.lastActiveAt);
  });

  // A closed row has no moment to pass, so the sweep must not read it as inert.
  it('does not sweep away a closed row just because its moment is gone', () => {
    const sched = new AgentSchedule(root);
    sched.close(agentKey(stalled), stalled.lastActiveAt, NOW);
    sched.decorate([stalled], NOW + 365 * 86_400_000);
    expect(sched.doneThrough(agentKey(stalled))).toBe(stalled.lastActiveAt);
  });

  it('a half-written file reads as "nothing is put off" rather than throwing', () => {
    fs.writeFileSync(path.join(root, '.zero-agent-schedule.json'), '{"session:x": {"runAt": 17');
    expect(new AgentSchedule(root).runAt('session:x')).toBe(0);
  });
});
