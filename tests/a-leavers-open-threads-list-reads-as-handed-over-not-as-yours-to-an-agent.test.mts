// A LEAVER'S OPEN-THREADS LIST READS AS HANDED OVER, NOT AS YOUR WORDS TO AN AGENT.
//
// "Jordan Lee's open threads" opened on "You opened this" over
// words the app wrote ("Jordan Lee left the team with these open..."), and its
// reply box asked "What should the agent do next?" on a row no agent will ever
// run (mayRunHere is false: it is held by a person). Measured: the row is made
// on your Mac as your own line, so the thread fold had nothing to tell it from
// a task you typed, and the box asked the agent question of every row that was
// not a conversation.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { threadEvents } from '../renderer/src/thread-history';
import { replyBoxAsk } from '../renderer/src/threads/composer-rules.ts';
import { handedFromLabel } from '../shared/team-departures.mjs';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const ME = 'p-maya';
const JORDAN = 'p-jordan';
const born = (labels) => [
  { id: 'w-1', ts: 1, source: 'system', by: ME, patch: { title: "Jordan Lee's open threads", labels: ['founder', ...labels] } },
  { id: 'w-1', ts: 2, source: 'founder', by: ME, patch: { title: "Jordan Lee's open threads", body: 'Jordan Lee left the team with these open.' } },
];

describe('the opening of the list', () => {
  it('is handed over, in the name of the person who left', () => {
    const [first] = threadEvents(born([handedFromLabel(JORDAN)]));
    expect(first).toMatchObject({ said: 'Handed over to you', by: JORDAN, words: 'Jordan Lee left the team with these open.' });
  });
  it('a task you typed still opens as yours', () => {
    const [first] = threadEvents(born([]));
    expect(first).toMatchObject({ said: 'You opened this', by: ME });
  });
  it('is made with the label that says so', () => {
    expect(read('main/team/departures.mjs')).toMatch(/labels: \[handedFromLabel\(d\.personId\)\]/);
  });
});

describe('the reply box', () => {
  it('asks the agent question only where an agent runs', () => {
    expect(replyBoxAsk({ agentRuns: true })).toBe('What should the agent do next?');
    expect(replyBoxAsk({ agentRuns: false })).toBe('Add a note');
  });
  it('speaks to the people in a conversation, whatever runs', () => {
    expect(replyBoxAsk({ agentRuns: false, talkTo: ['Dev'], talkWord: 'Reply to' })).toBe('Reply to Dev');
    expect(replyBoxAsk({ agentRuns: true, talkTo: ['Dev', 'Maya'], talkWord: 'Reply to', answering: 'Maya' })).toBe('Reply to Maya');
  });
  it('is asked with what may run on the row', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/replyBoxAsk\(\{ talkTo, talkWord, answering, agentRuns/);
  });
});
