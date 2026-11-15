// EVERY ANSWER IN A THREAD WAS SIGNED "THE AGENT".
//
// Both power testers hit it eight times on 2026-10-20. One switched a thread
// from Opus 5.5 to Sonnet 5.5 on a reply, got answer 2 back, and nothing on
// either answer said which model wrote which: "the only hint is Opus 5.5 in
// the reply box, which is the model for my next reply, not a record of the
// last one" (run 2, issues 8 and 29). Search already labelled its hits CODEX
// or CLAUDE CODE, so the app knew the whole time.
//
// It still does, and it needs no new record: the ledger holds every model and
// agent the row was ever set to, in order, so the fold that already carries
// the title forward carries these too, and an answer wears what the row said
// when the run that wrote it started.
//
// THE CASE THAT MUST NOT MATCH: a row that never named a model says nothing
// new, and the AGENT is named only where this Mac has two of them
// (tests/one-coding-agent-draws-nothing-new).

import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';
import { ranWords } from '../renderer/src/byline';

const CODEX_MODELS = [{ id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' }];

// A thread: opened on Opus, answered, moved to Codex on a reply, answered again.
const lines = [
  { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Dedupe pass@k', body: 'Find the double count.', model: 'opus', engine: 'claude' } },
  { id: 'w-1', ts: 2, source: 'agent', patch: { result: 'Found it in the retry loop.' } },
  { id: 'w-1', ts: 3, source: 'founder', patch: { engine: 'codex' } },
  { id: 'w-1', ts: 4, source: 'founder', patch: { model: 'gpt-5.6-sol' } },
  { id: 'w-1', ts: 5, source: 'founder', patch: { answer: 'Same task, with Codex.' } },
  { id: 'w-1', ts: 6, source: 'agent', patch: { result: 'Codex agrees, and here is the patch.' } },
];

const answers = () => threadEvents(lines).filter((e) => e.who === 'agent' && e.field === 'result');

describe('what the ledger says each answer ran on', () => {
  it('gives each answer the agent and model the row named when it started', () => {
    const [first, second] = answers();
    expect(first.ran).toEqual({ engine: 'claude', model: 'opus' });
    expect(second.ran).toEqual({ engine: 'codex', model: 'gpt-5.6-sol' });
  });

  it('leaves an answer on a row that never named a model unmarked', () => {
    const bare = [
      { id: 'w-2', ts: 1, source: 'founder', patch: { title: 'Look at it', body: 'Please look.' } },
      { id: 'w-2', ts: 2, source: 'agent', patch: { result: 'Looked.' } },
    ];
    const [answer] = threadEvents(bare).filter((e) => e.field === 'result');
    expect(answer.ran).toBeUndefined();
  });

  // The boundary: a model set and then cleared is not a model.
  it('forgets a model that was cleared', () => {
    const cleared = [
      ...lines.slice(0, 2),
      { id: 'w-1', ts: 3, source: 'founder', patch: { model: '' } },
      { id: 'w-1', ts: 4, source: 'agent', patch: { result: 'Second.' } },
    ];
    const [, second] = threadEvents(cleared).filter((e) => e.field === 'result');
    expect(second.ran).toEqual({ engine: 'claude' });
  });

  // Her own messages are hers; the byline over them says "You".
  it('marks nothing of hers', () => {
    expect(threadEvents(lines).filter((e) => e.who === 'you').every((e) => !e.ran)).toBe(true);
  });

  // AND NOT THE ASK EITHER, however it got there. A row an agent filed was
  // written by a run on another row; the model on this one is what it will run
  // on next, which is a different fact and not this one.
  it('marks nothing on the message that opened the row', () => {
    const filed = [
      { id: 'w-3', ts: 1, source: 'agent', patch: { title: 'Filed for you', body: 'Here is what I found.', model: 'opus', engine: 'claude' } },
      { id: 'w-3', ts: 2, source: 'agent', patch: { result: 'Done.' } },
    ];
    const [ask, done] = threadEvents(filed).filter((e) => e.message);
    expect(ask.ran).toBeUndefined();
    expect(done.ran).toEqual({ engine: 'claude', model: 'opus' });
  });
});

describe('the words over an answer', () => {
  const opts = { codexModels: CODEX_MODELS, codexDefault: 'gpt-5.6-sol' };

  it('names the agent and the model where this Mac has two agents', () => {
    expect(ranWords({ engineChoice: true, ran: { engine: 'claude', model: 'opus' }, ...opts })).toBe('Claude Code, Opus 5.5');
    expect(ranWords({ engineChoice: true, ran: { engine: 'codex', model: 'gpt-5.6-sol' }, ...opts })).toBe('Codex, GPT-5.6-Sol');
  });

  it('names the model alone on a Mac with one agent', () => {
    expect(ranWords({ engineChoice: false, ran: { engine: 'claude', model: 'sonnet' }, ...opts })).toBe('Sonnet 5.5');
  });

  it('says nothing at all when the row named no model and there is one agent', () => {
    expect(ranWords({ engineChoice: false, ran: { engine: 'claude' }, ...opts })).toBe(null);
    expect(ranWords({ engineChoice: false, ...opts })).toBe(null);
  });

  // And nothing on a Mac with two agents either, where the row names neither:
  // the default's name would be a guess wearing the look of a record.
  it('never fills in a default agent', () => {
    expect(ranWords({ engineChoice: true, ...opts })).toBe(null);
    expect(ranWords({ engineChoice: true, ran: {}, ...opts })).toBe(null);
  });

  // A model nobody picked is not a model to name: the default is a guess, and
  // the one thing this line must never do is guess what ran.
  it('never fills in a default model', () => {
    expect(ranWords({ engineChoice: true, ran: { engine: 'codex' }, ...opts })).toBe('Codex');
  });
});
