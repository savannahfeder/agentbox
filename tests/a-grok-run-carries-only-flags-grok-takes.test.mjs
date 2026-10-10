// A GROK BUILD RUN CARRIES ONLY THE FLAGS GROK TAKES.
//
// Grok Build's headless mode reads Claude Code's command line almost word for
// word, which is what lets it ride the Claude Code path. "Almost" is the whole
// risk: measured 2026-10-07 on grok 1.0.46, one unknown flag stops the run with
// "error: unexpected argument", before the model is ever called, and
// `--output-format stream-json` is refused as an invalid value. Every flag
// below was checked against the real binary with `grok <flag> --version`.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grokArgs, findGrokBin, grokTranscriptFile, candidatePaths, GROK_EFFORTS, parseGrokModels, grokModels } from '../main/grok.mjs';

const claudeLine = [
  '-p', 'the brief', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
  '--allowedTools', 'mcp__agentbox-store', '--permission-mode', 'auto',
  '--append-system-prompt', 'standing rules', '--resume', 'S-1', '--fork-session',
  '--mcp-config', '/tmp/mcp.json', '--permission-prompt-tool', 'mcp__zero-approvals__approval_prompt',
  '--settings', '/tmp/rules.json',
];

describe('the command line a Grok run is given', () => {
  it('keeps every flag Grok takes, in order', () => {
    expect(grokArgs(claudeLine)).toEqual([
      '-p', 'the brief', '--output-format', 'streaming-messages-json', '--include-partial-messages',
      '--allowedTools', 'mcp__agentbox-store', '--permission-mode', 'auto',
      '--append-system-prompt', 'standing rules', '--resume', 'S-1', '--fork-session',
    ]);
  });

  it.each([
    [['--verbose']], [['--strict-mcp-config']], [['--replay-user-messages']], [['--ide']],
    [['--mcp-config', 'x']], [['--mcp-config=x']], [['--permission-prompt-tool', 'x']],
    [['--settings', 'x']], [['--setting-sources', 'user']], [['--add-dir', '/a']], [['--add-dir=/a']],
    [['--input-format', 'stream-json']],
  ])('drops %j, which Grok refuses', (flags) => {
    expect(grokArgs(['-p', 'go', ...flags])).toEqual(['-p', 'go']);
  });

  // THE CASE THAT MUST NOT MATCH: a prompt that happens to be one of the
  // dropped words is a prompt, not a flag.
  it('never drops the prompt itself, even when it reads like a flag', () => {
    expect(grokArgs(['-p', '--verbose'])).toEqual(['-p', '--verbose']);
  });

  it('drops a Claude Code model from the settings and puts the row\'s Grok model back', () => {
    expect(grokArgs(['-p', 'go', '--model', 'opus'])).toEqual(['-p', 'go']);
    expect(grokArgs(['-p', 'go', '--model=opus'], { model: 'grok-4.7' })).toEqual(['-p', 'go', '--model', 'grok-4.7']);
  });

  it('passes a level Grok knows and drops one it does not', () => {
    for (const level of GROK_EFFORTS) expect(grokArgs(['-p', 'go'], { effort: level })).toEqual(['-p', 'go', '--effort', level]);
    expect(grokArgs(['-p', 'go', '--effort', 'max'], { effort: 'max' })).toEqual(['-p', 'go']);
  });
});

describe('finding Grok Build on this Mac', () => {
  it('finds it where the installer puts it', () => {
    const where = join('/h', '.grok/bin/grok');
    expect(findGrokBin({ home: '/h', exists: (p) => p === where, shellLookup: () => ({ path: null }) }))
      .toEqual({ found: true, path: where, from: 'known-path' });
  });

  it('prefers a configured path, when it exists', () => {
    const exists = (p) => p === '/mine/grok' || p === join('/h', '.grok/bin/grok');
    expect(findGrokBin({ configured: '/mine/grok', home: '/h', exists }).path).toBe('/mine/grok');
  });

  it('asks the shell last', () => {
    expect(findGrokBin({ home: '/h', exists: (p) => p === '/odd/grok', shellLookup: () => ({ path: '/odd/grok' }) }).from).toBe('shell');
  });

  it('says not found rather than inventing a path', () => {
    expect(findGrokBin({ home: '/h', exists: () => false, shellLookup: () => ({ path: null }) }))
      .toEqual({ found: false, path: null, from: null });
  });

  it('looks in the installer\'s folder first', () => {
    expect(candidatePaths('/h')[0]).toBe(join('/h', '.grok/bin/grok'));
  });
});

describe('finding a Grok conversation to resume', () => {
  const home = mkdtempSync(join(tmpdir(), 'grok-home-'));
  const cwd = '/private/tmp/some project';
  mkdirSync(join(home, 'sessions', encodeURIComponent(cwd), 'S-1'), { recursive: true });
  writeFileSync(join(home, 'sessions', encodeURIComponent(cwd), 'S-1', 'chat_history.jsonl'), '{}\n');

  it('finds it under its working folder', () => {
    expect(grokTranscriptFile('S-1', { home, cwd })).toBe(join(home, 'sessions', encodeURIComponent(cwd), 'S-1', 'chat_history.jsonl'));
  });

  it('finds it when the folder was recorded under another spelling', () => {
    expect(grokTranscriptFile('S-1', { home, cwd: '/tmp/some project' })).not.toBeNull();
  });

  it('answers null for a conversation that is gone, so a reply starts fresh', () => {
    expect(grokTranscriptFile('S-2', { home, cwd })).toBeNull();
    expect(grokTranscriptFile(null, { home, cwd })).toBeNull();
    expect(grokTranscriptFile('S-1', { home: join(home, 'nope'), cwd })).toBeNull();
    rmSync(home, { recursive: true, force: true });
  });
});

describe('the models Grok offers, and the one a task gets when nobody picks', () => {
  // The shape `grok models` printed on 1.0.46, with a config whose own default
  // is a model served from the person's own machine.
  const printed = [
    'You are logged in with grok.com.', '', 'Default model: local-model', '', 'Available models:',
    '  - grok-4.7', '  - grok-4.7-build-fast', '  - deepseek-flash', '  * local-model (default)', '',
  ].join('\n');

  it('lists every model, in the order Grok prints them', () => {
    expect(parseGrokModels(printed).models.map((m) => m.id)).toEqual(['grok-4.7', 'grok-4.7-build-fast', 'deepseek-flash', 'local-model']);
  });

  it('defaults to the first of xAI\'s own models when Grok\'s default is one of the person\'s', () => {
    expect(parseGrokModels(printed).default).toBe('grok-4.7');
  });

  it('keeps Grok\'s own default when it is one of xAI\'s', () => {
    expect(parseGrokModels('  - grok-4.7\n  * grok-4.7-build-fast (default)\n').default).toBe('grok-4.7-build-fast');
  });

  it('keeps the person\'s own default when there is nothing else', () => {
    expect(parseGrokModels('  * mlx-qwen (default)\n').default).toBe('mlx-qwen');
  });

  it('answers an empty list, not an error, when Grok cannot be asked', () => {
    expect(parseGrokModels('')).toEqual({ models: [], default: null });
    expect(grokModels({ bin: null })).toEqual({ models: [], default: null });
    expect(grokModels({ bin: '/nonexistent/grok-for-a-test', run: () => { throw new Error('ENOENT'); } })).toEqual({ models: [], default: null });
  });
});
