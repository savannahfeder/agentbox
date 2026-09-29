// CHOOSING CLAUDE CODE IS NOT THE SAME AS CHOOSING NOTHING, AND THE COMPOSER
// SAID "With Claude Code." WHILE FILING A ROW THAT RAN ON CODEX.
//
// Three lines, each defensible on its own, that add up to the composer lying:
//
//   1. `EnginePicker` encodes Claude Code as `null` -- `pick` does `onChange(id
//      === DEFAULT_ENGINE ? null: id)` -- because null is what the card already
//      means by "she has not chosen".
//   2. `Compose` sent `...(engine ? { engine }: {})`, so a null engine put no
//      field on the payload at all, on the reading that "a row marked with the
//      engine it would have run on anyway carries no news".
//   3. `engineFor` (shared/engines.mjs) answers the WORKSPACE DEFAULT for a row
//      that names no engine -- and that default is `config.engine`, which she
//      sets in Settings and which may be Codex.
//
// So on a Mac whose workspace default is Codex, she opens the composer, reads
// "With Claude Code.", presses ⌘↵, and the row runs on Codex. Nothing on any
// screen is wrong on its own; the sentence and the run simply disagree. And it
// is durable rather than momentary: a repeating rule takes the same path
// (`zero:compose-repeat`), so every future run of that task inherits it.
//
// "CARRIES NO NEWS" WAS THE FAULTY STEP, and only for the half of it that turns
// out to be news. A row naming the engine it would have run on ANYWAY really is
// a field with nothing in it -- but "the engine it would have run on anyway" is
// the workspace default, not Claude Code. The two are the same thing on her Mac
// today and on every downloaded copy of Agentbox, and they are not the same thing
// on the Mac this feature exists for.
//
// SO THE DOOR ASKS THE QUESTION IT MEANT TO ASK. `engineOffered` files an
// engine when it DIFFERS from what the row would resolve to on its own, and
// files nothing when it does not -- which keeps every row she has ever sent
// exactly as it was, because on a one-engine Mac the two can never differ. The
// composer stopped throwing the answer away on the way there: it sends the word
// whenever the picker was drawn, and the door decides whether it is worth
// writing.
//
// THE ALTERNATIVE WAS A THIRD STATE IN THE PICKER -- "Workspace default",
// distinct from "Claude Code" -- and it is a worse trade here: it is a second
// thing to read in a sentence that is meant to be read at a glance, on a
// control she opens to make a choice, and it does not remove the defect so much
// as make her responsible for noticing it (CLAUDE.md, THE USER STAYS IN FLOW).
//
// AND `modelOffered` HAD TO MOVE WITH IT. It asked "did the engine survive the
// door", and read a filed `null` as "this row runs on Claude Code" -- which is
// exactly the assumption this fix breaks. On a Codex-default workspace her
// Codex model would have been dropped off a row that really does run on Codex.
// The two fields are one choice; the last case in the door block below is that.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CODEX_BIN = '/nonexistent/codex/codex';
const OPENED = '2026-09-04T00:00:00Z';

const dirs = [];
const build = (config) => {
  const dir = mkdtempSync(join(tmpdir(), 'engine-choice-'));
  dirs.push(dir);
  return new Supervisor(
    {
      home: '/nonexistent-home', storeRoot: dir, claudeBin: '/nonexistent/claude',
      maxConcurrentSessions: 4, authProfiles: ['default'], ...config,
    },
    { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {} },
    '/nonexistent-app',
  );
};
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

/**
 * The Mac this whole file is about: both engines on offer, and the workspace
 *  set to the second one. */
const codexWorkspace = () => build({ codexBin: CODEX_BIN, engineChoice: OPENED, engine: 'codex' });
/** And hers: both engines on offer, workspace still Claude Code. */
const claudeWorkspace = () => build({ codexBin: CODEX_BIN, engineChoice: OPENED });

/* ================== what the door is willing to write ==================== */

describe('a workspace that defaults to Codex', () => {
  // THE BUG. Her explicit Claude Code is news on this Mac, because without it
  // written down the row resolves to Codex.
  it('writes her explicit Claude Code on the row, because it changes the answer', () => {
    expect(codexWorkspace().engineOffered('claude')).toBe('claude');
  });

  // AND THE OTHER HALF OF THE SAME RULE: naming the workspace default is still
  // a field with nothing in it, whichever engine that default happens to be.
  it('writes nothing when she names the engine it would have run on anyway', () => {
    expect(codexWorkspace().engineOffered('codex')).toBeNull();
    expect(claudeWorkspace().engineOffered('claude')).toBeNull();
  });

  it('still writes Codex where Claude Code is the default', () => {
    expect(claudeWorkspace().engineOffered('codex')).toBe('codex');
  });

  // THE CASE THAT MUST NOT MATCH, AND IT IS HER MAC AND EVERY DOWNLOADED COPY.
  // Where there is only one engine the two can never differ, so nothing is ever
  // written and every row she has sent reads exactly as it did.
  it('writes nothing at all on a Mac with no choice on it, however the call arrives', () => {
    for (const sup of [build({}), build({ codexBin: CODEX_BIN }), build({ engineChoice: OPENED })]) {
      expect(sup.engineOffered('claude')).toBeNull();
      expect(sup.engineOffered('codex')).toBeNull();
      expect(sup.engineOffered(null)).toBeNull();
      expect(sup.engineOffered(undefined)).toBeNull();
    }
  });

  it('refuses a word that is not an engine, wherever the default is', () => {
    const sup = codexWorkspace();
    expect(sup.engineOffered('gpt-5.6-sol')).toBeNull();
    expect(sup.engineOffered('CODEX')).toBeNull();
    expect(sup.engineOffered({ toString: () => 'codex' })).toBeNull();
  });

  // THE MODEL GOES WITH THE ENGINE, and this is the case the fix could have
  // broken: a filed `null` no longer means "runs on Claude Code", so a rule
  // that read it that way would drop her Codex model off a Codex run.
  it('keeps the model of whichever engine really answers', () => {
    const codex = codexWorkspace();
    expect(codex.modelOffered('codex', 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(codex.modelOffered('claude', 'opus')).toBe('opus');
    expect(claudeWorkspace().modelOffered('claude', 'opus')).toBe('opus');
    // AND STILL DROPS ONE BELONGING TO AN ENGINE THE DOOR JUST REFUSED, which
    // is the whole reason this method exists: the gate is open, Codex is not on
    // this Mac, so the row will run on Claude Code and the slug beside it is
    // the other harness's word.
    expect(build({ engineChoice: OPENED, engine: 'codex' }).modelOffered('codex', 'gpt-5.6-sol')).toBeNull();
    // A word that is not an engine at all has named nothing, so the model rides
    // exactly as it does on the card that sends no engine -- and the run's own
    // cross-harness guard is what refuses a slug the engine cannot use.
    expect(codex.modelOffered('gpt-5.6-sol', 'opus')).toBe('opus');
  });
});

/* ==================== and the row really runs there ====================== */

describe('the engine a row filed that way actually runs on', () => {
  it('is Claude Code for the row that says so, on a Codex workspace', () => {
    expect(codexWorkspace()._engineFor({ id: 'w-1', engine: 'claude' })).toBe('claude');
  });

  // THE CASE THAT MUST NOT MATCH: a row that names nothing still takes the
  // workspace default. Her setting in Settings is not being taken away; it is
  // being stopped from overruling a word she read in the composer.
  it('is still the workspace default for a row that names nothing', () => {
    expect(codexWorkspace()._engineFor({ id: 'w-1' })).toBe('codex');
    expect(codexWorkspace()._engineFor(null)).toBe('codex');
  });

  it('is Claude Code on a Mac that has no Codex, whatever the row says', () => {
    expect(build({ engineChoice: OPENED, engine: 'codex' })._engineFor({ id: 'w-1', engine: 'claude' })).toBe('claude');
  });
});

/* ================= and the card really sends the answer =================== */
// The composer is a React component with no test harness that can press its
// send button, so the payload is asserted as source, the way this suite's other
// compose-payload tests are (tests/the-card-cannot-send-an-engine-this-mac-does-not-offer).

describe('the composer\'s send', () => {
  const compose = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'components', 'Compose.tsx'), 'utf8');

  it('sends the engine whenever there was a choice, rather than dropping a null one', () => {
    expect(compose).toMatch(/engineRows\.length > 1\s*\?\s*\{ engine: engine \?\? DEFAULT_ENGINE \}/);
    // The old line, which is the defect: a null engine sent nothing at all.
    expect(compose).not.toMatch(/\.\.\.\(engine \? \{ engine \} : \{\}\)/);
  });

  it('leaves the decision about whether to write it to the door', () => {
    const ipc = fs.readFileSync(path.join(here, '..', 'main', 'ipc.mjs'), 'utf8');
    expect(ipc).toMatch(/zero:compose[\s\S]{0,900}?engine: supervisor\.engineOffered\(engine\)/);
    expect(ipc).toMatch(/zero:compose-repeat[\s\S]{0,600}?engine: supervisor\.engineOffered\(engine\)/);
  });
});
