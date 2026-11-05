// A PICKED OPTION IS THE GO-AHEAD (F-182).
//
// QA, 2026-10-30: a task asked for three designs for formatBytes "then wait
// for my pick". The tester clicked "2 Binary units", the agent was handed
// "Option 2: Binary units" and nothing else, and it ended under a minute later
// on "Binary units selected; the design decision is recorded. No code has
// changed." The thread went back to Needs you with only the reply box, and a
// typed "go ahead and implement it" was needed to get the code. Measured by
// driving the real spawnPlan below: before the fix the brief carried the bare
// option and no word that choosing means doing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { framedPick } from '../main/live-replies.mts';

const product = { slug: 'acme', name: 'Acme', dir: os.tmpdir() };
const PICK = 'Option 2: Binary units';
const row = (answer, extra = {}) => ({
  id: 'w-1', product: 'acme', title: 'Design options for formatBytes', status: 'open',
  answer, wrote: { answer: { ts: 20, source: 'founder' } }, ...extra,
});

function makeSupervisor(answer, { chat = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-pick-'));
  const lines = [{ ts: 1, source: 'agent', patch: { result: 'Which design?' } }, { ts: 20, source: 'founder', patch: { answer } }];
  const store = { listItems: () => [], listProducts: () => [product], isDue: () => true, readHistory: () => lines };
  const sup = new Supervisor({ storeRoot: tmp }, store, tmp);
  sup._saveState = () => {};
  sup.rowSessionFor = () => (chat ? { sessionId: 'S1', profile: null, engine: 'claude' } : null);
  return sup;
}

const GO = /Choosing is the go-ahead: do what that option says now/;

describe('a pick reaching the agent', () => {
  it('says that choosing is the go-ahead, in the conversation that offered it', () => {
    const prompt = makeSupervisor(PICK).spawnPlan(row(PICK), product, { continuation: true }).prompt;
    expect(prompt).toContain(PICK);
    expect(prompt).toMatch(GO);
  });

  it('and in a fresh session', () => {
    const prompt = makeSupervisor(PICK, { chat: false }).spawnPlan(row(PICK), product, { continuation: true }).prompt;
    expect(prompt).toMatch(GO);
  });

  it('keeps what still needs their yes needing it', () => {
    expect(framedPick(PICK)).toMatch(/standing instructions say needs their yes still does/);
  });
});

/* ------------------------- the cases that must not match ------------------- */

describe('anything that is not a pick', () => {
  it('a typed reply reads exactly as it did', () => {
    const typed = 'Make it SI units instead, and round to one place.';
    expect(framedPick(typed)).toBe(typed);
    const prompt = makeSupervisor(typed).spawnPlan(row(typed), product, { continuation: true }).prompt;
    expect(prompt).not.toMatch(GO);
  });

  it('a reply that starts like a pick and says more is hers, not a pick', () => {
    const more = 'Option 2: Binary units\nbut keep the decimal tests too';
    expect(framedPick(more)).toBe(more);
  });

  it('a teammate\'s words are framed as theirs, not as a pick', () => {
    const prompt = makeSupervisor(PICK).spawnPlan(
      row(PICK, { wrote: { answer: { ts: 20, source: 'system', from: 'Maya' } } }), product, { continuation: true },
    ).prompt;
    expect(prompt).not.toMatch(GO);
  });
});
