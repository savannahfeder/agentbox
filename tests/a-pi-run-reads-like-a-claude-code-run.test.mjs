// A PI RUN READS LIKE A CLAUDE CODE RUN.
//
// pi prints its own events (`pi -p --mode json`), and the app's readers know
// Claude Code's. main/pi.mjs rewrites each pi line as the Claude Code line that
// means the same, so the session id, the result on the row, the activity line
// and the streaming text all come from code that already runs. The pi lines
// below are the shapes pi 1.0.4 printed on 2026-10-07 for a run that called one
// tool (`cat a.txt`) and then answered, trimmed to the fields that matter.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { piToClaude, piArgs, piTranscriptFile, parsePiModels, findPiBin, piNodeDir } from '../main/pi.mjs';
import { readersFor } from '../main/supervisor.mjs';
import { claudeActivity } from '../main/agent-activity.mjs';

const piRun = [
  { type: 'session', version: 3, id: 'P-1', cwd: '/work' },
  { type: 'agent_start' },
  { type: 'message_end', message: { role: 'user', content: [{ type: 'text', text: 'cat it' }] } },
  { type: 'message_start', message: { role: 'assistant', content: [] } },
  { type: 'message_end', message: { role: 'assistant', model: 'deepseek-flash', stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'cat a.txt' } }] } },
  { type: 'tool_execution_start', toolCallId: 'call_1', toolName: 'bash' },
  { type: 'message_end', message: { role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', isError: false, content: [{ type: 'text', text: 'hello\n' }] } },
  { type: 'message_start', message: { role: 'assistant', content: [] } },
  { type: 'message_update', assistantMessageEvent: { type: 'text_start', contentIndex: 0 } },
  { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'It printed ' } },
  { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'hello.' } },
  { type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'It printed hello.' }] } },
  { type: 'agent_end', messages: [] },
  { type: 'agent_settled' },
].map((e) => JSON.stringify(e));

const translate = (lines) => {
  const state = {};
  return lines.flatMap((l) => piToClaude(l, state));
};

describe('pi lines become Claude Code lines', () => {
  it('names the session the way Claude Code does, first', () => {
    expect(JSON.parse(translate(piRun)[0])).toMatchObject({ type: 'system', subtype: 'init', session_id: 'P-1' });
  });

  it('gives the row the last thing pi said as its result', () => {
    const session = {};
    const { capture } = readersFor('claude');
    for (const line of translate(piRun)) capture(session, line);
    expect(session.sessionId).toBe('P-1');
    expect(session.result).toBe('It printed hello.');
    expect(session.resultIsError).toBe(false);
  });

  it('shows a pi tool call on the activity line with Claude Code\'s words, then clears it', () => {
    const session = {};
    const lines = translate(piRun);
    const toolLine = lines.find((l) => JSON.parse(l).message?.content?.[0]?.type === 'tool_use');
    expect(JSON.parse(toolLine).message.content[0]).toMatchObject({ type: 'tool_use', id: 'call_1', name: 'Bash', input: { command: 'cat a.txt' } });
    expect(claudeActivity(session, toolLine)).toBe(true);
    expect([...session.activeTools.values()].map((t) => t.label)).toHaveLength(1);
    for (const line of lines) claudeActivity(session, line);
    expect(session.activeTools.size).toBe(0);
  });

  it('streams pi\'s text while it is typed', () => {
    const session = {};
    const { stream } = readersFor('claude');
    const lines = translate(piRun);
    for (const line of lines.slice(0, lines.length - 2)) stream(session, line);
    expect(session.saying).toBe('It printed hello.');
  });

  it('calls a run that pi stopped on an error a failed run, in pi\'s own words', () => {
    const failed = [piRun[0], JSON.stringify({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'No API key for provider', content: [] } }), JSON.stringify({ type: 'agent_end' })];
    const session = {};
    for (const line of translate(failed)) readersFor('claude').capture(session, line);
    expect(session.resultIsError).toBe(true);
    expect(session.result).toBe('No API key for provider');
  });

  // THE CASE THAT MUST NOT MATCH: pi's bookkeeping lines and anything that is
  // not JSON say nothing at all, rather than something wrong.
  it('says nothing for lines Claude Code has no word for', () => {
    for (const l of ['not json', '{}', JSON.stringify({ type: 'agent_settled' }), JSON.stringify({ type: 'tool_execution_update' })]) {
      expect(piToClaude(l, {})).toEqual([]);
    }
  });
});

describe('the command line a pi run is given', () => {
  it('is pi\'s own, with the prompt last and after --', () => {
    expect(piArgs({ prompt: '-starts with a dash', system: 'rules', resumeId: 'P-1', model: 'deepseek/deepseek-flash', effort: 'high' }))
      .toEqual(['-p', '--mode', 'json', '--append-system-prompt', 'rules', '--session', 'P-1', '--model', 'deepseek/deepseek-flash', '--thinking', 'high', '--', '-starts with a dash']);
  });

  it('leaves out what was not chosen, so pi runs its own default', () => {
    expect(piArgs({ prompt: 'go' })).toEqual(['-p', '--mode', 'json', '--', 'go']);
    expect(piArgs({ prompt: 'go', effort: 'nonsense' })).toEqual(['-p', '--mode', 'json', '--', 'go']);
  });
});

describe('finding pi, and the node it runs on', () => {
  it('finds pi where npm and Homebrew put it', () => {
    expect(findPiBin({ home: '/h', exists: (p) => p === '/opt/homebrew/bin/pi', shellLookup: () => ({ path: null }) }).path).toBe('/opt/homebrew/bin/pi');
    expect(findPiBin({ home: '/h', exists: () => false, shellLookup: () => ({ path: null }) }).found).toBe(false);
  });

  it('finds node beside an npm-installed pi, because the Dock gives the app no PATH', () => {
    const real = '/n/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
    expect(piNodeDir('/opt/homebrew/bin/pi', { realpath: () => real, exists: (p) => p === '/n/bin/node', shellLookup: () => ({ path: null }) })).toBe('/n/bin');
  });

  it('asks the shell for node when pi is not an npm install', () => {
    expect(piNodeDir('/x/pi', { realpath: (p) => p, exists: () => false, shellLookup: () => ({ path: '/s/bin/node' }) })).toBe('/s/bin');
  });
});

describe('finding a pi conversation to resume, and pi\'s models', () => {
  it('finds the file named with the conversation id', () => {
    const home = mkdtempSync(join(tmpdir(), 'pi-home-'));
    mkdirSync(join(home, 'sessions', '--work--'), { recursive: true });
    writeFileSync(join(home, 'sessions', '--work--', '2026-10-07T13-10-25-024Z_P-1.jsonl'), '{}\n');
    expect(piTranscriptFile('P-1', { home })).toBe(join(home, 'sessions', '--work--', '2026-10-07T13-10-25-024Z_P-1.jsonl'));
    expect(piTranscriptFile('P-2', { home })).toBeNull();
    rmSync(home, { recursive: true, force: true });
  });

  it('reads `pi --list-models` as provider/model rows', () => {
    const printed = 'provider  model           context  max-out  thinking  images\ndeepseek  deepseek-flash  1M  384K  yes  yes\nlocal  org/Some-Model  1.0M  393.2K  yes  no\n';
    expect(parsePiModels(printed).map((m) => m.id)).toEqual(['deepseek/deepseek-flash', 'local/org/Some-Model']);
    expect(parsePiModels('')).toEqual([]);
  });
});
