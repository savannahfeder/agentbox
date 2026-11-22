// THE FIRST SCREEN'S FOOTER SAYS SIGNING IN WHEN IT SIGNS IN (F-206).
//
// What broke: on a fresh Linux home with Claude Code installed but signed out,
// pressing Sign in to Claude Code drew the heading "Signing in to Claude Code"
// over a footer reading "CLAUDE CODE INSTALLING". The footer had its own rule,
// which called every running phase but signing-in an install.
//
// How it was measured: screenshot b014-01, QA session 41, main 1cf929c4, Nov 9 2026.
import { describe, it, expect } from 'vitest';
import { footWord } from '../renderer/src/first-run.ts';

describe('the first screen footer while an agent is set up', () => {
  it('says signing in while it checks an agent that is installed but signed out', () => {
    expect(footWord({ engine: 'claude', phase: 'checking' }, ['claude'])).toBe('signing in');
  });

  it('says installing while it checks an agent that was not installed', () => {
    expect(footWord({ engine: 'codex', phase: 'checking' }, [])).toBe('installing');
  });

  it('says installing while it installs', () => {
    expect(footWord({ engine: 'codex', phase: 'installing' }, ['claude'])).toBe('installing');
  });

  it('points at the browser while the sign-in page is open', () => {
    expect(footWord({ engine: 'claude', phase: 'signing-in' }, ['claude'])).toBe('finish in your browser');
  });

  it('gives the error when it failed', () => {
    expect(footWord({ engine: 'codex', phase: 'failed', error: 'npm exited 1' }, [])).toBe('npm exited 1');
    expect(footWord({ engine: 'codex', phase: 'failed' }, [])).toBe('did not finish');
  });
});
