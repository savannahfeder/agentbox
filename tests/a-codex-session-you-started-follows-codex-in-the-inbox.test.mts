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
import { readCodexLive, codexConversation, runsIn, approvalAsked, CODEX_STALE_TURN_MS } from '../main/codex-live.mts';
import { reachesInbox, progressAfterReply, putAway, replyIsSwallowed, agentAnswer, agentContext, agentRow } from '../shared/agents.mts';
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
let running: string[] = [];
const live = (now = NOW) => readCodexLive({ home, codexDirs: [codex], now, isRunning: (c) => running.includes(c) });
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
    // Answered in Codex, so the choices stay in the words rather than on a strip nothing can send.
    expect(agentAnswer(a)).toBe('**Three customer apps still set TAX_MODE.**\n\nWhich do you want?\n\n1. Read both names for one release\n2. Switch now');
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

  it('working on the first thing she asked: In progress, not Needs you', () => {
    const t0 = NOW - 60_000;
    write('s2', [meta('s2', t0), ...turn(t0, 'build the receipts page', null)], t0 + 10);
    name('s2', 'Build the receipts page');
    const a = one('s2');
    expect(a.status).toBe('busy');
    expect(progressAfterReply(a, NOW, 'all')).toBe(true);
    expect(reachesInbox(a, NOW, 'all')).toBe(false);
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

  it('a question Codex asks while it works on is waiting on her, not In progress', () => {
    // Codex 0.171 in a terminal (a power tester's session, 2026-11-22): request_user_input_async
    // is accepted at once, the question is an AgentMessage, and Codex sleeps on in the same turn.
    const t0 = NOW - 60_000;
    const call = line(t0 + 2_000, 'response_item', { type: 'function_call', name: 'request_user_input_async', call_id: 'a1', arguments: JSON.stringify({ questions: [{ title: 'May I inspect the three files?', options: ['Yes, inspect them', 'Use the prior inspection'] }] }) });
    const accepted = line(t0 + 2_100, 'response_item', { type: 'function_call_output', call_id: 'a1', output: '{"accepted":true}' });
    const card = line(t0 + 2_000, 'event_msg', { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: 'May I inspect the three files?' }], phase: 'final_answer', delivery: 'async', questions: [{ title: 'May I inspect the three files?', options: ['Yes, inspect them', 'Use the prior inspection'] }] } });
    const sleeping = line(t0 + 3_000, 'response_item', { type: 'function_call', name: 'sleep', call_id: 's1', arguments: '{"duration_ms":30000}' });
    write('aq', [meta('aq', t0 - 60_000, { originator: 'codex-tui' }), ...turn(t0 - 60_000, 'map the booking files', 'Mapped.'), line(t0, 'event_msg', { type: 'task_started' }), ...hers(t0 + 10, 'review the booking code, ask before running commands'), call, card, accepted, sleeping], t0 + 3_000);
    const a = one('aq');
    expect(a.status).toBe('waiting');
    expect(a.question[0]).toMatchObject({ question: 'May I inspect the three files?', options: ['Yes, inspect them', 'Use the prior inspection'] });
    expect(progressAfterReply(a, NOW, 'all')).toBe(false);
    expect(reachesInbox(a, NOW, 'waiting')).toBe(true);
    expect(a.asked.map((x) => x.text)).not.toContain('{"accepted":true}');
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

  it('a session in a temp folder is left out, unless the folder is one of her projects, a subfolder included', () => {
    const t0 = NOW - 60_000;
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
    try {
      write('tmp', [meta('tmp', t0, { cwd: path.join(os.tmpdir(), 'scratch-x') }), ...turn(t0, 'x', 'y')], t0 + 21_000);
      write('proj', [meta('proj', t0, { cwd: path.join(tmpProject, 'web') }), ...turn(t0, 'x', 'y')], t0 + 21_000);
      const found = readCodexLive({ home, codexDirs: [codex], now: NOW, products: [{ slug: 'shop', name: 'Shop', repoPath: tmpProject }] });
      expect(found.map((a) => [a.sessionId, a.product])).toEqual([['proj', 'shop']]);
    } finally { fs.rmSync(tmpProject, { recursive: true, force: true }); }
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
  it('closing a Codex row lasts until she writes in it again, whatever Codex says meanwhile', () => {
    const t0 = NOW - 10 * 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER)], t0 + 21_000);
    const a = one('s1');
    const closed = { ...a, doneThrough: a.saidAt };
    expect(putAway(closed)).toBe(true);
    expect(reachesInbox(closed, NOW, 'all')).toBe(false);
    expect(putAway({ ...closed, saidAt: a.saidAt + 60_000 })).toBe(true);
    expect(putAway({ ...closed, asked: [...a.asked, { at: a.saidAt + 60_000, text: 'one more thing' }] })).toBe(false);
  });

  it('a closed row she answers in Codex shows in In progress while it works', () => {
    const t0 = NOW - 10 * 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER)], t0 + 21_000);
    const through = one('s1').saidAt;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER), ...turn(NOW - 30_000, 'switch now', null)], NOW - 29_000);
    const working = { ...one('s1'), doneThrough: through };
    expect(putAway(working)).toBe(false);
    expect(progressAfterReply(working, NOW, 'all')).toBe(true);
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

describe('a command Codex asks permission to run', () => {
  // Measured on Codex 0.171 in a terminal (2026-11-22): the pending call carries
  // sandbox_permissions "require_escalated" and Codex's own justification, and
  // nothing else in the transcript says it is waiting.
  const asking = (at: number, id: string, escalated = true) => line(at, 'response_item', {
    type: 'custom_tool_call', status: 'completed', call_id: id, name: 'exec',
    input: `text(await tools.exec_command({cmd:"rg --files -g cart.js"${escalated ? ',sandbox_permissions:"require_escalated",justification:"May I locate cart.js using a read-only command outside the sandbox?"' : ''}}))\n`,
  });
  const output = (at: number, id: string) => line(at, 'response_item', { type: 'custom_tool_call_output', call_id: id, output: [{ type: 'input_text', text: 'ok' }] });
  const start = (t0: number) => [meta('p1', t0, { originator: 'codex-tui' }), line(t0, 'event_msg', { type: 'task_started' }), ...hers(t0 + 10, 'look at cart.js')];

  it('waiting on it: Needs you, its reason in bold, the command under it', () => {
    const t0 = NOW - 60_000;
    write('p1', [...start(t0), asking(t0 + 2_000, 'c1')], t0 + 2_000);
    const a = one('p1');
    expect(a.status).toBe('waiting');
    expect(a.waitingFor).toBe('permission prompt');
    expect(reachesInbox(a, NOW, 'waiting')).toBe(true);
    expect(agentAnswer(a)).toBe('**May I locate cart.js using a read-only command outside the sandbox?**\n\n```\nrg --files -g cart.js\n```');
  });
  it('approved while the command still runs: working, not waiting, because the command is running', () => {
    const t0 = NOW - 60_000;
    write('p1', [...start(t0), asking(t0 + 2_000, 'c1')], t0 + 2_000);
    running = ['rg --files -g cart.js'];
    try {
      const a = one('p1');
      expect(a.status).toBe('busy');
      expect(a.waitingFor).toBeNull();
      expect(progressAfterReply(a, NOW, 'all')).toBe(true);
    } finally { running = []; }
  });
  it('a permission nobody gave for half an hour, its terminal closed, stops saying it waits', () => {
    const t0 = NOW - 2 * CODEX_STALE_TURN_MS;
    write('p1', [...start(t0), asking(t0 + 2_000, 'c1')], t0 + 2_000);
    expect(one('p1').status).toBe('idle');
  });
  it('approved and running: working again, nothing asked', () => {
    const t0 = NOW - 60_000;
    write('p1', [...start(t0), asking(t0 + 2_000, 'c1'), output(t0 + 9_000, 'c1')], t0 + 9_000);
    const a = one('p1');
    expect(a.status).toBe('busy');
    expect(a.approval).toBeNull();
  });
  it('a command inside the sandbox asks nothing, however long it runs', () => {
    const t0 = NOW - 60_000;
    write('p1', [...start(t0), asking(t0 + 2_000, 'c1', false)], t0 + 2_000);
    expect(one('p1').status).toBe('busy');
  });
  it('the older shell call with escalated permissions in JSON is read too', () => {
    const t0 = NOW - 60_000;
    const call = line(t0 + 2_000, 'response_item', { type: 'function_call', name: 'shell', call_id: 'c2', arguments: JSON.stringify({ command: ['npm', 'install'], with_escalated_permissions: true, justification: 'Install the packages from the network?' }) });
    write('p1', [...start(t0), call], t0 + 2_000);
    expect(one('p1').approval).toEqual({ command: 'npm install', reason: 'Install the packages from the network?' });
  });
});

describe("the row's second line", () => {
  it('is the ask alone, never a list the page would offer as choices', () => {
    const t0 = NOW - 10 * 60_000;
    write('s1', [meta('s1', t0), ...turn(t0, ASK, ANSWER)], t0 + 21_000);
    expect(agentRow(one('s1'), NOW).body).toBe('**Three customer apps still set TAX_MODE.**');
  });
  it('is the first paragraph of a report that asks nothing', () => {
    const t0 = NOW - 10 * 60_000;
    write('s5', [meta('s5', t0), ...turn(t0, 'tidy the imports', '## Done\n\nTidied 14 files.\n\n1. Removed unused imports\n2. Sorted the rest')], t0 + 21_000);
    expect(agentRow(one('s5'), NOW).body).toBe('Tidied 14 files.');
  });
});

describe('the full conversation of a session waiting on permission', () => {
  it('ends on the request, in its own words, as the page shows it', () => {
    const t0 = NOW - 60_000;
    const call = line(t0 + 2_000, 'response_item', { type: 'custom_tool_call', call_id: 'c9', name: 'exec', input: 'text(await tools.exec_command({cmd:"ls -a",sandbox_permissions:"require_escalated",justification:"May I list the files?"}))\n' });
    const file = write('p9', [meta('p9', t0, { originator: 'codex-tui' }), line(t0, 'event_msg', { type: 'task_started' }), ...hers(t0 + 10, 'look around'), call], t0 + 2_000);
    const r = codexConversation(file, { now: NOW, isRunning: () => false });
    expect(r.ok && r.turns.at(-1)).toMatchObject({ who: 'it', text: '**May I list the files?**\n\n```\nls -a\n```' });
    const granted = codexConversation(file, { now: NOW, isRunning: () => true });
    expect(granted.ok && granted.turns.at(-1)).toMatchObject({ who: 'you', text: 'look around' });
  });
});

describe('reading every refresh stays cheap', () => {
  it("a transcript that is not hers is not opened again however often it changes", () => {
    const t0 = NOW - 60_000;
    const file = write('ours2', [meta('ours2', t0, { originator: 'agentbox' }), ...turn(t0, 'x', 'y')], t0 + 21_000);
    expect(live()).toEqual([]);
    // Were it read again, this first line would now make it hers.
    fs.writeFileSync(file, [meta('ours2', t0), ...turn(t0, 'x', 'y'), line(t0 + 30_000, 'event_msg', { type: 'task_started' })].join('\n') + '\n');
    fs.utimesSync(file, (t0 + 30_000) / 1000, (t0 + 30_000) / 1000);
    expect(live()).toEqual([]);
  });
});

describe('telling a granted command from one still waiting', () => {
  const ps = ['/sbin/init', '/usr/bin/node /x/tools/false-alarm.mjs --ls', '/bin/bash -lc git grep "Book your first"', 'sleep 45'];
  it('a command its shell is running is granted', () => {
    expect(runsIn(ps, 'git grep "Book your first"')).toBe(true);
    expect(runsIn(ps, 'sleep 45')).toBe(true);
  });
  it('a short command found inside some other line is not', () => {
    expect(runsIn(ps, 'ls')).toBe(false);
    expect(runsIn(ps, 'git grep')).toBe(false);
  });
  it('no command, no match', () => {
    expect(runsIn(ps, '')).toBe(false);
  });
});

describe('the command in a permission request, however Codex quotes it', () => {
  // A power tester's long git log came in single quotes, because it holds
  // double ones, and the page showed the reason with no command (2026-11-23).
  it('single quotes, with double quotes inside', () => {
    const input = `text(await tools.exec_command({cmd:'git log -1 --format="commit=%H subject=%s" HEAD',sandbox_permissions:"require_escalated",justification:"May I run the exact read-only git log command you provided?"}))\n`;
    expect(approvalAsked('c1', input)).toEqual({ callId: 'c1', command: 'git log -1 --format="commit=%H subject=%s" HEAD', reason: 'May I run the exact read-only git log command you provided?' });
  });
  it('double quotes with an escaped quote, and a backtick string', () => {
    expect(approvalAsked('c2', 'tools.exec_command({cmd:"echo \\"hi\\"",sandbox_permissions:"require_escalated",justification:`May I?`})')).toEqual({ callId: 'c2', command: 'echo "hi"', reason: 'May I?' });
  });
  it('a call that asks for nothing is not a request', () => {
    expect(approvalAsked('c3', 'tools.exec_command({cmd:"ls"})')).toBeNull();
  });
});
