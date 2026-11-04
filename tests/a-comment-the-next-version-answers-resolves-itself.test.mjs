// Comments stayed open after the agent dealt with them. A note sent to the
// agent on accepted-applications v14 was answered by v15, and the note still
// sat open on v14 and rode along to v15 as "From v14, still open" until the
// person pressed Resolve on each one by hand. Measured: nothing but a press in
// the big view ever wrote a `resolve` mark.
//
// Now a comment sent to the agent is resolved when the agent's next version of
// that file lands, and a comment written to a teammate when that teammate's
// next version lands. The mark names the version (`in`), so the card can say
// "Resolved by your agent in v15". Reopen keeps it open.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { noteToItsAgent, resolveAnsweredNotes } from '../main/notes-wake.mjs';
import { answeredNotes, cleanMark, marksOf, resolvedInWords } from '../shared/artifact-marks.mjs';

const SOFIA = 'p-sofia';
const MAYA = 'p-maya';
const people = [{ id: SOFIA, name: 'Sofia Reyes' }, { id: MAYA, name: 'Maya Chen' }];

const said = (ts, text, extra = {}) => ({ ts, source: 'agent', patch: { result: text }, ...extra });
const mark = (ts, artifact, by = MAYA) => ({ ts, by, source: 'founder', patch: { artifact } });
const note = (ts, id, text, extra = {}) => mark(ts, { do: 'note', id, file: 'plan.md', place: { kind: 'whole' }, text, ...extra });

describe('which comments a newer version answered', () => {
  it('a comment sent to the agent is answered by the agent\'s next version', () => {
    const lines = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Shorter intro'), mark(3, { do: 'sent', on: ['n1'] }), said(4, 'Done: designs/w/plan-v2.md')];
    expect(answeredNotes(lines, { people })).toEqual([{ on: 'n1', in: 'plan-v2.md' }]);
  });

  it('not before the agent saves a new version, nor when it only replies in words', () => {
    const lines = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Shorter intro'), mark(3, { do: 'sent', on: ['n1'] })];
    expect(answeredNotes(lines, { people })).toEqual([]);
    expect(answeredNotes([...lines, said(4, 'I kept the intro, it sets up the numbers.')], { people })).toEqual([]);
  });

  it('not a comment the agent was never sent, such as a thank-you', () => {
    const lines = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Love it'), said(4, 'Done: designs/w/plan-v2.md')];
    expect(answeredNotes(lines, { people })).toEqual([]);
  });

  it('not by a version that was already there when the comment was sent', () => {
    const lines = [said(1, 'Here: designs/w/plan.md'), said(2, 'And designs/w/plan-v2.md'), note(3, 'n1', 'Shorter intro'), mark(4, { do: 'sent', on: ['n1'] })];
    expect(answeredNotes(lines, { people })).toEqual([]);
  });

  it('not by a new version of a different file', () => {
    const lines = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Shorter intro'), mark(3, { do: 'sent', on: ['n1'] }), said(4, 'Done: designs/w/budget.md')];
    expect(answeredNotes(lines, { people })).toEqual([]);
  });

  it('a comment written to a teammate is answered by that teammate\'s next version, not anyone\'s', () => {
    const base = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Sofia, can you fix the dates?')];
    const sofiaEdits = mark(5, { do: 'edit', file: 'plan.md', path: 'designs/w/plan-v2.md' }, SOFIA);
    const mayaEdits = mark(5, { do: 'edit', file: 'plan.md', path: 'designs/w/plan-v2.md' }, MAYA);
    expect(answeredNotes([...base, sofiaEdits], { people })).toEqual([{ on: 'n1', in: 'plan-v2.md' }]);
    expect(answeredNotes([...base, mayaEdits], { people })).toEqual([]);
    expect(answeredNotes([...base, said(5, 'Done: designs/w/plan-v2.md')], { people })).toEqual([]);
  });

  it('a comment reopened after the version stays open; one reopened before it does not', () => {
    const lines = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Shorter intro'), mark(3, { do: 'sent', on: ['n1'] }), said(4, 'Done: designs/w/plan-v2.md')];
    expect(answeredNotes([...lines, mark(5, { do: 'resolve', on: 'n1', in: 'plan-v2.md' }), mark(6, { do: 'reopen', on: 'n1' })], { people })).toEqual([]);
    const early = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Shorter intro'), mark(2.1, { do: 'resolve', on: 'n1' }), mark(2.2, { do: 'reopen', on: 'n1' }), mark(3, { do: 'sent', on: ['n1'] }), said(4, 'Done: designs/w/plan-v2.md')];
    expect(answeredNotes(early, { people })).toEqual([{ on: 'n1', in: 'plan-v2.md' }]);
  });

  it('a teammate\'s notes told to the agent name the file to make, which is no version until the agent makes it', () => {
    const told = { ts: 4, source: 'system', patch: { answer: 'Sofia left notes on plan.md.\n\nMake these changes and save the result as plan-v2.md beside the original.', fromNotes: ['n1'] } };
    const lines = [said(1, 'Here: designs/w/plan.md'), note(2, 'n1', 'Shorter intro', {}), mark(3, { do: 'sent', on: ['n1'] }), told];
    expect(answeredNotes(lines, { people })).toEqual([]);
    expect(answeredNotes([...lines, said(5, 'Done: designs/w/plan-v2.md')], { people })).toEqual([{ on: 'n1', in: 'plan-v2.md' }]);
  });
});

describe('the resolve mark names the version that answered it', () => {
  it('is kept through cleanMark and read back as resolvedIn', () => {
    expect(cleanMark({ do: 'resolve', on: 'n1', in: 'plan-v2.md' })).toEqual({ do: 'resolve', on: 'n1', in: 'plan-v2.md' });
    expect(cleanMark({ do: 'resolve', on: 'n1' })).toEqual({ do: 'resolve', on: 'n1' });
    const marks = marksOf([
      { do: 'note', id: 'n1', file: 'plan.md', place: { kind: 'whole' }, text: 'Shorter', ts: 1 },
      { do: 'resolve', on: 'n1', in: 'plan-v2.md', ts: 2 },
    ]);
    expect(marks.notes[0]).toMatchObject({ resolved: true, resolvedIn: 'plan-v2.md' });
  });

  it('a press after it is a press: Reopen, or Resolve by hand, carries no version', () => {
    const marks = marksOf([
      { do: 'note', id: 'n1', file: 'plan.md', place: { kind: 'whole' }, text: 'Shorter', ts: 1 },
      { do: 'resolve', on: 'n1', in: 'plan-v2.md', ts: 2 },
      { do: 'reopen', on: 'n1', ts: 3 },
      { do: 'resolve', on: 'n1', ts: 4 },
    ]);
    expect(marks.notes[0].resolved).toBe(true);
    expect(marks.notes[0].resolvedIn).toBeUndefined();
  });

  it('says who made that version', () => {
    const nameOf = (id) => (id === SOFIA ? 'Sofia' : 'Maya');
    expect(resolvedInWords({ n: 15, by: MAYA, agent: '' }, { me: MAYA, nameOf })).toBe('Resolved by your agent in v15');
    expect(resolvedInWords({ n: 3, by: SOFIA, agent: '' }, { me: MAYA, nameOf })).toBe("Resolved by Sofia's agent in v3");
    expect(resolvedInWords({ n: 3, by: SOFIA, edited: true }, { me: MAYA, nameOf })).toBe('Resolved by Sofia in v3');
    expect(resolvedInWords({ n: 3, by: MAYA, agent: 'Ada' }, { me: MAYA, nameOf })).toBe('Resolved by Ada in v3');
  });
});

let store, dir, thread;
const supervisor = { sessions: new Map(), wake: () => {} };
const row = () => store.readItem('website', thread.id);
const sweep = () => resolveAnsweredNotes({ store, people: [] });

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'answered-notes-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Plan', body: 'Write the plan.' });
  disk.updateWorkItem(dir, thread.id, { result: `Here: designs/${thread.id}/plan.md` }, { source: 'agent' });
  const n1 = { do: 'note', id: 'n1', file: 'plan.md', place: { kind: 'whole' }, text: 'Shorter intro' };
  store.fileMark('website', thread.id, n1);
  await noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark: n1 });
});

describe('on a thread in the store', () => {
  it('the agent\'s next version resolves the comment it was sent, once', () => {
    expect(row().artifacts.notes[0].sent).toBe(true);
    expect(sweep()).toBe(0);
    disk.updateWorkItem(dir, thread.id, { result: `Done: designs/${thread.id}/plan-v2.md` }, { source: 'agent' });
    expect(sweep()).toBe(1);
    expect(row().artifacts.notes[0]).toMatchObject({ resolved: true, resolvedIn: 'plan-v2.md' });
    expect(sweep()).toBe(0);
  });

  it('a comment the person reopens is left open', () => {
    disk.updateWorkItem(dir, thread.id, { result: `Done: designs/${thread.id}/plan-v2.md` }, { source: 'agent' });
    sweep();
    store.fileMark('website', thread.id, { do: 'reopen', on: 'n1' });
    expect(sweep()).toBe(0);
    expect(row().artifacts.notes[0].resolved).toBeUndefined();
  });
});

it('the supervisor sweeps on every tick, with or without a team', () => {
  const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
  expect(src).toMatch(/resolveAnsweredNotes\(\{ store: this\.store/);
});
