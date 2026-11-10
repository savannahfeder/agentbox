// CLOSING THE CODEX SIGN-IN PAGE DOES NOT STRAND THE FIRST SCREEN (F-178, F-179).
//
// What broke: a new user with Codex installed but signed out saw "Install
// Claude Code or Codex to start" over "NO CODING AGENT FOUND", pressed Install
// Codex, and the browser opened OpenAI's sign-in. They closed that tab. The
// screen read "Finish signing in to Codex in your browser" with both buttons
// dimmed and nothing else to press; Escape did nothing; `codex login` waited on
// for good. Only quitting the app got out.
//
// How it was measured: QA session 33, screenshots b011-05 to b011-09, Debian 13,
// main 3241b2b6, a fresh home with no .codex folder and the Codex CLI on PATH.
//
// The rule: an installed, signed-out agent is called signed out and its button
// says Sign in; while a sign-in waits, the screen offers to open the page again
// and a Back that stops the sign-in and gives both choices back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { foundLine, installGate, setupWord, signedOutEngines } from '../renderer/src/first-run.ts';
import * as classic from '../renderer/src/first-run-classic.ts';

const CODEX_SIGNED_OUT = [{ engine: 'claude', found: false, signedIn: false }, { engine: 'codex', found: true, signedIn: false }];
const NOTHING = [{ engine: 'claude', found: false, signedIn: false }, { engine: 'codex', found: false, signedIn: false }];

describe('an installed agent that is signed out', () => {
  it('is named as signed out, not missing', () => {
    expect(signedOutEngines(CODEX_SIGNED_OUT)).toEqual(['codex']);
    expect(foundLine(['codex'])).toEqual(['Codex', 'signed out']);
  });

  it('has a button that says it signs in, beside one that installs the other', () => {
    expect(setupWord('codex', ['codex'])).toBe('Sign in to Codex');
    expect(setupWord('claude', ['codex'])).toBe('Install Claude Code');
    expect(installGate(null, ['codex']).heading).toBe('Set up Claude Code or Codex to start');
  });

  it('reads as signing in, not installing, while the sign-in is checked', () => {
    expect(installGate({ engine: 'codex', phase: 'checking' }, ['codex']).heading).toBe('Signing in to Codex');
  });

  // The case that must not change: nothing on the computer at all.
  it('still says install and not found when nothing is there', () => {
    expect(signedOutEngines(NOTHING)).toEqual([]);
    expect(foundLine([])).toEqual(['No coding agent', 'found']);
    expect(setupWord('codex', [])).toBe('Install Codex');
    expect(installGate(null, []).heading).toBe('Install Claude Code or Codex to start');
  });

  it('does not count a signed-in agent as signed out', () => {
    expect(signedOutEngines([{ engine: 'codex', found: true, signedIn: true }])).toEqual([]);
  });
});

describe('while a sign-in waits on the browser', () => {
  it('offers to open the page again', () => {
    const gate = installGate({ engine: 'codex', phase: 'signing-in' }, ['codex']);
    expect(gate.running).toBe(true);
    expect(gate.again).toBe(true);
  });

  it('does not offer the page again while installing, when there is no page yet', () => {
    expect(installGate({ engine: 'codex', phase: 'installing' }).again).toBe(false);
  });

  it('gives the choices back once the setup is stopped', () => {
    expect(installGate({ engine: 'codex', phase: 'idle' }, ['codex']).running).toBe(false);
  });

  it('is the same rule in both first runs', () => {
    expect(classic.installGate).toBe(installGate);
    expect(classic.setupWord).toBe(setupWord);
  });

  for (const file of ['FirstRun.tsx', 'FirstRunClassic.tsx']) {
    const src = fs.readFileSync(new URL(`../renderer/src/components/${file}`, import.meta.url), 'utf8');
    it(`${file} draws Back and Open the page again, and they reach main`, () => {
      expect(src).toContain("api.engineSetup('cancel', setup.engine)");
      expect(src).toContain("api.engineSetup('again', setup.engine)");
      expect(src).toMatch(/gate\.again && <button[^>]*onClick=\{signInAgain\}>Open the page again/);
      expect(src).toMatch(/onClick=\{stopSetup\}>Back <Key k="esc" \/>/);
      expect(src).toMatch(/gate\.running && e\.key === 'Escape'\) \{ e\.preventDefault\(\); stopSetup\(\); \}/);
      expect(src).not.toContain('>Install Codex <Key');
    });
  }
});
