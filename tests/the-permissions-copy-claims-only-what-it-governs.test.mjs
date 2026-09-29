// THE PERMISSIONS GROUP CLAIMED THE WHOLE WORKSPACE AND WAS INERT ON CODEX.
//
// Its note, word for word before this change:
//
//   "Claude Code's permission modes, in Claude Code's own names for them. This
//    is the starting point for the whole workspace. A project can be set to its
//    own, and a single reply can be sent in another."
//
// ALL THREE LEVELS IT NAMES ARE CLAUDE CODE'S AND NONE OF THEM REACHES A CODEX
// RUN. `codexThreadParamsFor` passes cwd, model, instructions and MCP servers,
// and the posture is the pair of constants in main/codex-session.mjs:
// `WORKER_APPROVAL_POLICY = 'on-request'` and `WORKER_SANDBOX =
// 'workspace-write'`. Neither is read off this screen, off a project, or off a
// reply. `tests/the-slash-menu-offers-nothing-codex-cannot-run.test.mjs` proves
// that end of it against the real `spawnPlan`; this file is about the sentence.
//
// THE FOUNDER ALREADY CAUGHT THIS DEFECT BY HAND, ONE ROW ABOVE, on 2026-09-05:
// "when Codex is selected as coding agent, below it still shows Claude models."
// The Model row was fixed by scoping its own sentence, and the fix is drawn only
// where there is a second engine to disambiguate. The Permissions group is the
// same defect one group lower and is now the odd one out, so it takes the same
// shape rather than a new one.
//
// THERE IS A CODEX CONTROL NOW, SINCE 2026-09-23, AND THE PARAGRAPH THAT USED
// TO STAND HERE ARGUED AGAINST ONE ON A FALSE PREMISE. It said the other
// approval policies "NEITHER GATE ANYTHING", citing a 2026-09-04 probe in which
// a patch and a `curl` ran unasked under `on-request`. Re-measured on
// codex-cli 0.153.4: they ran unasked and they also FAILED, because under
// `workspace-write` the sandbox refuses a write outside the workspace and has no
// network. Not being asked and not being stopped are different things, and the
// old note treated them as one. main/codex-session.mjs carries the numbers.
//
// So the founder's own request -- that users switch modes on both engines the
// way they naturally would -- is buildable after all, and is built: three
// modes, each a sandbox and an approval policy together, in
// shared/codex-modes.mjs.
//
// WHAT THIS FILE STILL GUARDS, and it is the important half: the Codex control
// is its OWN control with its OWN three words, never a seventh row bolted onto
// Claude Code's six, and the screen still never prints Codex's raw protocol
// vocabulary at her.
//
// A DENSE SCREEN IS A FAILED SCREEN, so the extra clause exists only on the Mac
// that needs it. On every Mac with one coding agent -- which is every copy of
// Agentbox until she writes the moment into zero.config.json -- the note is the
// string above, character for character.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKER_APPROVAL_POLICY, WORKER_SANDBOX } from '../main/codex-session.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

/**
 * THE SENTENCE UNDER THE CLAUDE CODE CARD'S PERMISSIONS ROW.
 *
 *  It used to come in two versions, a short one for a Mac with one coding agent
 *  and a longer one that added "Codex has its own three, below" where there was
 *  a second. Both existed to say WHOSE modes these were, and neither had to
 *  once the control moved inside the card headed Claude Code (2026-09-23). One
 *  sentence now, on every Mac, and the `twoEngines` guard around it went with
 *  the second version.
 *
 *  NEITHER SENTENCE OFFERS A PROJECT ONE OF ITS OWN ANY MORE (w-d19d6d387c,
 *  2026-09-23). The strips came off a project's page, which she could not read:
 *  "I still don't actually understand what those toggles do, even after reading
 *  them." A project that already carries a mode still says so on its own page
 *  and can be put back on the workspace setting from there.
 */
const CLAUDE_CARD_NOTE =
  "Claude Code's own modes. The starting point for every Claude Code agent, and a single reply can be sent in another.";

/** And the Codex card's, which never needs to name Codex either. */
const CODEX_CARD_NOTE =
  'The starting point for every Codex agent.';

describe('the copy under each card stopped disambiguating by sentence', () => {
  it('says whose modes they are once, and lets the card say it again', () => {
    expect(settings).toContain(CLAUDE_CARD_NOTE);
    expect(settings).toContain(CODEX_CARD_NOTE);
  });

  // THE CLAIM THE OLD COPY GOT WRONG THREE TIMES. "The whole workspace" was
  // false the moment there were two engines, and the fix each time was another
  // clause. There is no clause now because there is no ambiguity to resolve.
  it('never claims the whole workspace for one engine\'s modes', () => {
    expect(CLAUDE_CARD_NOTE).not.toContain('the whole workspace');
    expect(CODEX_CARD_NOTE).not.toContain('the whole workspace');
  });

  // AND NEITHER SENTENCE MENTIONS THE OTHER ENGINE. A card that has to point at
  // another card is a control in the wrong place.
  it('neither sentence points at the other engine', () => {
    expect(CODEX_CARD_NOTE).not.toContain('Claude');
    expect(CLAUDE_CARD_NOTE).not.toContain('Codex');
  });

  // The Permissions label survives the move: she went looking for that exact
  // word on 2026-08-23 and could not find it.
  it('keeps the word she looked for as the Claude Code control\'s label', () => {
    // It moved from a div into the Picker's own label prop when the control
    // became a menu (2026-09-23). The word is what matters, not the element:
    // she scanned this screen for it on 2026-08-23 and could not find it.
    expect(settings).toMatch(/label="Permissions"/);
  });
});

describe('the per-project row says whose sessions it is about', () => {
  // THE STRIP CAME OFF THE PROJECT PAGE (w-d19d6d387c). A per-project
  // permission mode was almost never set, and the control was seven Claude Code
  // words and two caveats on a page opened to change the rules. Even after
  // reading it, the toggles did not say what they did.
  //
  // `projectSessionArgs` is still honoured, so a project that HAS one says so
  // in a sentence and offers the way back to the workspace setting. The label
  // still scopes itself to Claude Code where there are two engines, which is
  // the rule this file exists for.
  it('names the engine it governs where there is a second one', () => {
    expect(settings).toContain('This project has its own Claude Code permissions');
    expect(settings).toContain('This project has its own permissions');
  });

  it('draws that only where there is a choice, like the row above it', () => {
    const label = settings.indexOf('This project has its own Claude Code permissions');
    expect(label).toBeGreaterThan(-1);
    const guard = settings.lastIndexOf('twoEngines', label);
    expect(guard).toBeGreaterThan(-1);
    expect(label - guard).toBeLessThan(120);
  });

  // And the row exists only on a project that already has an override, so on
  // every project of hers the group is one switch.
  it('is drawn only where a project carries one', () => {
    const row = settings.indexOf('This project has its own Claude Code permissions');
    const guard = settings.lastIndexOf("current.permission !== 'workspace'", row);
    expect(guard).toBeGreaterThan(-1);
    expect(row - guard).toBeLessThan(200);
  });

  // The project page has no engine on it at all -- an engine is a workspace
  // default or a per-task choice, never a project setting -- so the row scopes
  // its label and sends her nowhere. The explanation lives in the one place it
  // belongs, which is the workspace note above.
  it('does not repeat the Codex sentence on every project page', () => {
    const project = settings.slice(settings.indexOf('Everything here is this project only'));
    expect(project).not.toContain('Codex is not set here');
  });
});

describe('nothing was invented to stand in for the six', () => {
  // The posture is a pair of constants and this screen must never look like a
  // dial onto them.
  it('never prints Codex\'s own settings vocabulary', () => {
    expect(WORKER_APPROVAL_POLICY).toBe('on-request');
    expect(WORKER_SANDBOX).toBe('workspace-write');
    for (const jargon of ['untrusted', 'on-request', 'workspace-write', 'approvalPolicy', 'approval policy', 'sandbox']) {
      expect(settings.toLowerCase(), jargon).not.toContain(jargon.toLowerCase());
    }
  });

  it('never builds the Codex control out of Claude Code\'s six', () => {
    // ONE Segbar, for the workspace: the project's own strip came off the page
    // (w-d19d6d387c). Codex's list is never spliced into it either. A Codex mode
    // is not a seventh permission mode, and the name `codexPermission` is the
    // shape of that mistake.
    expect(settings.match(/options=\{PERMISSION_OPTIONS\}/g)).toHaveLength(1);
    expect(settings.match(/\.\.\.PERMISSION_OPTIONS,/g)).toBe(null);
    expect(settings).not.toContain('codexPermission');
    expect(settings).not.toContain('CODEX_PERMISSION');
  });

  it('gives Codex its own list, read from the one place that holds it', () => {
    // ONE picker, for the workspace, off CODEX_MODE_OPTIONS, which is built
    // from shared/codex-modes.mjs and nowhere else. The project picker went
    // with the Claude Code one (w-d19d6d387c, 2026-09-23): a project that
    // carries a mode of its own says so in a sentence and offers the way back.
    expect(settings).toContain("from '../codex-modes'");
    expect(settings.match(/options=\{CODEX_MODE_OPTIONS\}/g)).toHaveLength(1);
    expect(settings.match(/\.\.\.CODEX_MODE_OPTIONS,/g)).toBe(null);
    // And its three labels are never retyped on this screen.
    expect(settings).not.toMatch(/label: 'Full access'/);
  });

  // And the words of the six stay Claude Code's own, read from the one place
  // that holds them. A Codex column beside them is how "Medium" and "medium"
  // ended up on adjacent screens.
  it('still reads the six from the one vocabulary there is', () => {
    expect(settings).toContain("from '../modes'");
    expect(settings).not.toMatch(/default: 'Manual',/);
  });
});
