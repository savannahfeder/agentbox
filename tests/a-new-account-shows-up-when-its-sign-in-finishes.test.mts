// A NEW ACCOUNT SHOWS UP WHEN ITS SIGN IN FINISHES.
//
// What broke, 2026-10-05: Settings says "the account appears above when it is
// done", and it did not. `claude auth login` printed "Login successful." and
// went back to the prompt, and the new row kept reading "Not signed in" until
// something unrelated happened to reload the page ("i clicked some things
// around and eventually my account did show up"). The account list was read
// once when Add was pressed and never again, because nothing was listening for
// the sign in to end.
//
// The terminal already knows: its foreground process is `claude` while the
// sign in runs and the shell again once it returns. So the page reloads on that
// change, once per command that finishes, and not on the shell merely sitting
// at its prompt before anything has run.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { whenACommandFinishes } from '../shared/terminal-state.mts';

describe('when a command finishes', () => {
  it('fires once, as the sign in hands back to the prompt', () => {
    let n = 0;
    const seen = whenACommandFinishes(() => { n += 1; });
    seen('-zsh', false);
    seen('claude', false);
    seen('claude', false);
    expect(n).toBe(0);
    seen('-zsh', false);
    expect(n).toBe(1);
    seen('zsh', false);
    seen('/bin/zsh', false);
    expect(n).toBe(1);
  });

  it('does not fire for a shell that has only ever sat at its prompt', () => {
    let n = 0;
    const seen = whenACommandFinishes(() => { n += 1; });
    seen('Shell', false);
    seen('-zsh', false);
    seen('zsh', false);
    expect(n).toBe(0);
  });

  it('fires when the shell itself ends with the command still up', () => {
    let n = 0;
    const seen = whenACommandFinishes(() => { n += 1; });
    seen('claude', false);
    seen('claude', true);
    expect(n).toBe(1);
  });

  it('fires again for a second sign in in the same shell', () => {
    let n = 0;
    const seen = whenACommandFinishes(() => { n += 1; });
    seen('claude', false);
    seen('zsh', false);
    seen('codex', false);
    seen('zsh', false);
    expect(n).toBe(2);
  });

  it('is what the Add account panel reloads the accounts on', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/<SettingsTerminal[^>]*onFinished=\{[^}]*load\(\)/);
    const term = fs.readFileSync(new URL('../renderer/src/components/TaskTerminal.tsx', import.meta.url), 'utf8');
    expect(term).toMatch(/whenACommandFinishes/);
    expect(term).toMatch(/registerLinkProvider/);
  });
});
