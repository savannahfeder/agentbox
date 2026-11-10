// 2026-10-11. Standing instructions ride on Claude Code's
// `--append-system-prompt`. No other engine has that flag: ACP has no system
// prompt in the protocol at all, and OpenCode's server takes none either. The
// person's standing instructions, their project instructions and the message
// rules are therefore the one thing that silently does not arrive, and a
// worker that never read them is worse than one that failed to start, because
// it works and answers wrongly.
//
// Decided with Codex and chosen by the person on w-380b06bf53: the instructions
// go into the file the tool itself reads, named per tool in definition data.
//
// WHAT MUST NOT GO WRONG, and it is why this file exists:
//
// - NEVER A TRACKED FILE. A task folder is a worktree of somebody's own
//   repository, and AGENTS.md is often committed in it. This repo already paid
//   for that lesson once (CLAUDE.md, "A BUILD NEVER WRITES A TRACKED FILE"):
//   every folder reported itself dirty, folders were never reclaimed, and
//   change cards carried files nobody had touched.
// - NEVER SOMEBODY ELSE'S WORDS. If the file exists, what is already in it
//   stays, and only our own block is rewritten, however many times a thread is
//   resumed.
// - NEVER SILENTLY DROPPED. An engine that carries instructions by neither a
//   flag nor a file says so, so it cannot be offered as though it did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { instructionsTarget, writeInstructions, carriesInstructions, INSTRUCTIONS_BEGIN, INSTRUCTIONS_END } from '../main/harnesses/instructions-file.mts';
import { harnessDefinition } from '../shared/harness-definitions.mts';
import { harnessFor, createHarnessRegistry } from '../main/harnesses.mts';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instructions-'));
const SYSTEM = 'Keep responses focused and brief.\n\nNo jargon unless I use it first.';

describe('standing instructions reach an engine that has no system prompt', () => {
  it('knows which engines carry them by a flag and which by a file', () => {
    // Claude Code has the flag, and nothing about it changes.
    expect(harnessDefinition('claude').run.system).toBe('--append-system-prompt');
    expect(carriesInstructions(harnessDefinition('claude'))).toBe('flag');
    expect(carriesInstructions({ instructions: { file: 'AGENTS.md', in: 'home' } })).toBe('file');
    expect(carriesInstructions({})).toBe(null);
  });

  it('takes the file name and where it lives from the definition', () => {
    const home = temp(), cwd = temp();
    expect(instructionsTarget({ instructions: { file: 'AGENTS.md', in: 'home' } }, { cwd, home }))
      .toBe(path.join(home, 'AGENTS.md'));
    // Gemini CLI reads its own name, and that is a name in data, not a branch.
    expect(instructionsTarget({ instructions: { file: 'GEMINI.md', in: 'home' } }, { cwd, home }))
      .toBe(path.join(home, 'GEMINI.md'));
    expect(instructionsTarget({ instructions: { file: 'AGENTS.md', in: 'cwd' } }, { cwd, home }))
      .toBe(path.join(cwd, 'AGENTS.md'));
    expect(instructionsTarget({}, { cwd, home })).toBe(null);
  });

  it('writes the block the person actually wrote, word for word', () => {
    const file = path.join(temp(), 'AGENTS.md');
    writeInstructions({ file, text: SYSTEM });
    const written = fs.readFileSync(file, 'utf8');
    expect(written).toContain(SYSTEM);
    expect(written).toContain(INSTRUCTIONS_BEGIN);
    expect(written).toContain(INSTRUCTIONS_END);
    // Nothing paraphrased and nothing cut: the flag path appends this same
    // string whole, so the file path has to as well.
    expect(written.slice(written.indexOf(INSTRUCTIONS_BEGIN) + INSTRUCTIONS_BEGIN.length, written.indexOf(INSTRUCTIONS_END)).trim()).toBe(SYSTEM);
  });

  it('keeps what was already in the file, and rewrites only our own block', () => {
    const file = path.join(temp(), 'AGENTS.md');
    fs.writeFileSync(file, '# House rules\n\nRun the tests before you push.\n');
    writeInstructions({ file, text: SYSTEM });
    writeInstructions({ file, text: 'Now something else entirely.' });
    const written = fs.readFileSync(file, 'utf8');
    expect(written).toContain('Run the tests before you push.');
    expect(written).toContain('Now something else entirely.');
    expect(written).not.toContain(SYSTEM);                       // replaced, not stacked
    expect(written.split(INSTRUCTIONS_BEGIN).length - 1).toBe(1); // exactly one block
  });

  it('refuses to write a file the person repository tracks', () => {
    const repo = temp();
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
    fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Their own instructions\n');
    execFileSync('git', ['add', 'AGENTS.md'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'theirs'], { cwd: repo });

    const file = path.join(repo, 'AGENTS.md');
    expect(() => writeInstructions({ file, text: SYSTEM, cwd: repo })).toThrow(/tracked/i);
    // And it is left exactly as they committed it.
    expect(fs.readFileSync(file, 'utf8')).toBe('# Their own instructions\n');
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })).toBe('');

    // An untracked file in that same repository is fine: it is ours, and it
    // cannot ride along into anybody change.
    const ours = path.join(repo, 'AGENTBOX.md');
    writeInstructions({ file: ours, text: SYSTEM, cwd: repo });
    expect(fs.readFileSync(ours, 'utf8')).toContain(SYSTEM);
  });

  it('declares itself unable rather than dropping them', () => {
    const registry = createHarnessRegistry([{
      id: 'mute', label: 'Mute', spawn: () => 'started',
      instructions: () => { throw Error('should never be called'); },
      available: name => name !== 'instructions',
    }]);
    expect(registry.supports('mute', 'instructions')).toBe(false);
    expect(() => registry.get('mute').instructions()).toThrow(/Mute.*instructions/);
    // And the two live engines each say how they carry them, so neither can
    // inherit the refusal meant for an engine that has nowhere to put them.
    expect(harnessFor('claude').instructions({ cwd: '/tmp/task', home: '/tmp/home' })).toEqual({ by: 'flag' });
    expect(harnessFor('codex').instructions({ cwd: '/tmp/task', home: '/tmp/home' })).toEqual({ by: 'thread' });
  });
});
