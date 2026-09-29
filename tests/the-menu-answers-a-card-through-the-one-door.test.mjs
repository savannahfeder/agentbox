// THE AGENTS MENU ANSWERS A CARD THROUGH THE SAME DOOR AS THE CHORD.
//
// There are two ways to allow the oldest pending approval without touching the
// page: the ⌘Y/⌘N chord, caught in `before-input-event` so it outranks anything
// that holds the keyboard, and the "Allow/Deny Pending Approval" items in the
// Agents menu. They were not the same code. The chord went through
// `ipc.answerApproval`; the menu wrote the answer FILE itself, with
// `approvals.answer`, and nothing else.
//
// ON A CLAUDE CODE CARD that difference is invisible: the file IS the answer,
// because the thing waiting for it is a separate process
// (main/approval-prompt-server.mjs) and a file is the only channel it has.
//
// ON A CODEX CARD IT IS THE WHOLE OF THE BEHAVIOUR, and what it produces is the
// app accusing her of forging her own approval. The thing waiting is Agentbox
// itself, so nothing on that path ever reads an answer file, and a
// `<id>.answer.json` that appears for a request still waiting is by definition
// a worker's forgery (main/codex-approvals.mjs). Her click on Allow therefore
// went: file written -> within 2s `sweepForgery` deletes it and logs "an answer
// file appeared for approval <id> that the founder did not write" -> her card
// comes back -> the worker sits there until the fifteen-minute deadline denies
// it. She allowed a command and Agentbox denied it a quarter of an hour later
// while telling the log she had not been the one who allowed it.
//
// It also poisons the one warning that is supposed to mean a worker attacked
// the spool. A line that fires when the founder presses her own menu item is a
// line nobody can act on.
//
// WHY IT WAS WRITTEN THAT WAY. `installMenu` runs inside `createWindow` long
// before `registerIpc` does -- the menu needs only the config, the IPC surface
// needs the window, the store and the supervisor -- so `ipc` genuinely does not
// exist yet at the callsite. The fix is to late-bind it rather than to reach
// past it: the menu closes over a variable that `registerIpc` fills in.
//
// Asserted against the source, the same way tests/reload-chord-reaches-the-main
// -process.test.mjs is: the main process is not something this suite can boot,
// and the invariant is structural.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const main = read('main', 'main.mjs');
const menu = read('main', 'menu.mjs');
const ipc = read('main', 'ipc.mjs');

/** The block that wires the application menu up. */
function installMenuCall() {
  const start = main.indexOf('installMenu({');
  expect(start).toBeGreaterThan(-1);
  const end = main.indexOf('// ANALYTICS', start);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('the Allow/Deny items in the Agents menu', () => {
  it('exist, on the chords she already knows', () => {
    expect(menu).toMatch(/accelerator: 'Command\+Y'/);
    expect(menu).toMatch(/accelerator: 'Command\+N'/);
    expect(menu).toMatch(/onApproval\?\.\(true\)/);
    expect(menu).toMatch(/onApproval\?\.\(false\)/);
  });

  // THE BUG. `approvals.answer` writes the file and tells nobody, which on a
  // Codex card is not an answer at all.
  it('never writes the answer file behind the ipc layer', () => {
    expect(installMenuCall()).not.toMatch(/approvals\.answer\(/);
  });

  it('answers through the same door the chord uses', () => {
    expect(installMenuCall()).toMatch(/answerApproval\(/);
  });

  // AND THE DOOR IS LATE-BOUND, because the menu is installed before the IPC
  // surface exists. A binding captured at install time would be the stub
  // forever, which is the same silence in a different shape.
  it('is bound to the real door once registerIpc has made one', () => {
    const at = main.indexOf('const ipc = registerIpc(');
    expect(at).toBeGreaterThan(-1);
    // Filled in immediately after the IPC surface is built, and before anything
    // else can be pressed.
    expect(main.slice(at, at + 400)).toMatch(/answerApproval = ipc\.answerApproval/);
    // And the menu is still installed early, where it only needs the config.
    expect(main.indexOf('installMenu({')).toBeLessThan(at);
  });
});

describe('the one answering door', () => {
  // The comment in main/ipc.mjs claimed to be the only place an approval is
  // answered while the menu was answering somewhere else. It is true now, and
  // the claim is worth keeping only while it is.
  it('is the only place in main/ that writes an answer file', () => {
    const writers = ['main.mjs', 'ipc.mjs', 'menu.mjs']
      .filter((f) => /approvals\.answer\(/.test(read('main', f)));
    expect(writers).toEqual(['ipc.mjs']);
  });

  it('tells a Codex worker directly, because nothing on that path reads a file', () => {
    expect(ipc).toMatch(/supervisor\.settleCodexApproval\?\.\(id, allow, note\)/);
  });
});
