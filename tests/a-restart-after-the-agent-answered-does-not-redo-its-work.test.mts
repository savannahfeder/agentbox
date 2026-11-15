// A RESTART AFTER THE AGENT ANSWERED DOES NOT REDO ITS WORK (F-216, QA session 43).
//
// A Codex run had said "The test passes. Git has no configured author name or
// email, so … I can't commit it until you provide both." and ended its turn,
// and then the app restarted. The resume told it it had been interrupted and
// to check the step it was part-way through, so it searched for AGENTS.md
// again, re-ran git status, git diff and npm test, and said the same answer a
// second time. The transcript already showed the turn had ended; now the
// resume says so and asks for that answer back, with nothing redone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { turnThatEnded } from '../shared/finished-turn.mts';
import { Supervisor } from '../main/supervisor.mts';

const ANSWER = "The test passes. Git has no configured author name or email, so the change is ready but I can't commit it until you provide both.";
const at = (s: number) => new Date(Date.UTC(2026, 10, 13, 18, 40, s)).toISOString();
const ev = (s: number, payload: Record<string, unknown>) => JSON.stringify({ timestamp: at(s), type: 'event_msg', payload });
const lines = (...l: string[]) => `${l.join('\n')}\n`;

describe('reading whether a Codex turn had ended', () => {
  it('finds the answer a completed turn ended on', () => {
    const text = lines(ev(1, { type: 'task_started' }), ev(2, { type: 'agent_message', message: 'Running the tests.' }), ev(3, { type: 'agent_message', message: ANSWER }), ev(4, { type: 'task_complete', last_agent_message: ANSWER }));
    expect(turnThatEnded(text, 'codex')).toEqual({ text: ANSWER, at: Date.parse(at(4)) });
  });

  it('falls back to the last agent message when the completion names none', () => {
    const text = lines(ev(1, { type: 'task_started' }), ev(3, { type: 'agent_message', message: ANSWER }), ev(4, { type: 'turn_complete' }));
    expect(turnThatEnded(text, 'codex')?.text).toBe(ANSWER);
  });

  it('is null for a turn still going, or one started after the last completed', () => {
    expect(turnThatEnded(lines(ev(1, { type: 'task_started' }), ev(2, { type: 'agent_message', message: 'Running the tests.' })), 'codex')).toBeNull();
    expect(turnThatEnded(lines(ev(1, { type: 'task_started' }), ev(4, { type: 'task_complete', last_agent_message: ANSWER }), ev(5, { type: 'user_message', message: 'use Sam' })), 'codex')).toBeNull();
    expect(turnThatEnded(lines(ev(4, { type: 'task_complete', last_agent_message: ANSWER }), ev(5, { type: 'task_started' })), 'codex')).toBeNull();
  });

  it('is null for a turn that was aborted, or ended with nothing said', () => {
    expect(turnThatEnded(lines(ev(1, { type: 'task_started' }), ev(2, { type: 'turn_aborted' })), 'codex')).toBeNull();
    expect(turnThatEnded(lines(ev(1, { type: 'task_started' }), ev(2, { type: 'task_complete', last_agent_message: null })), 'codex')).toBeNull();
    expect(turnThatEnded('', 'codex')).toBeNull();
  });

  it('skips a torn first line, as a tail read leaves it', () => {
    const text = `ype":"event_msg"}\n${lines(ev(1, { type: 'task_started' }), ev(4, { type: 'task_complete', last_agent_message: ANSWER }))}`;
    expect(turnThatEnded(text, 'codex')?.text).toBe(ANSWER);
  });
});

describe('reading whether a Claude Code turn had ended', () => {
  const said = (s: number, content: unknown[], stop: string | null) => JSON.stringify({ type: 'assistant', timestamp: at(s), message: { role: 'assistant', content, stop_reason: stop } });
  const user = (s: number, content: unknown) => JSON.stringify({ type: 'user', timestamp: at(s), message: { role: 'user', content } });

  it('finds an answer that ended its turn', () => {
    expect(turnThatEnded(lines(user(1, 'fix it'), said(3, [{ type: 'text', text: ANSWER }], 'end_turn')), 'claude')).toEqual({ text: ANSWER, at: Date.parse(at(3)) });
  });

  it('is null mid-turn: a tool call, a tool result, or text with no end', () => {
    expect(turnThatEnded(lines(user(1, 'fix it'), said(2, [{ type: 'tool_use', id: 't', name: 'Bash', input: {} }], 'tool_use')), 'claude')).toBeNull();
    expect(turnThatEnded(lines(said(2, [{ type: 'tool_use', id: 't', name: 'Bash', input: {} }], 'tool_use'), user(3, [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }])), 'claude')).toBeNull();
    expect(turnThatEnded(lines(user(1, 'fix it'), said(2, [{ type: 'text', text: 'Looking.' }], null)), 'claude')).toBeNull();
  });

  it('is null once a new message came in after the answer', () => {
    expect(turnThatEnded(lines(said(3, [{ type: 'text', text: ANSWER }], 'end_turn'), user(4, 'use Sam')), 'claude')).toBeNull();
  });
});

describe('the words a resumed session is given', () => {
  const sup = () => {
    const s = Object.create(Supervisor.prototype);
    s.userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ended-turn-'));
    return s;
  };
  const item = { id: 'w-1', product: 'p', title: 'Capitalize empty input handling' } as never;

  it('says the turn had ended and asks for the same answer, with nothing redone', () => {
    const words = sup().resumeBrief(item, { ended: { text: ANSWER, at: 1 } });
    expect(words).toContain(ANSWER);
    expect(words).toMatch(/already ended/);
    expect(words).toMatch(/Do not re-read files, re-run checks or redo any step/);
    expect(words).not.toMatch(/check\s+whether the step you were part-way through/);
  });

  it('keeps the interrupted wording when the turn had not ended', () => {
    expect(sup().resumeBrief(item, {})).toMatch(/check\s+whether the step you were part-way through/);
  });

  it('is what a resume reads off the transcript, only when no reply came since', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'main/supervisor.mts'), 'utf8');
    expect(src).toMatch(/const ended = resumeId && !after && !\(continuation && item\.answer\) \? this\._turnThatEnded\(/);
    expect(src).toMatch(/this\.resumeBrief\(item, \{ continuation, product, after, ended \}\)/);
  });
});
