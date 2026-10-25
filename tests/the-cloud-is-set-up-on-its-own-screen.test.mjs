// THE CLOUD IS SET UP ON ITS OWN SCREEN, WITH WHICHEVER ACCOUNTS SHE CHOOSES.
//
// What broke, in her words, 2026-10-14, over three rounds:
//   - the cloud menu walked her through the sign-in itself: "The component
//     shouldn't walk you through it." The menu invites; the setup is a screen.
//   - picking a choice jumped to a new page "without your approval", and the
//     first screen was "way too much reading ... I can't tell if these are
//     components that I had to click or read through."
//   - it named which Mac account to sign in with, she "signed in with a
//     different account", and "we shouldn't predefine which accounts to sign
//     up with. Give people the option."
//   - she approved on Claude's page and waited "about 30 seconds and nothing
//     happened": the code Claude shows had to come back, and nothing said so.
// Measured the same day against the real cloud: from Start to Claude's link
// took 5 s through the app's own path, so the wait was the code, not the
// cloud. Here: what each view says, that waits say they are waiting, the code
// read from the clipboard and nothing else, and the way in.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SETUP, menuSetupLine, activeSignIn, signInView, anyReady, WHERE_ROWS } from '../renderer/src/cloud-setup';
import { looksLikeClaudeCode } from '../shared/claude-code-shape.mjs';

const status = (accounts = [], signIns = []) => ({ setUp: true, mode: 'full', running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, accounts, signIns });
const acct = (extra) => ({ engine: 'claude', key: 'acct-1', name: null, ready: true, state: 'ready', ...extra });
const si = (state, extra = {}) => ({ engine: 'claude', key: 'acct-9', state, url: null, code: null, message: null, ...extra });

describe('the words', () => {
  it('keep each view to a heading and one line', () => {
    expect(SETUP.homeLede.split(' ').length).toBeLessThanOrEqual(10);
    for (const s of [si('starting'), si('needs-code'), si('checking'), si('waiting', { engine: 'codex', code: 'WY6D-YCCOE' }), si('waiting', { engine: 'codex' })]) {
      expect(signInView(s).lead.split(' ').length).toBeLessThanOrEqual(10);
    }
  });

  it('let her add either kind of account, with no account named for her', () => {
    expect([SETUP.addClaude, SETUP.addCodex]).toEqual(['Add Claude account', 'Add Codex account']);
  });
});

describe('a sign-in on screen', () => {
  it('says it is working whenever it is waiting on something other than her', () => {
    expect(signInView(si('starting')).busy).toBe(true);
    expect(signInView(si('checking')).busy).toBe(true);
    expect(signInView(si('waiting', { engine: 'codex', code: 'C' })).busy).toBe(true);
    expect(signInView(si('needs-code')).busy).toBe(false);
  });

  it('asks Claude for its code, and shows Codex its code', () => {
    expect(signInView(si('needs-code'))).toMatchObject({ paste: true, codeToType: null });
    expect(signInView(si('waiting', { engine: 'codex', code: 'WY6D-YCCOE' }))).toMatchObject({ paste: false, codeToType: 'WY6D-YCCOE' });
    expect(signInView(si('failed', { message: 'Claude did not accept that code.' })).lead).toMatch(/did not accept/);
  });

  // ChatGPT refuses a device code unless the account turned it on
  // (2026-10-21), so Codex signs in in the browser and comes back by itself:
  // no code to type, and the wait still moves.
  it('asks Codex for nothing but signing in when the browser comes back by itself', () => {
    const view = signInView(si('waiting', { engine: 'codex', url: 'https://auth.openai.com/oauth/authorize?x', code: null }));
    expect(view).toMatchObject({ lead: 'Sign in with ChatGPT in your browser.', busy: true, paste: false, codeToType: null });
    expect(view.lead).not.toMatch(/code/i);
  });

  // A failure is shown on her accounts list now, not as a screen of its own
  // (tests/a-cloud-account-is-checked-in-the-background.test.mjs).
  it('is the one waiting on her, and nothing that has ended', () => {
    const going = si('waiting', { engine: 'codex', code: 'C' });
    expect(activeSignIn(status([], [si('saved'), going]))).toBe(going);
    expect(activeSignIn(status([], [si('saved'), si('failed', { message: 'x' })]))).toBe(null);
    expect(activeSignIn(status([], [si('saved')]))).toBe(null);
  });
});

describe('Claude\'s code from the clipboard', () => {
  it('is taken only when it is shaped like one', () => {
    expect(looksLikeClaudeCode('aB3dEf9hIjKlMnOp#qRsTuVwXyZ01')).toBe(true);
    expect(looksLikeClaudeCode('  aB3dEf9hIjKlMnOp#qRsTuVwXyZ01\n')).toBe(true);
    for (const other of ['', 'hello world', 'https://claude.com/x#y', 'my password', 'short#x', 'a'.repeat(40)]) expect(looksLikeClaudeCode(other)).toBe(false);
  });

  it('is read only while a Claude sign-in is waiting for it', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    const handler = ipc.slice(ipc.indexOf("'zero:cloud-clipboard-code'"), ipc.indexOf("'zero:settings-set-workspace'"));
    expect(handler).toMatch(/s\.engine === 'claude' && s\.state === 'needs-code'/);
    expect(handler.indexOf('waiting')).toBeLessThan(handler.indexOf('readClipboardText'));
  });
});

describe('the way in', () => {
  it('is an invitation until an account is added, then a line only when one stopped working', () => {
    expect(menuSetupLine(status([]))).toBe(null);
    expect(menuSetupLine(status([acct()]))).toBe(null);
    expect(menuSetupLine(status([acct(), acct({ key: 'acct-2', state: 'broken', ready: false })]))).toEqual({ say: SETUP.menuBroken, go: SETUP.menuFix });
  });

  it('opens the setup only when she asks for it, never when she picks where threads run', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const pick = app.slice(app.indexOf('onCloudMode={'), app.indexOf('onCloudSetUp={'));
    expect(pick).not.toMatch(/setCloudSetupOpen/);
    expect(app).toMatch(/onCloudSetUp=\{\(\) => setCloudSetupOpen\(true\)\}/);
  });

  it('lets her finish once one account can run, and asks where threads start', () => {
    expect(anyReady([])).toBe(false);
    expect(anyReady([acct({ ready: false, state: 'broken' })])).toBe(false);
    expect(anyReady([acct()])).toBe(true);
    expect(WHERE_ROWS.map((r) => r.key)).toEqual(['all', 'full']);
  });
});
