// WHERE A PROPOSAL LIVES, AND WHAT SILENCE DOES TO IT (w-9cf2b43110).
//
// Said 2026-10-05, after the Approve press shipped:
//
//   "I shouldn't have to see those. They're often a little confusing, and
//   there's lots of technical terminology. It's basically agents talking to
//   each other... my expectation is that I am the human in the loop in the
//   inbox and I only see things that need me."
//
// and, on what happens if nobody answers one:
//
//   "let's say you don't see it or forget to respond, then you lose content,
//   like tasks, which is the issue, right?"
//
// So the rule is in two halves and neither works alone:
//
//   A PROPOSAL IS NEVER AN INBOX ROW. One open task an agent filed under a
//   thread used to be one row in Needs you — agent-to-agent text addressed to
//   nobody. It now waits in Later, which is already the app's word for written
//   down and deliberately not begun, and the thread that proposed it shows it
//   with the press.
//
//   AND SILENCE HAS A DEADLINE. Later is where things are lost: "sometimes the
//   tab later is not meant to be looked at". So if a day goes by with a
//   proposal neither approved nor rejected, the THREAD that filed it comes
//   back to the inbox — never the proposal itself, because the thread is the
//   half written in words a person wrote. 24 hours, their range: "24 - 72
//   hours, somewhere there... Even 3 days is ancient tbh".
//
// Nothing here deletes anything. A proposal nobody ever answers sits in Later
// for good. Its thread keeps asking until you close it yourself.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  PROPOSAL_PATIENCE, belongsInInbox, isProposal, threadsOwedAnAnswer,
} from '../renderer/src/list-rules.ts';
import { approvableFiled } from '../renderer/src/threads-made.ts';

const now = 1_800_000_000_000;
const HOUR = 3_600_000;
// What an agent files under a thread it is working: open, a task, no answer.
const proposal = (over = {}) => ({
  id: 'w-kid', product: 'kestrel', status: 'open', kind: 'task', labels: [],
  parent: 'w-mum', createdAt: now - HOUR, updatedAt: now - HOUR, ...over,
});
const inbox = (i) => belongsInInbox(i, { deliveredThrough: 0, now });

describe('a proposal is not a row in the inbox', () => {
  it('keeps an agent-to-agent task out of Needs you', () => {
    expect(isProposal(proposal())).toBe(true);
    expect(inbox(proposal())).toBe(false);
  });

  it('still shows a QUESTION an agent filed, which is addressed to you', () => {
    expect(isProposal(proposal({ kind: 'question' }))).toBe(false);
    expect(inbox(proposal({ kind: 'question' }))).toBe(true);
  });

  it('still shows a REVIEW an agent filed, whose options you have to read', () => {
    expect(isProposal(proposal({ kind: 'review' }))).toBe(false);
    expect(inbox(proposal({ kind: 'review' }))).toBe(true);
  });

  // NOTHING MAY BE HIDDEN WITH NOWHERE TO BE REACHED FROM, which is the rule
  // the thread mask already keeps. A proposal is hidden because the thread
  // that filed it shows it; one filed under no thread has no such carrier and
  // stays exactly where it was.
  it('still shows one filed under no thread at all', () => {
    expect(isProposal(proposal({ parent: undefined }))).toBe(false);
    expect(inbox(proposal({ parent: undefined }))).toBe(true);
  });

  it('still shows a thread you wrote yourself, which is not a proposal', () => {
    expect(isProposal(proposal({ labels: ['founder'] }))).toBe(false);
  });

  it('is no longer a proposal once it has been approved', () => {
    expect(isProposal(proposal({ answer: 'Run it.' }))).toBe(false);
  });

  it('is a proposal again if the approval was withdrawn', () => {
    expect(isProposal(proposal({ answer: '(withdrawn)' }))).toBe(true);
  });

  it('is not one a worker already has, nor a finished or blocked one', () => {
    expect(isProposal(proposal({ status: 'claimed' }))).toBe(false);
    expect(isProposal(proposal({ status: 'done' }))).toBe(false);
    expect(isProposal(proposal({ status: 'blocked' }))).toBe(false);
  });
});

describe('the press stays on it while it waits in Later', () => {
  // The press reads the tab the row is in, and the tab is now Later rather
  // than Needs you. Without this the chip vanished the moment the proposal
  // moved, which is the whole feature gone.
  it('is approvable from the thread while it sits in Later', () => {
    expect(approvableFiled(proposal(), 'scheduled')).toBe(true);
    expect(approvableFiled(proposal(), 'waiting')).toBe(true);
  });

  it('is not approvable once it is moving, however open its fields read', () => {
    expect(approvableFiled(proposal(), 'running')).toBe(false);
    expect(approvableFiled(proposal(), 'done')).toBe(false);
    expect(approvableFiled(proposal(), null)).toBe(false);
  });

  it('is not one you parked in Later yourself, which needs no approval', () => {
    expect(approvableFiled(proposal({ start: 'later' }), 'scheduled')).toBe(false);
  });
});

describe('silence brings the thread back after a day', () => {
  const mum = { id: 'w-mum', product: 'kestrel', status: 'done', kind: 'task', labels: [], createdAt: now - 48 * HOUR, updatedAt: now - 30 * HOUR };
  const owed = (items) => threadsOwedAnAnswer(items, now);

  it('waits a day and not a week', () => {
    expect(PROPOSAL_PATIENCE).toBe(24 * HOUR);
  });

  it('leaves the thread alone while the proposal is young', () => {
    expect(owed([mum, proposal({ createdAt: now - 23 * HOUR })]).has('w-mum')).toBe(false);
  });

  it('asks the thread again once a day has gone by with no answer', () => {
    expect(owed([mum, proposal({ createdAt: now - 25 * HOUR })]).has('w-mum')).toBe(true);
  });

  it('names the thread, never the proposal: you never see the agent-to-agent row', () => {
    const set = owed([mum, proposal({ createdAt: now - 25 * HOUR })]);
    expect(set.has('w-kid')).toBe(false);
  });

  it('stops asking once it is approved, and once it is rejected', () => {
    const old = { createdAt: now - 25 * HOUR };
    expect(owed([mum, proposal({ ...old, answer: 'Run it.' })]).has('w-mum')).toBe(false);
    expect(owed([mum, proposal({ ...old, answer: '(rejected)', status: 'done' })]).has('w-mum')).toBe(false);
  });

  it('asks a thread an agent finished, until you close it yourself', () => {
    expect(owed([{ ...mum, status: 'done', wrote: { status: { source: 'agent', ts: now - HOUR } } }, proposal({ createdAt: now - 25 * HOUR })]).has('w-mum')).toBe(true);
  });

  it('says nothing about a thread whose proposals are all answered', () => {
    expect(owed([mum, proposal({ answer: 'Run it.', createdAt: now - 99 * HOUR })]).size).toBe(0);
  });

  it('only ever names a thread that is there to be named', () => {
    // The parent is in another product, or gone: there is nothing to put in
    // the inbox, so the proposal itself has to stay reachable on its own.
    expect(owed([proposal({ createdAt: now - 25 * HOUR })]).size).toBe(0);
  });

  it('keeps a proposal out of the inbox even after the deadline', () => {
    // The thread comes back; the agent-to-agent row never does.
    expect(inbox(proposal({ createdAt: now - 99 * HOUR }))).toBe(false);
  });
});

describe('where the two lists read it', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  it('Later holds the proposals, beside what you parked yourself', () => {
    expect(app).toMatch(/notStarted\(i\) \|\| isProposal\(i\) \|\| hiddenAt\(i\) > now/);
  });

  it('the inbox lets a thread back in when it is owed an answer', () => {
    expect(app).toMatch(/threadsOwedAnAnswer\(items, now\)/);
    expect(app).toMatch(/if \(owedAnAnswer\.has\(i\.id\)\) return true;/);
  });

  // The team branch answers before the pure rule does, so a shared project
  // would otherwise hand the agent-to-agent rows straight back.
  it('a shared project hides them too', () => {
    expect(app).toMatch(/if \(shared === true\) return i\.status !== 'done' && !\(hiddenAt\(i\) > now\) && !isProposal\(i\);/);
  });
});
