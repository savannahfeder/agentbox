// 2026-10-08: the engine boundary (9ca39d6) made names, paths and login flags
// into data, but the line that actually STARTS a worker stayed written into
// main/supervisor.mts: `['-p', prompt, '--output-format', 'stream-json',
// '--verbose', '--include-partial-messages', ...]`, `--effort`,
// `--append-system-prompt`, `--resume` and `--fork-session`. A user proved what
// that costs (github.com/savannahfeder/agentbox/issues/21): Grok Build emits
// Claude Code's own stream-json, so it is the same engine with a different
// binary and one changed flag value, and adding it would still have meant
// editing the supervisor.
//
// So: the command line is data now. These tests measure the three things that
// claim rests on — the line we ship today is unchanged, a second stream-json
// engine is a definition and nothing else, and an engine with no command line
// at all (Codex, which is driven over RPC) is handed none.
import { describe, it, expect } from 'vitest';
import { workerArgsFrom, definitionMethods } from '../main/harnesses/common.mts';
import { harnessDefinition } from '../shared/harness-definitions.mts';
import { harnessFor } from '../main/harnesses.mts';
import { streamInputArgs } from '../main/claude-input.mts';

const claude = harnessDefinition('claude');

describe('the worker command line is data', () => {
  it('builds exactly the Claude Code line this app shipped before the move', () => {
    expect(workerArgsFrom(claude.run, {
      prompt: 'do the thing',
      grants: ['--model', 'opus', '--allowedTools', 'Read'],
      effort: 'high',
      system: 'her standing instructions',
      resumeId: 'abc-123',
      fork: true,
    })).toEqual([
      '-p', 'do the thing',
      '--output-format', 'stream-json',
      '--verbose', '--include-partial-messages',
      '--model', 'opus', '--allowedTools', 'Read',
      '--effort', 'high',
      '--append-system-prompt', 'her standing instructions',
      '--resume', 'abc-123',
      '--fork-session',
    ]);
  });

  it('leaves out every flag the run had nothing to say about', () => {
    expect(workerArgsFrom(claude.run, { prompt: 'hello', grants: [] }))
      .toEqual(['-p', 'hello', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']);
    // A fork is only a fork of something: no resume, no --fork-session.
    expect(workerArgsFrom(claude.run, { prompt: 'hello', grants: [], fork: true }))
      .not.toContain('--fork-session');
  });

  it('gives a second stream-json engine its own line with no code of its own', () => {
    // Issue 21's Grok Build, as data: same protocol, different binary, one
    // different flag value, and it cannot fork or take an effort word.
    const grok = {
      print: '-p',
      outputFormat: { flag: '--output-format', value: 'streaming-messages-json' },
      stream: ['--verbose'],
      system: '--append-system-prompt',
      resume: '--resume',
    };
    const args = workerArgsFrom(grok, {
      prompt: 'do the thing', grants: ['--model', 'grok-code'],
      effort: 'high', system: 'rules', resumeId: 'abc-123', fork: true,
    });
    expect(args).toEqual([
      '-p', 'do the thing',
      '--output-format', 'streaming-messages-json',
      '--verbose',
      '--model', 'grok-code',
      '--append-system-prompt', 'rules',
      '--resume', 'abc-123',
    ]);
    expect(args).not.toContain('--effort');
    expect(args).not.toContain('--fork-session');
    expect(args).not.toContain('--include-partial-messages');
  });

  it('hands no command line to an engine that has none', () => {
    expect(harnessDefinition('codex').run).toBeUndefined();
    expect(harnessFor('codex').workerArgs({ prompt: 'do the thing', grants: ['--model', 'gpt'] })).toEqual([]);
    expect(definitionMethods({ ...claude, run: undefined }).workerArgs({ prompt: 'x', grants: [] })).toEqual([]);
  });

  it('reads the streaming-input flags off the definition too', () => {
    // Replies arrive on stdin, so the prompt comes OUT of the line and the
    // input format goes in. Both flags were hardcoded; both are data now.
    expect(streamInputArgs(claude.run, ['-p', 'do the thing', '--output-format', 'stream-json'])).toEqual([
      '-p', '--output-format', 'stream-json', '--input-format', 'stream-json', '--replay-user-messages',
    ]);
    expect(() => streamInputArgs(claude.run, ['--output-format', 'stream-json'])).toThrow(/prompt/i);
    // An engine that cannot take input on stdin gets the line back untouched.
    expect(streamInputArgs({ print: '-p' }, ['-p', 'do the thing'])).toEqual(['-p', 'do the thing']);
  });

  it('starts the worker on the binary its own definition names', () => {
    expect(claude.binKey).toBe('claudeBin');
    expect(harnessFor('claude').binary({ claudeBin: '/usr/local/bin/claude', codexBin: '/usr/local/bin/codex' }))
      .toBe('/usr/local/bin/claude');
  });
});
