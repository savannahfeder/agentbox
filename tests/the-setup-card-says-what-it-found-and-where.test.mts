// THE SETUP CARD SAYS WHAT IT FOUND, WHERE IT IS, AND WHAT IT IS WAITING FOR.
//
// Found by the tester on a Linux box, 2026-10-23 (F-14, F-15).
//
// F-15: the first row read "Install Codex  ✓ Done" on a home with nothing in
// it. Nothing was installed; Codex was already on the computer, so the install
// was skipped and the row was ticked anyway. The row said the opposite of what
// happened and named no path.
//
// F-14: "Show what is happening" opened Codex's own stdout. In it: a WARNING
// about PATH aliases it had already decided to proceed without, the whole
// OAuth URL with its client id, and "On a remote or headless machine? Use
// `codex login --device-auth` instead." The one genuinely useful thing on that
// machine -- the sign-in link, for when no browser opens -- was a line of log
// text nobody could press.
//
// So the URL comes out of the log and becomes a button, and the log is read
// into plain sentences. ANYTHING THIS FILE HAS NEVER HEARD OF IS KEPT: hiding a
// line we did not recognise is how a real error becomes a silence, which this
// repository has a standing rule against.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COPY, readLog, setupRows } from '../renderer/src/plan-setup.ts';
import { PlanSetupCard } from '../renderer/src/components/PlanSetup.tsx';

/**
 * Word for word what the tester's screenshot showed, with the client id
 * shortened. The warning is one line here: the panel wrapped it across three.
 */
const CODEX_LOG = [
  'WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp" (codex_home: AbsolutePathBuf("/tmp/agentbox-fresh-user/2026-10-24T00-22-25/.codex"))',
  'Starting local login server on http://localhost:1455.',
  'If your browser did not open, navigate to this URL to authenticate:',
  '',
  'https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_EMoam&redirect_uri=http%3A%2F%2F',
  '',
  'On a remote or headless machine? Use `codex login --device-auth` instead.',
].join('\n');

describe('what the first row says', () => {
  // THE CASE THE TESTER HIT. Codex was already there, so there was no install.
  it('says it found the tool, and where, when it did not install anything', () => {
    const [install] = setupRows({ engine: 'codex', phase: 'checking', already: true, bin: '/usr/local/bin/codex' });
    expect(install.title).toBe(COPY.found('Codex'));
    expect(install.sub).toBe('/usr/local/bin/codex');
    expect(install.right).toBe(COPY.done);
  });

  // THE OTHER SIDE OF IT. A real install still says it installed, and still
  // says where it landed, which is the second half of what was asked for.
  it('says it installed the tool, and where, when it did', () => {
    const [install] = setupRows({ engine: 'claude', phase: 'checking', already: false, bin: '/home/x/.local/bin/claude' });
    expect(install.title).toBe(COPY.install('Claude Code'));
    expect(install.sub).toBe('/home/x/.local/bin/claude');
  });

  // THE CASE THAT MUST NOT MATCH. Before anything has been looked for there is
  // nothing true to say about a path, so the row says nothing about one.
  it('claims nothing about a path before it has looked', () => {
    const [install] = setupRows({ engine: 'codex', phase: 'installing' });
    expect(install.sub).toBeUndefined();
    expect(install.title).toBe(COPY.install('Codex'));
    expect(install.right).toBe(COPY.working);
  });
});

describe('reading the log out loud', () => {
  const said = readLog(CODEX_LOG);

  it('pulls the sign-in link out, so it can be a button instead of a line of text', () => {
    expect(said.url).toBe('https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_EMoam&redirect_uri=http%3A%2F%2F');
    expect(said.lines.join(' ')).not.toContain('client_id');
  });

  it('drops the warning it had already decided to proceed without', () => {
    expect(said.lines.join(' ')).not.toMatch(/WARNING|PATH aliases|helper binaries|AbsolutePathBuf/);
  });

  it('answers the headless line with the button rather than repeating a command', () => {
    expect(said.lines.join(' ')).not.toMatch(/device-auth|codex login/);
    expect(said.lines.join(' ')).toContain(COPY.copyLink);
  });

  it('says in plain words what it is waiting for', () => {
    expect(said.lines).toContain('Waiting for your browser to come back.');
    expect(said.lines.join(' ')).not.toMatch(/localhost:1455/);
  });

  // THE CASE THAT MUST NOT MATCH, and the one that matters most. A line this
  // file has never seen is kept word for word: a real failure read as noise is
  // a failure in silence.
  it('keeps a line it does not recognise, rather than hiding it', () => {
    const said = readLog('npm error code EACCES\nnpm error syscall mkdir');
    expect(said.lines).toEqual(['npm error code EACCES', 'npm error syscall mkdir']);
    expect(said.url).toBe(null);
  });

  it('says the same thing once however many times the sign-in was reopened', () => {
    const twice = readLog([CODEX_LOG, CODEX_LOG].join('\n'));
    expect(twice.lines).toEqual(said.lines);
  });

  it('has nothing to say about an empty log', () => {
    expect(readLog('')).toEqual({ lines: [], url: null });
  });
});

describe('the card itself', () => {
  const draw = (state) => renderToStaticMarkup(createElement(PlanSetupCard, {
    plan: 'codex', onDone: () => {}, onSkip: () => {}, state,
  }));

  it('offers the sign-in link as a button while it waits, for a machine with no browser', () => {
    const html = draw({ engine: 'codex', phase: 'signing-in', error: null, log: CODEX_LOG });
    expect(html).toContain(COPY.copyLink);
  });

  // THE CASE THAT MUST NOT MATCH. No link in the log is no button, rather than
  // a button that copies nothing.
  it('offers no link when there is none to copy', () => {
    expect(draw({ engine: 'codex', phase: 'installing', error: null, log: '' })).not.toContain(COPY.copyLink);
  });
});
