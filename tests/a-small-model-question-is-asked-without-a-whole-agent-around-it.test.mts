// A SMALL-MODEL QUESTION IS ASKED WITHOUT A WHOLE AGENT AROUND IT.
//
// What broke: naming a thread, ranking a task, sorting a message and routing an
// Auto thread each start `claude -p <question> --model haiku`. That is a whole
// Claude Code session: its full system prompt, every built-in tool, the skills
// list, the person's own MCP servers and hooks, a saved session in their
// history, and a 32K thinking budget, all to get back a 3-to-6-word name.
//
// Measured 2026-11-13 against ADEMark's "hi" test (ademark.dev), on Claude Code
// 2.1.321 pointed at a stand-in model server that recorded every request: one
// "hi" thread in Agentbox sent the main request (71.5 KB) and one naming
// request of 85.8 KB, more than the main request itself. With the flags below
// the naming request is 2.4 KB, thinking is off, and Claude Code still sends
// its own identity line and billing header, so a subscription login still
// takes it. Every flag here is in 2.1.71, the oldest Claude Code the worker
// line runs on: the same lean call answered there in 1.1 KB.

import { describe, it, expect } from 'vitest';
import { harnessFor } from '../main/harnesses.mts';
import { harnessDefinition } from '../shared/harness-definitions.mts';

const claude = harnessFor('claude');

const after = (args: string[], flag: string) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};

const settingsOf = (args: string[]) => JSON.parse(after(args, '--settings') ?? '{}');

const lean = (args: string[]) => {
  expect(after(args, '--tools')).toBe('');
  expect(after(args, '--system-prompt')).toMatch(/\S/);
  expect(args).toContain('--disable-slash-commands');
  expect(args).toContain('--strict-mcp-config');
  expect(JSON.parse(after(args, '--mcp-config') ?? 'null')).toEqual({ mcpServers: {} });
  expect(args).toContain('--no-session-persistence');
  const settings = settingsOf(args);
  expect(settings.alwaysThinkingEnabled).toBe(false);
  expect(settings.disableAllHooks).toBe(true);
};

describe('a question to the small model', () => {
  it('asked in words carries no tools, skills, MCP servers, hooks, thinking or saved session', () => {
    lean(claude.smallModelArgs('name this', 'haiku'));
  });

  it('asked with pictures is just as lean', () => {
    lean(claude.smallModelArgs('who takes it', 'haiku', ['/p/a.png']));
  });

  it('still asks the question it was given, on the model it was given', () => {
    const args = claude.smallModelArgs('name this', 'haiku');
    expect(args.slice(0, 4)).toEqual(['-p', 'name this', '--model', 'haiku']);
    const streamed = claude.smallModelArgs('who takes it', 'haiku', ['/p/a.png']);
    expect(streamed).toEqual(expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json']));
    expect(streamed.join(' ')).not.toContain('who takes it');
  });

  it('still never bills an API key, so the lean settings did not replace the blank', () => {
    for (const args of [claude.smallModelArgs('name this', 'haiku'), claude.smallModelArgs('x', 'haiku', ['/p/a.png'])]) {
      const settings = settingsOf(args);
      expect(settings.env.ANTHROPIC_API_KEY).toBe('');
      expect(settings.apiKeyHelper).toBe('');
    }
  });

  it('replaces the system prompt rather than adding to it', () => {
    const args = claude.smallModelArgs('name this', 'haiku');
    expect(args).not.toContain('--append-system-prompt');
  });
});

describe('a worker, which is a whole agent on purpose', () => {
  it('keeps Claude Code\'s own system prompt and tools', () => {
    const run = harnessDefinition('claude').run;
    expect(run?.system).toBe('--append-system-prompt');
    expect(JSON.stringify(run)).not.toMatch(/--tools|--system-prompt"|--disable-slash-commands/);
  });
});
