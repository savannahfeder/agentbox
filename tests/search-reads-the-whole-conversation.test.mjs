// Search reads the whole conversation, not three fifths of it.
//
// This is the next one, and it is the biggest of what was left.
//
// A task holds five pieces of writing: the title, the body, the user's reply,
// the agent's result and the agent's latest checkpoint. Search read three of
// them. The two it skipped are the two that carry the newest words on the row:
// the checkpoint is what the reading pane leads with while a run is still
// going, and the reply is the only place the user's OWN words are ever written
// down.
//
// On a real store, most checkpoints and a large share of replies contained
// words that appear nowhere else on the row, so they were unfindable by any
// search at all. Taking a four word run out of the middle of a reply or a
// checkpoint and searching for it came back with nothing more often than not.
//
// Four properties, and a regression in any of them is silent:
//
// THE USER'S OWN WORDS ARE FINDABLE. They were typed into this app; typing them
// again has to bring the row back. A CHECKPOINT IS FINDABLE. It is the sentence
// on screen while a run is in flight, so it is exactly the half-remembered line
// somebody goes looking for. THE ROW STILL SAYS WHY IT MATCHED. The summary
// under a hit is the sentence the words were found in, wherever they were
// found. AND IT SAYS IT WITHOUT A CAPTION. A line out of a reply carried a "You said: "
// prefix for a day. Which field a sentence came from is our bookkeeping, and it
// was spending ten characters of a 112-character row line to say so.

import { describe, expect, it } from 'vitest';
import { hitSummary, matches, searchScore, searchItems } from '../renderer/src/search.ts';

// Four rows shaped like real ones: the words live in a different field on
// each, and on the last two they live NOWHERE that search used to read.
const inBody = {
  id: 'body', status: 'open', updatedAt: 100,
  title: 'The landing page needs another pass',
  body: 'The idle time section is still the weakest part of the page.',
};
const inResult = {
  id: 'result', status: 'done', updatedAt: 200,
  title: 'Eleven of your edits are live on the landing page',
  result: 'The idle time band now says what it does in one sentence.',
};
const inCheckpoint = {
  id: 'checkpoint', status: 'claimed', updatedAt: 300,
  title: 'Panel read of the landing page',
  body: 'Running the page past the panel now.',
  note: 'Here is the problem. The idle time band is the one every reader stopped on.',
};
const inHerReply = {
  id: 'reply', status: 'open', updatedAt: 400,
  title: 'Which of the five headlines should the page open with',
  body: 'Five headlines, one per section, all of them measured.',
  answer: 'None of those work for me. I want the idle time promise up top instead.',
};
const store = [inBody, inResult, inCheckpoint, inHerReply];

describe('the two fields search used to skip', () => {
  it('finds a row by what the agent last checkpointed', () => {
    expect(matches(inCheckpoint, ['idle', 'time'])).toBe(true);
    expect(searchItems(store, 'idle time').map((h) => h.item.id)).toContain('checkpoint');
  });

  it('finds a row by what SHE typed back', () => {
    expect(matches(inHerReply, ['idle', 'time'])).toBe(true);
    expect(searchItems(store, 'idle time').map((h) => h.item.id)).toContain('reply');
  });

  it('finds her reply by a phrase that exists nowhere else on the row', () => {
    // The failing case in the measurement above: a run of words out of the
    // middle of the user's own answer, typed back in.
    expect(searchScore(inHerReply, 'idle time promise')).toBeGreaterThanOrEqual(3);
    expect(searchScore(inHerReply, 'none of those work')).toBeGreaterThanOrEqual(3);
  });

  it('ranks a phrase in a checkpoint with the phrases in the prose, not below the noise', () => {
    // The four rows all say "idle time", so all four rank as phrase matches
    // and the checkpoint and the reply are not sunk under the loose ones.
    expect(searchScore(inCheckpoint, 'idle time')).toBeGreaterThanOrEqual(3);
    expect(searchScore(inHerReply, 'idle time')).toBeGreaterThanOrEqual(3);
  });

  it('shows the checkpoint sentence the words were found in', () => {
    expect(hitSummary(inCheckpoint, ['idle', 'time'], 'idle time'))
      .toBe('The idle time band is the one every reader stopped on.');
  });

  it('shows a line out of her own reply plain, with no caption in front of it', () => {
    const summary = hitSummary(inHerReply, ['idle', 'time'], 'idle time');
    expect(summary).toContain('idle time promise');
    expect(summary).not.toContain('You said');
  });

  it('still prefers the task itself when the words are in both', () => {
    // A row whose body AND checkpoint both say it summarises off the body,
    // because the checkpoint is progress toward the answer and the body is the
    // ask. Nothing about the old order changes.
    const both = {
      id: 'both', status: 'open', updatedAt: 500,
      title: 'A task',
      body: 'The idle time question is the one to settle first.',
      note: 'Still working on the idle time question.',
    };
    expect(hitSummary(both, ['idle', 'time'], 'idle time'))
      .toBe('The idle time question is the one to settle first.');
  });

  it('reads a checkpoint before the reply, because the checkpoint is the newer word', () => {
    const both = {
      id: 'newer', status: 'open', updatedAt: 600,
      title: 'A task', body: 'Nothing relevant here.',
      answer: 'Make the idle time bit shorter.',
      note: 'Cut the idle time bit to two lines, as you asked.',
    };
    expect(hitSummary(both, ['idle', 'time'], 'idle time'))
      .toBe('Cut the idle time bit to two lines, as you asked.');
  });

  it('takes the markdown out of a checkpoint the way it does everywhere else', () => {
    const marked = {
      id: 'md', status: 'open', updatedAt: 700, title: 'A task',
      note: '## Where we got to\n\nThe **idle time** band is done.',
    };
    expect(searchScore(marked, 'where we got to')).toBeGreaterThanOrEqual(3);
    expect(hitSummary(marked, ['idle', 'time'], 'idle time')).toContain('idle time band is done');
  });

  it('summarises off the field that says the phrase, not the one that has a word of it', () => {
    // Found while shooting a real store. Typing "create subtasks" brought the
    // row back, correctly, because the user's own reply says it. The row was
    // answering a phrase with a sentence that does not say the phrase.
    //
    // The rule this file already states is "the phrase is asked for first,
    // across the whole text, before any single word is". It was being asked
    // field by field instead, so one word early beat the phrase late.
    const row = {
      id: 'phraselate', status: 'open', updatedAt: 900,
      title: 'Pick the first big piece',
      body: 'Four subtasks are in your inbox and none of them is blocked.',
      answer: 'Go ahead and create subtasks for the next layer.',
    };
    const summary = hitSummary(row, ['create', 'subtasks'], 'create subtasks');
    expect(summary).toContain('create subtasks for the next layer');
    expect(summary).not.toContain('Four subtasks are in your inbox');
  });

  it('does the same between the body and the result', () => {
    // The same fault, on the two fields search always read: nothing about it
    // was new to the checkpoint and the reply.
    const row = {
      id: 'oldpair', status: 'open', updatedAt: 910,
      title: 'A task',
      body: 'There is time to do this properly.',
      result: 'The idle time page is built and waiting on you.',
    };
    expect(hitSummary(row, ['idle', 'time'], 'idle time'))
      .toBe('The idle time page is built and waiting on you.');
  });

  it('does not find a phrase straddling the join between two fields', () => {
    // Five fields are searched as one string, and a phrase that only exists
    // because one field ends where another begins is a row that does not say
    // it. This is what the join between them is for.
    const seam = {
      id: 'seam', status: 'open', updatedAt: 800,
      title: 'A task about how',
      body: 'To work is the point.',
      result: 'The band is idle',
      note: 'time to stop.',
    };
    // The words are all there, scattered, so it is the bottom rung and not a
    // phrase match. Quoted, the phrase is asked for and the row is not a match
    // at all.
    expect(searchScore(seam, 'how to work')).toBe(1);
    expect(searchScore(seam, '"how to work"')).toBe(0);
    expect(searchScore(seam, '"idle time"')).toBe(0);
  });

  it('keeps a row out when neither field says the words', () => {
    expect(matches({ id: 'no', title: 'A task', note: 'Nothing here.', answer: 'Fine by me.' }, ['idle', 'time']))
      .toBe(false);
  });
});
