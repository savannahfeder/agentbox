// A CLAUDE CODE SESSION STOPPED ON ITS OWN QUESTION SHOWS THAT QUESTION AND ITS CHOICES.
//
// Claude Code asks with a tool (AskUserQuestion) and its choices are in the
// call, so the page takes them exactly rather than guessing from the text. In
// the founder's own sessions the tool was used 17 times, 31 questions, every one
// with choices (w-34f79ab66e, 2026-11-22). A question she has answered, or
// moved past by typing something else, must not stay on the page.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { foldHistory, type Facts } from '../main/agents.mts';
import { agentAnswer, agentLayout, answeredWhereItRuns, choicesArePressed, reachesInbox, progressAfterReply } from '../shared/agents.mts';

let dir: string;
let file: string;
const T = Date.parse('2026-11-22T18:00:00Z');
const at = (s: number) => new Date(T + s * 1000).toISOString();
const fresh = (): Facts => ({ lastActiveAt: 0, lastSaid: '', saidAt: 0, saidOpen: false, about: '', lastAsked: '', touched: [], asked: [], question: [], questionId: '' });
const user = (s: number, text: string) => ({ type: 'user', timestamp: at(s), message: { role: 'user', content: text } });
const said = (s: number, text: string) => ({ type: 'assistant', timestamp: at(s), message: { role: 'assistant', content: [{ type: 'text', text }] } });
const asks = (s: number, id: string) => ({ type: 'assistant', timestamp: at(s), message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions: [{ question: 'Which date library should I use?', header: 'Library', multiSelect: false, options: [{ label: 'date-fns', description: 'Small' }, { label: 'Luxon', description: 'Time zones' }] }] } }] } });
const answered = (s: number, id: string) => ({ type: 'user', timestamp: at(s), toolUseResult: { answers: {} }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'date-fns' }] } });

function read(lines: object[]) {
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return foldHistory({ file, size: fs.statSync(file).size, from: 0, first: true, acc: fresh() }).acc;
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-tool-')); file = path.join(dir, 's.jsonl'); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Claude Code's own question", () => {
  it('a pending question is read with its choices, and the page leads with it', () => {
    const f = read([user(0, 'add dates to the receipts'), said(5, 'I looked at both libraries.'), asks(6, 'q1')]);
    expect(f.question).toEqual([{ question: 'Which date library should I use?', options: ['date-fns', 'Luxon'], lead: 'I looked at both libraries.' }]);
    const l = agentLayout({ lastSaid: f.lastSaid, question: f.question });
    expect(l.bold).toBe('Which date library should I use?');
    expect(l.choices).toEqual(['date-fns', 'Luxon']);
  });
  it('what it says after her pick stands alone, not joined to the words before the question', () => {
    const f = read([user(0, 'x'), said(5, 'Should I also drop the cache table?'), asks(6, 'q1'), answered(9, 'q1'), said(12, 'Done. The index is added.')]);
    expect(f.lastSaid).toBe('Done. The index is added.');
    expect(agentLayout({ lastSaid: f.lastSaid, question: f.question }).kind).toBe('plain');
  });
  it('a question asked in a later turn is not led by the answer before it', () => {
    const f = read([user(0, 'x'), said(5, 'Done with the first part.'), user(10, 'now pick a date library'), asks(12, 'q1')]);
    expect(f.question[0].lead).toBeUndefined();
  });
  it('its choices are read, not pressed: a typed reply answering the tool is not measured yet', () => {
    const agent = { lastSaid: 'I looked at both.', question: [{ question: 'Which date library should I use?', options: ['date-fns', 'Luxon'], lead: 'I looked at both.' }], waitingFor: 'input needed', status: 'waiting' };
    expect(choicesArePressed(agent)).toBe(false);
    expect(agentAnswer(agent)).toBe('**Which date library should I use?**\n\nI looked at both.\n\n1. date-fns\n2. Luxon');
  });
  it('choices written in its message, at its prompt, are pressed and sent as a reply', () => {
    const agent = { lastSaid: 'Three apps use the old name. I can either:\n1. Keep both\n2. Switch\n\nWhich do you want?', status: 'idle' };
    expect(choicesArePressed(agent)).toBe(true);
    expect(agentLayout(agent).choices).toEqual(['Keep both', 'Switch']);
  });
  it('once answered it is gone, and her pick counts as her answer', () => {
    const f = read([user(0, 'x'), asks(6, 'q1'), answered(9, 'q1')]);
    expect(f.question).toEqual([]);
    expect(f.asked.at(-1)).toEqual({ at: T + 9_000, text: 'date-fns' });
    expect(answeredWhereItRuns({ status: 'busy', saidAt: T + 5_000, asked: f.asked })).toBe(true);
  });
  it('a new message from her clears it too', () => {
    expect(read([user(0, 'x'), asks(6, 'q1'), user(20, 'actually use Temporal')]).question).toEqual([]);
  });
  it('another tool result does not clear it', () => {
    expect(read([user(0, 'x'), asks(6, 'q1'), answered(9, 'other')]).question).toHaveLength(1);
  });
});

describe('answered in the terminal', () => {
  const stopped = { status: 'busy', saidAt: T, asked: [{ at: T - 60_000, text: 'first' }, { at: T + 30_000, text: 'go on' }], about: 'Receipts' };
  it('working on a message she typed after it stopped: In progress, not Needs you', () => {
    expect(answeredWhereItRuns(stopped)).toBe(true);
    expect(reachesInbox(stopped, T, 'all')).toBe(false);
    expect(progressAfterReply(stopped, T, 'all')).toBe(true);
  });
  it('stopped again: back in Needs you', () => {
    const idle = { ...stopped, status: 'idle' };
    expect(answeredWhereItRuns(idle)).toBe(false);
    expect(reachesInbox(idle, T, 'all')).toBe(true);
  });
  it('busy with nothing typed since it stopped is left where it was', () => {
    expect(answeredWhereItRuns({ ...stopped, asked: [{ at: T - 60_000, text: 'first' }] })).toBe(false);
  });
  it('working on the first thing she typed, never stopped yet: In progress', () => {
    expect(answeredWhereItRuns({ ...stopped, saidAt: 0 })).toBe(true);
  });
  it('working with nothing of hers read: not moved', () => {
    expect(answeredWhereItRuns({ ...stopped, saidAt: 0, asked: [] })).toBe(false);
  });
  it('off stays off', () => {
    expect(progressAfterReply(stopped, T, 'off')).toBe(false);
  });
});
