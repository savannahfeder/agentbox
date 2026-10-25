// A STOPPED ROW SAYS WHAT AN OLD CLAUDE CODE OR A BLOCKED NETWORK NEEDS — w-6d8c543a43.
//
// WHAT BROKE. shared/spawn-trouble.mjs learned two causes on this branch:
// 'too-old' (Claude Code before 2.1.71 rejects `--permission-mode auto` and
// every worker dies in under a second, measured on 14 versions from npm) and
// 'network' (a company proxy or certificate the app never had). The pane got
// whole sentences for both, but the row's one-line fragment in
// renderer/src/trouble-row.ts knew neither, so it read "stopped, still
// trying": the one thing neither is, because both wait on the person.

import { describe, it, expect } from 'vitest';
import { shortNext } from '../renderer/src/trouble-row.ts';
import { troubleCause } from '../shared/spawn-trouble.mjs';

const row = (cause) => ({ cause, count: 1, what: '', next: '', act: null, hers: true });

describe('the one line a stopped row prints', () => {
  it('asks for Claude Code to be updated when it is too old', () => {
    expect(troubleCause("error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, plan.")).toBe('too-old');
    expect(shortNext(row('too-old'))).toBe('need Claude Code updated');
  });

  it('asks for the proxy or certificate when the network blocks it', () => {
    expect(shortNext(row('network'))).toBe('need the network set up');
  });

  it('asks for a ChatGPT sign-in when Codex is signed in with an API key', () => {
    expect(shortNext(row('api-key'))).toBe('need a ChatGPT login');
  });

  it('asks for the Codex config to be fixed when Codex cannot read it', () => {
    expect(shortNext(row('codex-config'))).toBe('need config.toml fixed');
  });

  it('still says "stopped, still trying" for a cause nobody named', () => {
    expect(shortNext(row('unknown'))).toBe('stopped, still trying');
  });
});
