// A REPLY TO A CLOUD THREAD GOES STRAIGHT TO THE AGENT THAT JUST ANSWERED.
//
// Reported 2026-11-08 during a practice interview run as a cloud thread: every
// one-line answer took minutes to get a reply. A cloud turn closed its agent's
// input at the turn's end, so the run ended, and each reply started a new
// machine. Measured on the cloud run that took the report: 54 s from the
// message to the machine booting, 30 s laying files in, 23 s of project setup,
// 14 s to the agent's first step, about two minutes before it read a word.
//
// Now a cloud session stays open for `WAIT_FOR_NEXT_REPLY_MS` after it answers.
// The answer reaches the row at once and the row leaves In progress, and a
// reply in that time is written straight into the open session.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mts';
import { submitReply } from '../main/live-replies.mts';
import { Supervisor, WAIT_FOR_NEXT_REPLY_MS } from '../main/supervisor.mts';
import { Name } from '../shared/product-name.mjs';

afterEach(() => { vi.useRealTimers(); });

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.frames = [];
  c.stdin = { writable: true, write: (s) => { c.frames.push(JSON.parse(s)); return true; }, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, ...events) => c.stdout.emit('data', events.map((e) => JSON.stringify(e)).join('\n') + '\n');
const result = (text) => ({ type: 'result', result: text });
const tick = () => new Promise((r) => setImmediate(r));

describe('the input stays open between turns', () => {
  it('a result leaves the input open, says the turn is over, and counts as the end of the work', async () => {
    const c = attachClaudeInput(fakeChild());
    c.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    const over = vi.fn();
    c.on('turn-over', over);
    say(c, result('Tell me about yourself.'));
    expect(c.stdin.writable).toBe(true);
    expect(c.waitingForNext()).toBe(true);
    expect(c.ranToTheEnd()).toBe(true);
    await tick();
    expect(over).toHaveBeenCalledTimes(1);
  });

  it('a reply goes in, starts the next turn, and that turn ends the same way', async () => {
    const c = attachClaudeInput(fakeChild());
    c.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    const over = vi.fn(), next = vi.fn();
    c.on('turn-over', over);
    c.on('next-turn', next);
    say(c, result('First question.'));
    await tick();
    const taken = c.steer('I led a team of four.');
    expect(next).toHaveBeenCalledTimes(1);
    expect(c.waitingForNext()).toBe(false);
    expect(c.ranToTheEnd()).toBe(false);
    say(c, { type: 'user', uuid: c.frames.at(-1).uuid, message: { content: 'I led a team of four.' } });
    await taken;
    say(c, { type: 'assistant', message: { content: [{ type: 'text', text: 'Second question.' }] } }, result('Second question.'));
    await tick();
    expect(over).toHaveBeenCalledTimes(2);
    expect(c.stdin.writable).toBe(true);
  });

  it('closes once the wait runs out with nothing sent', () => {
    vi.useFakeTimers();
    const c = attachClaudeInput(fakeChild());
    c.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    say(c, result('Done.'));
    vi.advanceTimersByTime(WAIT_FOR_NEXT_REPLY_MS - 1000);
    expect(c.stdin.writable).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(c.stdin.writable).toBe(false);
    expect(c.ranToTheEnd()).toBe(true);
  });

  it('a reply resets the wait: the clock starts again from the next answer', () => {
    vi.useFakeTimers();
    const c = attachClaudeInput(fakeChild());
    c.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    say(c, result('One.'));
    vi.advanceTimersByTime(WAIT_FOR_NEXT_REPLY_MS - 1000);
    c.steer('and another');
    say(c, { type: 'user', uuid: c.frames.at(-1).uuid, message: { content: 'and another' } }, result('Two.'));
    vi.advanceTimersByTime(WAIT_FOR_NEXT_REPLY_MS - 1000);
    expect(c.stdin.writable).toBe(true);
  });

  it('stopWaiting closes it now', () => {
    const c = attachClaudeInput(fakeChild());
    c.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    say(c, result('Done.'));
    c.stopWaiting();
    expect(c.stdin.writable).toBe(false);
  });

  it('does not wait while a background job is still out, as before', () => {
    const c = attachClaudeInput(fakeChild());
    c.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    say(c, { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 't1', description: 'tests' }] }, result('Tests are running.'));
    expect(c.waitingForNext()).toBe(false);
    expect(c.ranToTheEnd()).toBe(false);
  });

  it('a session not asked to wait still closes at its result', () => {
    const c = attachClaudeInput(fakeChild());
    say(c, result('Done.'));
    expect(c.stdin.writable).toBe(false);
  });
});

describe('a reply between turns', () => {
  function setup(session) {
    const sent = [];
    const s = { product: 'p', child: { steer: async (text) => { sent.push(text); } }, ...session };
    const supervisor = {
      sessions: new Map([['w', s]]),
      _handledAnswers: new Set(), _answerKey: (i) => i.answer, _saveState() {},
      nextReplyBrief: (product, id, answer) => `REPLY BRIEF for ${id}: ${answer}`,
    };
    return { supervisor, sent };
  }

  it('is written into the open session as a reply to a finished turn, not as words "while you work"', async () => {
    const { supervisor, sent } = setup({ between: true });
    await submitReply(supervisor, { product: 'p', id: 'w', answer: 'I led a team of four.' }, () => ({ answer: 'I led a team of four.' }));
    expect(sent).toEqual(['REPLY BRIEF for w: I led a team of four.']);
  });

  it('a session mid-turn still gets the "while you work" framing', async () => {
    const { supervisor, sent } = setup({});
    await submitReply(supervisor, { product: 'p', id: 'w', answer: 'hello' }, () => ({ answer: 'hello' }));
    expect(sent[0]).toMatch(/while you work/);
  });

  it('a slash command or a new permission mode is saved for a new run instead', async () => {
    const { supervisor, sent } = setup({ between: true });
    await submitReply(supervisor, { product: 'p', id: 'w', answer: '/compact' }, () => ({ answer: '/compact' }));
    await submitReply(supervisor, { product: 'p', id: 'w', answer: 'go', permissionMode: 'plan' }, () => ({ answer: 'go' }));
    expect(sent).toEqual([]);
  });
});

describe('the app between turns', () => {
  let tmp;
  afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; });

  function makeSupervisor(row) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'between-turns-'));
    const written = [], released = [];
    const store = {
      listItems: () => [row],
      listProducts: () => [{ slug: 'p', name: Name, dir: path.join(tmp, 'p') }],
      isDue: () => true,
      readItem: () => row,
      recordSessionResult: (slug, id, patch) => {
        written.push(patch);
        row.result = patch.result;
        row.wrote = { ...row.wrote, result: { source: 'agent', ts: Date.now() } };
      },
      releaseRunClaim: (slug, id, at) => released.push(at),
      settleAnswer: () => {},
    };
    const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
    sup._saveState = () => {};
    sup.storeMcpCommand = () => '/bin/agentbox-mcp.sh';
    return { sup, written, released };
  }

  function cloudSession(sup, row) {
    const child = attachClaudeInput(fakeChild());
    child.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    const session = {
      child, itemId: row.id, product: 'p', startedAt: Date.now() - 60_000, tail: [], cloud: true, engine: 'claude',
      ranOn: { model: row.model ?? null, effort: row.effort ?? null },
    };
    sup.sessions.set(row.id, session);
    return session;
  }

  const interview = () => ({ id: 'w-int', product: 'p', status: 'claimed', epoch: 3, labels: ['founder'], title: 'Practice interview', wrote: {} });

  it('puts the answer on the row, gives the claim back and takes the row off In progress', () => {
    const row = interview();
    const { sup, written, released } = makeSupervisor(row);
    const s = cloudSession(sup, row);
    s.result = 'Tell me about a project you led.';
    say(s.child, result(s.result));
    sup._turnOver(row, s, { continuation: false, answerAtSpawn: null });
    expect(written).toEqual([{ result: 'Tell me about a project you led.', status: null }]);
    expect(released).toEqual([{ afterEpoch: 3, startedAt: s.startedAt }]);
    expect(s.between).toBe(true);
    expect(sup.runsGoing()).toEqual([]);
    expect(sup.liveFor('p', 'w-int')).toBeNull();
    expect(sup.status().running).toEqual([]);
  });

  it('writes the second turn\'s answer too, and releases the claim that turn took', async () => {
    const row = interview();
    const { sup, written, released } = makeSupervisor(row);
    const s = cloudSession(sup, row);
    s.result = 'First question.';
    say(s.child, result(s.result));
    sup._turnOver(row, s, { continuation: false, answerAtSpawn: null });
    // A person's reply comes some time after the answer it answers.
    await new Promise((r) => setTimeout(r, 5));
    row.epoch = 4;
    s.child.steer('My answer.');
    sup._nextTurn(s);
    expect(s.between).toBe(false);
    expect(sup.runsGoing()).toHaveLength(1);
    say(s.child, { type: 'user', uuid: s.child.frames.at(-1).uuid, message: { content: 'My answer.' } }, result('Second question.'));
    s.result = 'Second question.';
    sup._turnOver(row, s, { continuation: false, answerAtSpawn: null });
    expect(written.map((w) => w.result)).toEqual(['First question.', 'Second question.']);
    expect(released[1]).toEqual({ afterEpoch: 4, startedAt: s.turnStartedAt });
  });

  it('does not wait on a row sent to ship, closed, moved to another model, or a failed turn', () => {
    for (const change of [{ labels: ['founder', 'ship'] }, { status: 'done' }, { model: 'sonnet' }, 'error']) {
      const row = interview();
      const { sup, written } = makeSupervisor(row);
      const s = cloudSession(sup, row);
      say(s.child, result('Done.'));
      if (change === 'error') { s.result = 'Usage limit reached'; s.resultIsError = true; } else { s.result = 'Done.'; Object.assign(row, change); }
      sup._turnOver(row, s, { continuation: false, answerAtSpawn: null });
      expect(s.between).toBeFalsy();
      expect(written).toEqual([]);
      expect(s.child.stdin.writable).toBe(false);
    }
  });

  it('the tick ends a wait that a saved reply overtook, so a new run carries it', () => {
    const row = interview();
    const { sup } = makeSupervisor(row);
    const s = cloudSession(sup, row);
    s.result = 'Question.';
    say(s.child, result(s.result));
    sup._turnOver(row, s, { continuation: false, answerAtSpawn: null });
    sup.endWaitsOvertaken([row]);
    expect(s.child.stdin.writable).toBe(true);
    Object.assign(row, { status: 'open', answer: 'from a teammate', wrote: { ...row.wrote, answer: { ts: Date.now() + 1, source: 'system', from: 'Sam' } } });
    sup.endWaitsOvertaken([row]);
    expect(s.child.stdin.writable).toBe(false);
  });

  it('a quiet session between turns is not reaped as hung', () => {
    const row = { ...interview(), claim: { holder: 'mcp-1' }, claimExpired: true };
    const { sup } = makeSupervisor(row);
    const s = cloudSession(sup, row);
    s.between = true;
    s.lastOutputAt = Date.now() - 60 * 60_000;
    s.child.kill = vi.fn();
    expect(sup.reapHungSessions([row])).toEqual([]);
  });
});
