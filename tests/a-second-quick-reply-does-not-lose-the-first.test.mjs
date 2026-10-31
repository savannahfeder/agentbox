// Two replies sent one after the other on a thread (w-f43613624f, 2026-10-28):
// a long request, then "*". The agent that woke was handed only "*", asked what
// they meant, and never saw the request (w-5f577f2cae).
//
// Why, read off the code rather than the ledger, which stays on the Mac: the
// tick marks a reply "delivered" the moment it picks a start for it, before any
// agent reads it. A start that is still being set up (a folder being made, the
// 30 seconds a stopped run's leftovers get) is taken over by the next reply,
// so it starts carrying "*". The walk back over the queued replies then met
// the first one, saw the mark, and stopped there as if the agent had it.
// Measured by driving the real spawnPlan below: before the fix the brief held
// "*" and nothing else.
//
// What counts as seen now: an agent result after it, the row's answeredThrough
// (the newest reply a finished run settled), or the same conversation having
// actually heard it. Never a start that was only picked.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const product = { slug: 'acme', name: 'Acme', dir: os.tmpdir() };
const at = (ts, answer, source = 'founder') => ({ ts, source, patch: { answer } });
const REQUEST = 'I meant: there is no easy way to do this. Solve it for real people.';
const history = [
  { ts: 1, source: 'agent', patch: { result: 'Stop it and reply to move it.' } },
  at(10, REQUEST),
  at(20, '*'),
];
const asOf = (ts, extra = {}) => ({
  id: 'w-1', product: 'acme', title: 'Move work to cloud', status: 'open',
  answer: history.find((h) => h.ts === ts).patch.answer, wrote: { answer: { ts, source: 'founder' } }, ...extra,
});

function makeSupervisor(lines = history) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-quick-'));
  const store = { listItems: () => [], listProducts: () => [product], isDue: () => true, readHistory: () => lines };
  const sup = new Supervisor({ storeRoot: tmp }, store, tmp);
  sup._saveState = () => {};
  // The conversation that wrote the last answer, which never heard either reply.
  sup.rowSessionFor = () => ({ sessionId: 'S1', profile: null, engine: 'claude' });
  return sup;
}

const said = (plan) => plan.prompt.split('What they said:')[1] ?? '';

describe('two quick replies both reach the agent', () => {
  it('the reported thread: the request and the "*", oldest first, though a start was picked for the request', () => {
    const sup = makeSupervisor();
    sup._handledAnswers.add(sup._answerKey(asOf(10)));
    const text = said(sup.spawnPlan(asOf(20), product, { continuation: true }));
    expect(text).toContain(REQUEST);
    expect(text.indexOf(REQUEST)).toBeLessThan(text.lastIndexOf('*'));
    expect(text.match(/The person wrote:/g)).toHaveLength(2);
  });

  it('a fresh session gets both as well', () => {
    const sup = makeSupervisor();
    sup.rowSessionFor = () => null;
    sup._handledAnswers.add(sup._answerKey(asOf(10)));
    const prompt = sup.spawnPlan(asOf(20), product, { continuation: true }).prompt;
    expect(prompt).toContain(REQUEST);
  });

  it('one reply reads exactly as it always did', () => {
    const lines = [history[0], history[2]];
    const text = said(makeSupervisor(lines).spawnPlan(asOf(20), product, { continuation: true }));
    expect(text.startsWith('\n\n*')).toBe(true);
    expect(text).not.toContain('The person wrote:');
  });
});

describe('a reply the agent already answered is not repeated', () => {
  it('not when a finished run settled it, even with no result after it', () => {
    const lines = [at(10, REQUEST), at(20, '*')];
    const text = said(makeSupervisor(lines).spawnPlan(asOf(20, { answeredThrough: 10 }), product, { continuation: true }));
    expect(text).not.toContain(REQUEST);
    expect(text.startsWith('\n\n*')).toBe(true);
  });

  it('but a settle from before it does not hide it', () => {
    const lines = [at(10, REQUEST), at(20, '*')];
    const text = said(makeSupervisor(lines).spawnPlan(asOf(20, { answeredThrough: 9 }), product, { continuation: true }));
    expect(text).toContain(REQUEST);
  });

  it('not when the same conversation already heard it', () => {
    const sup = makeSupervisor();
    sup._noteHeard(asOf(10), 'S1');
    const text = said(sup.spawnPlan(asOf(20), product, { continuation: true }));
    expect(text).not.toContain(REQUEST);
  });
});

describe('stopping a start that had not begun', () => {
  it('gives its reply back, as a quit already does', () => {
    const sup = makeSupervisor();
    const item = asOf(10);
    sup._handledAnswers.add(sup._answerKey(item));
    sup._preparing.set(item.id, { item, opts: { continuation: true }, engine: 'claude' });
    expect(sup.stopSession(item.id)).toBe(true);
    expect(sup._answerDelivered(item)).toBe(false);
  });

  it('and leaves a row with no reply on it alone', () => {
    const sup = makeSupervisor();
    const item = { ...asOf(10), answer: null };
    sup._preparing.set(item.id, { item, opts: {}, engine: 'claude' });
    expect(sup.stopSession(item.id)).toBe(true);
  });
});
