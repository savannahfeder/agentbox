// A WORKER WHOSE HELPERS ARE STILL WORKING DOES NOT COME BACK TO YOU.
//
// What broke (2026-10-03, the landing page thread): the worker started three
// background builders and ended its turn with "Three builders are working on
// round three. I'll stack them into one page once all three are done." The
// session stayed open for them (tests/an-agent-waiting-on-its-own-tests-does-
// not-come-back-to-you). Then the Mac slept from about 03:36 to 03:52. On the
// first pass after the wake the hang check saw sixteen minutes of silence and a
// lapsed claim, both made by the sleep, and stopped the worker (trace: exit 143
// at 03:52:34, two seconds after the wake). The exit handler saw a clean result
// on the session, read that as "finished under its own power", dropped the
// record it resumes from, and landed the promise on the row as the answer. The
// thread sat in her inbox reading Waiting for a day and a half until she typed
// "status?".
//
// Measured with scripts/scratch/promises-that-came-back.mjs over every run log
// on her Mac: 24 runs ended this way since August, two of them after a sleep.
//
// Two fixes, tested here. Time the Mac spent asleep is not silence. And a
// session stopped with work still out did not finish: it is resumed, and its
// last turn's promise is not written as the answer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Supervisor } from '../main/supervisor.mjs';
import { attachClaudeInput } from '../main/claude-input.mjs';
import { Name } from '../shared/product-name.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-helpers-out-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const SEC = 1000;
const MIN = 60 * SEC;
const NOW = 1_790_999_552_000;
const PROMISE = "Three builders are working on round three. I'll stack them into one page once all three are done.";

function makeSupervisor({ row = null } = {}) {
  const written = [];
  const released = [];
  const store = {
    listItems: () => (row ? [row] : []),
    listProducts: () => [{ slug: 'agentbox', name: Name, dir: path.join(tmp, 'agentbox') }],
    isDue: () => true,
    readItem: () => row,
    recordSessionResult: (slug, id, patch) => written.push({ slug, id, ...patch }),
    releaseRunClaim: (slug, id) => released.push(id),
  };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
  sup._saveState = () => {};
  sup.storeMcpCommand = () => '/bin/agentbox-mcp.sh';
  return { sup, written, released };
}

function liveSession(sup, id, { quietSince }) {
  const session = { itemId: id, product: 'agentbox', startedAt: NOW - 60 * MIN, lastOutputAt: quietSince, tail: [], killed: 0 };
  session.child = { kill: () => { session.killed += 1; } };
  sup.sessions.set(id, session);
  return session;
}

const lapsed = (id) => ({
  id, product: 'agentbox', status: 'claimed',
  claim: { holder: 'mcp-1', leaseUntil: NOW - 10 * MIN }, claimExpired: true,
});

describe('time the Mac spent asleep is not silence', () => {
  it('does not stop a worker on the first pass after a sixteen minute sleep', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-landing', { quietSince: NOW - 16 * MIN });
    sup._lastTickAt = NOW - 16 * MIN;
    sup.forgiveSleep(NOW);
    expect(sup.reapHungSessions([lapsed('w-landing')], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('runs through the real tick, so the pass that reaps is the one that forgives', async () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-landing', { quietSince: Date.now() - 16 * MIN });
    sup._lastTickAt = Date.now() - 16 * MIN;
    sup._tick = async () => { sup.reapHungSessions([lapsed('w-landing')], Date.now()); };
    await sup.tick();
    expect(s.killed).toBe(0);
  });

  it('still stops a worker that went quiet while the Mac was awake', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-hung', { quietSince: NOW - 12 * MIN });
    sup._lastTickAt = NOW - 15 * SEC;
    sup.forgiveSleep(NOW);
    expect(sup.reapHungSessions([lapsed('w-hung')], NOW)).toEqual(['w-hung']);
    expect(s.killed).toBe(1);
  });

  it('still stops a worker that stays silent for ten minutes after the wake', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-hung', { quietSince: NOW - 16 * MIN });
    sup._lastTickAt = NOW - 16 * MIN;
    sup.forgiveSleep(NOW);
    const later = NOW + 11 * MIN;
    sup._lastTickAt = later - 15 * SEC;
    sup.forgiveSleep(later);
    expect(sup.reapHungSessions([lapsed('w-hung')], later)).toEqual(['w-hung']);
    expect(s.killed).toBe(1);
  });

  it('forgives nothing on the very first pass, when there is no last pass to measure from', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-hung', { quietSince: NOW - 12 * MIN });
    sup._lastTickAt = 0;
    sup.forgiveSleep(NOW);
    expect(s.lastOutputAt).toBe(NOW - 12 * MIN);
  });
});

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stdin = { writable: true, write: () => true, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, ...events) => c.stdout.emit('data', events.map((e) => JSON.stringify(e)).join('\n') + '\n');
const out = (...ids) => ({ type: 'system', subtype: 'background_tasks_changed', tasks: ids.map((task_id) => ({ task_id, task_type: 'local_agent', description: 'Build feature sections' })) });
const turn = { type: 'assistant', message: { content: [{ type: 'text', text: 'All three are stacked.' }] } };

describe('the input pipe knows whether the run reached its end', () => {
  it('has not, at a turn that ended with helpers still out', () => {
    const c = attachClaudeInput(fakeChild());
    say(c, out('a1', 'a2', 'a3'), { type: 'result', result: PROMISE });
    expect(c.ranToTheEnd()).toBe(false);
  });

  it('has, at the result it gives once every helper has reported', () => {
    const c = attachClaudeInput(fakeChild());
    say(c, out('a1'), { type: 'result', result: PROMISE });
    say(c, out(), turn, { type: 'result', result: 'All three are stacked.' });
    expect(c.ranToTheEnd()).toBe(true);
  });

  it('has not, in the middle of a turn after an earlier result', () => {
    const c = attachClaudeInput(fakeChild());
    say(c, out('a1'), { type: 'result', result: PROMISE });
    say(c, out(), turn);
    expect(c.ranToTheEnd()).toBe(false);
  });

  it('has, for an ordinary run that started nothing in the background', () => {
    const c = attachClaudeInput(fakeChild());
    say(c, turn, { type: 'result', result: 'Done.' });
    expect(c.ranToTheEnd()).toBe(true);
  });
});

describe('a worker stopped with its helpers out did not finish', () => {
  const stopped = (sup, ranToTheEnd) => ({
    itemId: 'w-landing', product: 'agentbox', startedAt: NOW - 30 * MIN,
    result: PROMISE, resultIsError: false,
    child: ranToTheEnd === undefined ? {} : { ranToTheEnd: () => ranToTheEnd },
  });
  const row = { id: 'w-landing', product: 'agentbox', status: 'claimed', wrote: {} };

  it('does not land its promise on the row as the answer', () => {
    const { sup } = makeSupervisor({ row });
    expect(sup.closingMessageIsTheAnswer(stopped(sup, false))).toBe(false);
  });

  it('still lands the closing message of a run that did reach its end', () => {
    const { sup } = makeSupervisor({ row });
    expect(sup.closingMessageIsTheAnswer(stopped(sup, true))).toBe(true);
  });

  it('keeps the old reading for a worker whose pipe cannot say (a Codex run)', () => {
    const { sup } = makeSupervisor({ row });
    expect(sup.closingMessageIsTheAnswer(stopped(sup, undefined))).toBe(true);
  });

  it('does not land it on an install with no store tools either', () => {
    const { sup } = makeSupervisor({ row });
    sup.storeMcpCommand = () => null;
    expect(sup.speaksForTheSession(stopped(sup, false))).toBe(false);
    expect(sup.speaksForTheSession(stopped(sup, true))).toBe(true);
  });

  it('does not hand back its claim as if the run were over', () => {
    const { sup, released } = makeSupervisor({ row });
    sup.releaseFinishedClaim(row, stopped(sup, false));
    expect(released).toEqual([]);
    sup.releaseFinishedClaim(row, stopped(sup, true));
    expect(released).toEqual(['w-landing']);
  });

  it('keeps the record it resumes from, and the wake sweep puts it back', () => {
    const { sup } = makeSupervisor({ row });
    sup._liveSessions['w-landing'] = { sessionId: 'sess-landing', product: 'agentbox', cwd: tmp, profile: 'default' };
    expect(sup.forgetFinishedSession(row, stopped(sup, false))).toBe(false);
    expect(sup._liveSessions['w-landing']).toBeTruthy();
    const resumed = [];
    sup.transcriptFile = () => path.join(tmp, 'sess-landing.jsonl');
    sup._resumeInterrupted = (item) => { resumed.push(item.id); return true; };
    sup.recoverInterrupted('wake');
    expect(resumed).toEqual(['w-landing']);
  });

  it('forgets the record of a run that did reach its end', () => {
    const { sup } = makeSupervisor({ row });
    sup._liveSessions['w-landing'] = { sessionId: 'sess-landing', product: 'agentbox', cwd: tmp, profile: 'default' };
    expect(sup.forgetFinishedSession(row, stopped(sup, true))).toBe(true);
    expect(sup._liveSessions['w-landing']).toBeUndefined();
  });
});
