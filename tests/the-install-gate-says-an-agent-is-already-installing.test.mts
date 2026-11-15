// THE GATE SAYS WHEN AN AGENT IS ALREADY BEING INSTALLED (F-145, w-b54c790f9a).
//
// What broke: a tester on a fresh Linux box pressed Install Codex on the first
// screen. The footer went to "CODEX INSTALLING" and nothing else moved: the
// heading still read "Install Claude Code or Codex to start" and both buttons
// were still there to press. The footer is six words in small caps at the
// bottom of the window; the heading is the only thing on the screen anybody
// reads. So the screen said "press one of these" for the whole of an install.
//
// How it was measured: screenshot b008-02 of the README desktop flow on main
// 5bf0ec64, Debian 13, Oct 28 2026.
//
// The rule: while an install or a sign-in is running, the heading says which
// agent and which of the two is happening, and neither button can be pressed.
// A failure puts both back, because the next press is the retry.
import { describe, it, expect } from 'vitest';
import { installGate } from '../renderer/src/first-run.ts';

describe('the first screen while an agent is being installed', () => {
  it('names the agent and holds both buttons while it installs', () => {
    const gate = installGate({ engine: 'codex', phase: 'installing', error: null });
    expect(gate.heading).toBe('Installing Codex');
    expect(gate.running).toBe(true);
  });

  it('says to finish in the browser while it signs in', () => {
    const gate = installGate({ engine: 'claude', phase: 'signing-in', error: null });
    expect(gate.heading).toBe('Finish signing in to Claude Code in your browser');
    expect(gate.running).toBe(true);
  });

  it('counts checking as running, because the press has already landed', () => {
    expect(installGate({ engine: 'codex', phase: 'checking', error: null }).running).toBe(true);
  });

  // The boundary either side: nothing started, and something that stopped.
  it('asks for a choice when nothing has been started', () => {
    const gate = installGate(null);
    expect(gate.heading).toBe('Install Claude Code or Codex to start');
    expect(gate.running).toBe(false);
  });

  it('gives the buttons back when an install fails, so the next press retries', () => {
    const gate = installGate({ engine: 'codex', phase: 'failed', error: 'npm exited 1' });
    expect(gate.heading).toBe('Install Claude Code or Codex to start');
    expect(gate.running).toBe(false);
  });

  it('gives the buttons back when it is ready, which is when the screen moves on', () => {
    expect(installGate({ engine: 'claude', phase: 'ready', error: null }).running).toBe(false);
  });

  // 'idle' is what the setup reports before a run and after one is forgotten.
  it('does not hold the buttons on idle', () => {
    expect(installGate({ engine: 'claude', phase: 'idle', error: null }).running).toBe(false);
  });
});
