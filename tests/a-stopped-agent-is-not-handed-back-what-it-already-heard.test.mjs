// "Sometimes agents dont listen to me when I send interruption messages, even
// if I stop them and have them resume" (w-f37a34def6, 2026-10-02).
//
// MEASURED on the thread in the report, from its own transcript. The agent was
// inside a 300-second photographing command. Two short asks ("show me the
// current version of what you've got") waited behind it; they were stopped
// with it. The resume then handed the conversation, under "What they said:",
// FIVE messages: a 2,000-character round of feedback it had already acted on
// for forty minutes, a "show me the status" it had already answered, and only
// then the three it had never seen, the newest of them last. It read the wall,
// said "Picking it back up" and went back to photographing.
//
// Why: a stop releases the "delivered" mark on what the run was carrying, on
// purpose, so the row gets another run. The resume then re-read that released
// mark as "never heard" and replayed it. What the CONVERSATION heard is a
// different fact from what a RUN finished, and only the conversation that
// heard the words may skip them: a fresh session needs them all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const product = { slug: 'acme', name: 'Acme', dir: os.tmpdir() };
const at = (ts, answer, source = 'founder') => ({ ts, source, patch: { answer } });
const LONG = 'Round one feedback: these sections are bland. '.repeat(20);
// The thread in the report, in ledger order.
const history = [
  { ts: 1, source: 'agent', patch: { result: 'Round 1 is ready.' } },
  at(10, LONG),
  at(20, 'show me the status (then keep going)'),
  at(30, "like the current version of what you've got"),
  at(40, "show me the current version of what you've got"),
  at(50, "show me the current version as i'm signing off (then keep going)"),
];
const row = { id: 'w-1', product: 'acme', title: 'Landing page', status: 'open', answer: history[5].patch.answer, wrote: { answer: { ts: 50, source: 'founder' } } };
const asOf = (ts) => ({ ...row, answer: history.find((h) => h.ts === ts).patch.answer, wrote: { answer: { ts, source: 'founder' } } });

function makeSupervisor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-heard-'));
  const store = { listItems: () => [], listProducts: () => [product], isDue: () => true, readHistory: () => history };
  const sup = new Supervisor({ storeRoot: tmp }, store, tmp);
  sup._saveState = () => {};
  return sup;
}

// The run that took the long feedback (spawned with it) and then had the
// status ask steered in, both into conversation S1. Then she pressed stop.
function heardThenStopped(sup) {
  sup._noteHeard(asOf(10), 'S1');
  sup._noteHeard(asOf(20), 'S1');
  sup.redeliverAnswer(asOf(10), LONG);
  sup.redeliverAnswer(asOf(20), asOf(20).answer);
}

const said = (plan) => plan.prompt.split('What they said:')[1] ?? plan.prompt;

describe('a resumed conversation gets only the words it never heard', () => {
  it('the reported thread: the three unheard asks, not the feedback it already acted on', () => {
    const sup = makeSupervisor();
    heardThenStopped(sup);
    sup.rowSessionFor = () => ({ sessionId: 'S1', profile: null, engine: 'claude' });
    const text = said(sup.spawnPlan(row, product, { continuation: true }));
    expect(text).not.toContain('Round one feedback');
    expect(text).not.toContain('show me the status');
    expect(text).toContain("like the current version of what you've got");
    expect(text).toContain("show me the current version of what you've got");
    expect(text).toContain("as i'm signing off");
  });

  it('a stop releases the delivery but never what the conversation heard', () => {
    const sup = makeSupervisor();
    heardThenStopped(sup);
    expect(sup._answerDelivered(asOf(10))).toBe(false);
    expect(sup._heardIn(asOf(10), 'S1')).toBe(true);
  });

  it('a DIFFERENT conversation was told none of it, so it gets every word', () => {
    const sup = makeSupervisor();
    heardThenStopped(sup);
    sup.rowSessionFor = () => ({ sessionId: 'S2', profile: null, engine: 'claude' });
    const text = said(sup.spawnPlan(row, product, { continuation: true }));
    expect(text).toContain('Round one feedback');
    expect(text).toContain('show me the status');
    expect(text).toContain("as i'm signing off");
  });

  it('the newest word is always sent, even when that same conversation heard it', () => {
    const sup = makeSupervisor();
    sup._noteHeard(row, 'S1');
    sup.rowSessionFor = () => ({ sessionId: 'S1', profile: null, engine: 'claude' });
    expect(said(sup.spawnPlan(row, product, { continuation: true }))).toContain("as i'm signing off");
  });

  it('the marks outlive a restart', () => {
    const sup = makeSupervisor();
    sup._noteHeard(asOf(20), 'S1');
    delete sup._saveState;
    sup._saveState();
    const again = new Supervisor({ storeRoot: sup._stateFile.replace(/\/[^/]+$/, '') }, sup.store, os.tmpdir());
    expect(again._heardIn(asOf(20), 'S1')).toBe(true);
  });
});

describe('what the resumed conversation is told to do with them', () => {
  it('answer the newest message first, before going back to the work', () => {
    const sup = makeSupervisor();
    const brief = sup.replyBrief({ ...row, answer: 'a\n\nb' }, {}).replace(/\s+/g, ' ');
    expect(brief).toMatch(/newest message is the last one/i);
    expect(brief).toMatch(/before you go back to anything you were doing/i);
    expect(brief).not.toMatch(/Read their words and carry on\./);
  });
});
