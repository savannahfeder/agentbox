// Auto mode, and why it is its own thing.
//
// Measured on the CLI at 2.1.241 before any of this was written. Same command,
// same folder, same model, twice:
//   --permission-mode auto              -> refused, permission_denials had the
//                                          Bash call in it, no file appeared
//   --permission-mode bypassPermissions -> ran, the file appeared in her home
// The command was `echo hello > ~/agentbox-mode-test-marker.txt`, which is a
// write outside the workspace and nothing worse than that.
//
// So the two are not near each other and the app may never map one onto the
// other again. `--permission-mode` on that CLI takes six values and auto is
// one of them, alongside acceptEdits, bypassPermissions, manual, dontAsk and
// plan.

import { describe, it, expect } from 'vitest';
import { permissionMode, buildSessionArgs, parseSessionArgs } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { nameSlug } from '../shared/product-name.mjs';

const HERS = [
  '--model', 'claude-opus-5',
  '--allowedTools', `mcp__${nameSlug}`, 'Bash(git fetch:*)',
  '--permission-mode', 'bypassPermissions',
];

describe('auto is a shape of its own', () => {
  it('reads --permission-mode auto as auto and not as anything else', () => {
    expect(permissionMode(['--permission-mode', 'auto'])).toBe('auto');
    expect(permissionMode(['--allowedTools', `mcp__${nameSlug}`, '--permission-mode', 'auto'])).toBe('auto');
  });

  it('never reads bypass or accept edits as auto', () => {
    expect(permissionMode(HERS)).toBe('bypassPermissions');
    expect(permissionMode(['--permission-mode', 'acceptEdits'])).toBe('acceptEdits');
  });

  it('asks for auto by name when auto is chosen', () => {
    const args = buildSessionArgs(HERS, 'auto');
    expect(parseSessionArgs(args).permissionMode).toBe('auto');
    expect(args).not.toContain('bypassPermissions');
  });

  it('keeps her model and her git grants when the mode changes', () => {
    const args = buildSessionArgs(HERS, 'auto');
    expect(parseSessionArgs(args).model).toBe('claude-opus-5');
    expect(parseSessionArgs(args).allowedTools).toEqual([`mcp__${nameSlug}`, 'Bash(git fetch:*)']);
  });

  it('goes back and forth without losing anything', () => {
    const there = buildSessionArgs(HERS, 'auto');
    const back = buildSessionArgs(there, 'bypassPermissions');
    expect(permissionMode(back)).toBe('bypassPermissions');
    expect(parseSessionArgs(back).allowedTools).toEqual([`mcp__${nameSlug}`, 'Bash(git fetch:*)']);
    expect(parseSessionArgs(back).model).toBe('claude-opus-5');
  });
});

describe('what a fresh install runs in', () => {
  // With no flag at all Claude Code falls back to that person's own
  // ~/.claude/settings.json, so the same Agentbox on two Macs ran two different
  // modes and said nothing about it.
  const sup = (config) => Object.create(Supervisor.prototype, {
    config: { value: config },
    storeMcpCommand: { value: () => null },
  });

  it('states auto rather than inheriting whatever the Mac is set to', () => {
    const args = sup({}).defaultSessionArgs();
    expect(parseSessionArgs(args).permissionMode).toBe('auto');
    expect(permissionMode(args)).toBe('auto');
  });

  it('leaves a config that already says what it wants completely alone', () => {
    // Verbatim, and it stayed verbatim through the 2026-09-22 rename. A
    // translation for configs granting the store server's old name lived here
    // for one round and came out again when her own config was corrected: this
    // file is hers, and reading it as something other than what it says is the
    // kind of magic that makes a setting untrustworthy.
    expect(sup({ sessionArgs: HERS }).defaultSessionArgs()).toEqual(HERS);
  });
});
