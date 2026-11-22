// A CODEX SESSION YOU STARTED FOLLOWS CODEX IN THE INBOX.
//
// The founder's words on w-34f79ab66e: "let's say I have an agent running in
// Codex: I'd probably want to see that in my inbox. If I respond to the agent
// in Codex and then it's in progress, I want it to be removed from my inbox so
// it's kind of always in sync." Until this, a Codex session reached Agentbox
// only as a one-time copy, imported by hand. The transcripts below are written
// the way Codex 0.171 writes them (measured on a cloud machine, 2026-11-22):
// her words as a UserMessage item, the turn between task_started and
// task_complete, the answer as task_complete's last_agent_message.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCodexLive, codexConversation, CODEX_STALE_TURN_MS } from '../main/codex-live.mts';
import { reachesInbox, progressAfterReply, putAway, replyIsSwallowed, agentAnswer, agentContext } from '../shared/agents.mts';
import { theirWords } from '../shared/session-layout.mts';

const NOW = Date.parse('2026-11-22T18:00:00Z');
let home: string;
let codex: string;
let work: string;

const iso = (ms: number) => new Date(ms).toISOString();
const line = (at: number, type: string, payload: object) => JSON.stringify({ timestamp: iso(at), type, payload });
const meta = (id: string, at: number, over: object = {}) => line(at, 'session_meta', { id, timestamp: iso(at), cwd: work, originator: 'Codex Desktop', source: 'vscode', ...over });
const hers = (at: number, text: string) => [
  line(at, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n  <cwd>/x</cwd>\n</environment_context>' }] }),
  line(at, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }),
  line(at, 'event_msg', { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text }] } }),
];
const turn = (at: number, ask: string, answer: string | null) => [
  line(at, 'event_msg', { type: 'task_started' }),
  ...hers(at + 10, ask),
  ...(answer == null ? [] : [
    line(at + 20_000, 'event_msg', { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: answer }], phase: 'final_answer' } }),
    line(at + 20_000, 'response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] }),
    line(at + 21_000, 'event_msg', { type: 'task_complete', last_agent_message: answer }),
  ]),
];

function write(id: string, lines: string[], mtime: number) {
  const d = new Date(mtime);
  const dir = path.join(codex, 'sessions', String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${iso(mtime).slice(0, 19).replace(/:/g, '-')}-${id}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.utimesSync(file, mtime / 1000, mtime / 1000);
  return file;
}
const name = (id: string, thread: string) => fs.appendFileSync(path.join(codex, 'session_index.jsonl'), JSON.stringify({ id, thread_name: thread, updated_at: iso(NOW) }) + '\n');
const live = (now = NOW) => readCodexLive({ home, codexDirs: [codex], now });
const one = (id: string, now = NOW) => live(now).find((a) => a.sessionId === id)!;

const ASK = 'move the config to the new loader, keep the public settings the same';
const ANSWER = "I've moved the config.\n\nThree customer apps still set `TAX_MODE`. I can either:\n1. Read both names for one release\n2. Switch now\n\nWhich do you want?";

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-live-'));
  home = fs.realpathSync(home);
  codex = path.join(home, '.codex');
  work = path.join(home, 'dev', 'storefront');
  fs.mkdirSync(work, { recursive: true });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('the round trip she asked for', () => {
  it('finished in Codex: in Needs you, in its own words, laid out', () => {
    const t0 = NOW - 10 * 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER)], t0 + 21_000);
    name('s1', 'Move config to the new loader');
    const a = one('s1');
    expect(a.engine).toBe('codex');
    expect(a.status).toBe('idle');
    expect(a.about).toBe('Move config to the new loader');
    expect(a.app).toBe('Codex app');
    expect(reachesInbox(a, NOW, 'all')).toBe(true);
    expect(progressAfterReply(a, NOW, 'all')).toBe(false);
    expect(agentAnswer(a)).toBe('**Three customer apps still set TAX_MODE.**\n\nWhich do you want?');
    expect(agentContext(a, theirWords(a.lastAsked))).toBe(`Codex app · You asked: ${ASK}`);
  });

  it('answered in Codex and working: out of Needs you, into In progress', () => {
    const t0 = NOW - 10 * 60_000;
    const t1 = NOW - 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER), ...turn(t1, 'read both names for one release', null)], t1 + 10);
    name('s1', 'Move config to the new loader');
    const a = one('s1');
    expect(a.status).toBe('busy');
    expect(reachesInbox(a, NOW, 'all')).toBe(false);
    expect(reachesInbox(a, NOW, 'waiting')).toBe(false);
    expect(progressAfterReply(a, NOW, 'all')).toBe(true);
  });

  it('finished again: back in Needs you with the new answer', () => {
    const t0 = NOW - 10 * 60_000;
    const t1 = NOW - 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER), ...turn(t1, 'read both names for one release', 'Done. Both names are read until 2.0.')], t1 + 21_000);
    name('s1', 'Move config to the new loader');
    const a = one('s1');
    expect(a.status).toBe('idle');
    expect(a.lastSaid).toBe('Done. Both names are read until 2.0.');
    expect(reachesInbox(a, NOW, 'all')).toBe(true);
    expect(progressAfterReply(a, NOW, 'all')).toBe(false);
  });

  it('busy on its first task, nobody answered anything yet: not moved to In progress', () => {
    const t0 = NOW - 60_000;
    write('s2', [meta('s2', t0), ...turn(t0, 'build the receipts page', null)], t0 + 10);
    name('s2', 'Build the receipts page');
    const a = one('s2');
    expect(a.status).toBe('busy');
    expect(progressAfterReply(a, NOW, 'all')).toBe(false);
  });

  it('a turn nothing has written to for half an hour is not taken to be running', () => {
    const t0 = NOW - 2 * CODEX_STALE_TURN_MS;
    write('s3', [meta('s3', t0 - 60_000), ...turn(t0 - 60_000, ASK, ANSWER), ...turn(t0, 'go on', null)], t0);
    expect(one('s3').status).toBe('idle');
  });
});

describe("the tool's own question", () => {
  it('a pending request_user_input is a question with its choices, cleared once answered', () => {
    const t0 = NOW - 5 * 60_000;
    const ask = line(t0 + 5_000, 'response_item', { type: 'function_call', name: 'request_user_input', call_id: 'c1', arguments: JSON.stringify({ questions: [{ header: 'Library', question: 'Which date library?', options: [{ label: 'date-fns', description: 'small' }, { label: 'Luxon' }] }] }) });
    const base = [meta('q1', t0), line(t0, 'event_msg', { type: 'task_started' }), ...hers(t0 + 10, 'add dates'), ask];
    write('q1', base, t0 + 5_000);
    const a = one('q1');
    expect(a.status).toBe('waiting');
    expect(a.question).toEqual([{ question: 'Which date library?', options: ['date-fns', 'Luxon'] }]);
    expect(agentAnswer(a)).toMatch(/^\*\*Which date library\?\*\*/);
    write('q1', [...base, line(t0 + 9_000, 'response_item', { type: 'function_call_output', call_id: 'c1', output: 'date-fns' })], t0 + 9_000);
    const b = one('q1');
    expect(b.question).toEqual([]);
    expect(b.status).toBe('busy');
  });

  it("the Codex app's own question card is read with its options", () => {
    const t0 = NOW - 5 * 60_000;
    const q = line(t0 + 3_000, 'event_msg', { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: 'Which should I build first?' }], phase: 'final_answer', delivery: 'async', questions: [{ title: 'Which should I build first?', options: ['A prototype', 'The design'] }] } });
    write('q2', [meta('q2', t0), line(t0, 'event_msg', { type: 'task_started' }), ...hers(t0 + 10, 'build it'), q, line(t0 + 4_000, 'event_msg', { type: 'task_complete', last_agent_message: 'Which should I build first?' })], t0 + 4_000);
    const a = one('q2');
    expect(a.status).toBe('waiting');
    expect(a.question[0].options).toEqual(['A prototype', 'The design']);
  });
});

describe('what is not hers, or not now', () => {
  it("Agentbox's own runs, codex exec runs and subagents are left out", () => {
    const t0 = NOW - 60_000;
    write('ours', [meta('ours', t0, { originator: 'agentbox' }), ...turn(t0, 'x', 'y')], t0 + 21_000);
    write('exec', [meta('exec', t0, { originator: 'codex_exec', source: 'exec' }), ...turn(t0, 'x', 'y')], t0 + 21_000);
    write('sub', [meta('sub', t0, { source: { subagent: 'review' } }), ...turn(t0, 'x', 'y')], t0 + 21_000);
    write('mine', [meta('mine', t0, { originator: 'codex_cli_rs', source: 'cli' }), ...turn(t0, 'x', 'y')], t0 + 21_000);
    expect(live().map((a) => a.sessionId)).toEqual(['mine']);
    expect(one('mine').app).toBe('Codex in a terminal');
  });

  it('a session not written to for a day has left', () => {
    const t0 = NOW - 25 * 3_600_000;
    write('old', [meta('old', t0), ...turn(t0, 'x', 'y')], t0 + 21_000);
    expect(live()).toEqual([]);
  });

  it("a session in one of Agentbox's task folders is the thread's, not hers", () => {
    const t0 = NOW - 60_000;
    write('task', [meta('task', t0, { cwd: path.join(home, '.claude', 'worktrees', 'w-34f79ab66e') }), ...turn(t0, 'x', 'y')], t0 + 21_000);
    expect(live()).toEqual([]);
  });

  it('a reply from Agentbox is not offered: it is answered in Codex', () => {
    const t0 = NOW - 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER)], t0 + 21_000);
    expect(replyIsSwallowed(one('s1'))).toBe(true);
  });
});

describe('closing and reading it', () => {
  it('closing a Codex row lasts until Codex says something new', () => {
    const t0 = NOW - 10 * 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER)], t0 + 21_000);
    const a = one('s1');
    const closed = { ...a, doneThrough: a.saidAt };
    expect(putAway(closed)).toBe(true);
    expect(reachesInbox(closed, NOW, 'all')).toBe(false);
    expect(putAway({ ...closed, saidAt: a.saidAt + 60_000 })).toBe(false);
  });

  it('the full conversation is her words and its answers, in order', () => {
    const t0 = NOW - 10 * 60_000;
    const file = write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER), ...turn(t0 + 60_000, 'switch now', 'Switched.')], t0 + 81_000);
    const r = codexConversation(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.turns.map((t) => [t.who, 'text' in t ? t.text : ''])).toEqual([['you', ASK], ['it', ANSWER], ['you', 'switch now'], ['it', 'Switched.']]);
  });

  it('"You asked" is her words, not what Codex put in front of them', () => {
    const t0 = NOW - 60_000;
    const wrapped = '<in-app-browser-context source="ambient-ui-state">\nstate\n</in-app-browser-context>\n\n## My request:\nmake the heading smaller';
    write('s4', [meta('s4', t0), ...turn(t0, wrapped, 'Done.')], t0 + 21_000);
    expect(theirWords(one('s4').lastAsked)).toBe('make the heading smaller');
  });
});
