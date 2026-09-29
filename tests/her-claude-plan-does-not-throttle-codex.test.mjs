// A SENTENCE ABOUT THE WRONG SUBSCRIPTION, AND A CAP TO MATCH IT.
//
// `readPlans`/`slotsForPlans` (main/claude-plan.mjs) read
// `oauthAccount.organizationRateLimitTier` out of Claude Code's own
// `.claude.json` and, when nobody has set a number, lower
// `config.maxConcurrentSessions` to one for a plan that is not Max. That is
// right, and main/claude-plan.mjs is correctly Claude-only.
//
// WHAT WAS WRONG IS WHERE THE ANSWER WAS APPLIED.
//
// THE WHOLE ARGUMENT THE CAP RESTS ON SAYS IT SHOULD NOT. The cap exists
// because a plan's rate limit is split between whatever is running on it. A
// Codex thread does not touch her Claude plan, so a fact about the Claude plan
// cannot be evidence about how many Codex threads are safe.
//
// SO WHAT DOES A CODEX CAP COME FROM, WITH NO PLAN TIER FOR IT ANYWHERE?
// Nothing here invents one. `~/.codex/auth.json` carries `auth_mode` and an
// opaque `tokens.account_id` and no tier at all (measured on this Mac,
// 2026-09-05, codex-cli 0.148.0), and a number nobody measured, dressed up as
// a Codex plan, would be exactly the authoritative-looking lie this file is
// about. The config already records which of two cases we are in:
//
//   she set the number       -> `planSlotsFrom` is null. It is her instruction
//                               about this Mac, and the stepper she set it on
//                               says "Agents at once", not "Claude agents at
//                               once". It applies to both engines, unchanged.
//
//   a CLAUDE PLAN set it     -> `planSlotsFrom` names the account it came from.
//                               It is a fact about her Anthropic subscription,
//                               so it caps Claude Code and nothing else, and
//                               Codex falls back to `DEFAULT_SESSIONS_AT_ONCE`
//                               -- the number the app has always used when
//                               nobody has said, and the number Codex already
//                               gets today on every Mac whose Claude plan is
//                               Max or unreadable.
//
// The effect is narrow and is the whole ask: a Codex cap that is INDEPENDENT of
// the Claude plan, without a second plan reader and without a new number.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { DEFAULT_SESSIONS_AT_ONCE } from '../main/config.mjs';
import { NAME } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const CODEX_BIN = '/nonexistent/codex/codex';
const OPENED = '2026-09-04T00:00:00Z';

const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };

// A Mac with the gate open and Codex on it, which is the only machine where
// the two caps are both real and can therefore disagree.
const sup = (extra = {}) => new Supervisor(
  {
    home: ONE_ACCOUNT_HOME,
    storeRoot: '/nonexistent-zero-root',
    authProfiles: ['default'],
    codexBin: CODEX_BIN,
    engineChoice: OPENED,
    ...extra,
  },
  emptyStore,
  '/nonexistent-app',
);

// THE NUMBER THE APP HAS ALWAYS USED WHEN NOBODY HAS SAID, read from the one
// place that defines it rather than typed here. A literal would be a second
// copy that could drift from main/config.mjs without a word.
describe('the default this file rests on', () => {
  it('is the one main/config.mjs defines', () => {
    expect(DEFAULT_SESSIONS_AT_ONCE).toBe(3);
  });
});

/* ================== the case, and the two either side =================== */

describe('a claude plan caps claude code and nothing else', () => {
  // HER CASE. A Pro Claude login, nobody set a number, so loadConfig wrote
  // `maxConcurrentSessions: 1` and `planSlotsFrom: 'Pro'`. Claude Code runs one
  // at a time, which is correct and stays. Codex does not.
  it('leaves codex on the app default when a plan lowered the claude number', () => {
    const s = sup({ maxConcurrentSessions: 1, planSlotsFrom: 'Pro' });
    expect(s._capacityFor('claude')).toBe(1);
    expect(s._capacityFor('codex')).toBe(DEFAULT_SESSIONS_AT_ONCE);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the important one: a number SHE
  // typed is not a fact about a subscription, it is an instruction about this
  // Mac, and it must reach both engines. A fix that simply exempted Codex from
  // every low number would go red here.
  it('honours a one she set herself on both engines', () => {
    const s = sup({ maxConcurrentSessions: 1, planSlotsFrom: null });
    expect(s._capacityFor('claude')).toBe(1);
    expect(s._capacityFor('codex')).toBe(1);
  });

  // And upward, so nothing about this is a rule about the number 1.
  it('honours a bigger number she set herself on both engines', () => {
    const s = sup({ maxConcurrentSessions: 5, planSlotsFrom: null });
    expect(s._capacityFor('claude')).toBe(5);
    expect(s._capacityFor('codex')).toBe(5);
  });

  // A MAX PLAN, OR ONE THAT CANNOT BE READ. `slotsForPlans` returns the
  // fallback and `planSlotsFrom` stays null, so nothing here changes anything.
  it('changes nothing when no plan lowered the number', () => {
    const s = sup({ maxConcurrentSessions: 3, planSlotsFrom: null });
    expect(s._capacityFor('claude')).toBe(3);
    expect(s._capacityFor('codex')).toBe(3);
  });
});

/* ================= the claude-only mac is not touched =================== */

describe('a mac with one coding agent', () => {
  // EVERY DOWNLOADED COPY OF AGENTBOX. A Pro plan still means one at a time, and
  // nothing in this slice may soften that: it is what was for.
  it('still runs one at a time on a pro plan', () => {
    const s = sup({ codexBin: null, engineChoice: null, maxConcurrentSessions: 1, planSlotsFrom: 'Pro' });
    expect(s._capacityFor('claude')).toBe(1);
    expect(s._capacity()).toBe(1);
  });

  // AND THE GATE IS STILL WHAT DECIDES, not the plan. Codex installed, moment
  // unwritten: no Codex slots at all, whatever the plan said.
  it('gives codex nothing while the gate is shut, plan or no plan', () => {
    const s = sup({ engineChoice: null, maxConcurrentSessions: 1, planSlotsFrom: 'Pro' });
    expect(s._capacity()).toBe(1);
  });
});

/* ============ the floor that stops a bad config in silence ============== */

describe('an unreadable maxConcurrentSessions still fails to one, on both engines', () => {
  // `zero.config.json` is spread verbatim into config, so this key can be a
  // string, a null or a zero, and `load < capacity` with a NaN is false --
  // NOTHING EVER SPAWNS, with nothing said on any screen. The floor is the
  // whole reason `_slotsPerAccount` exists; adding an engine must not lose it.
  for (const bad of [null, 'three', 0, -2, undefined, NaN]) {
    it(`floors ${String(bad)} at one for claude and for codex`, () => {
      const s = sup({ maxConcurrentSessions: bad, planSlotsFrom: null });
      expect(s._capacityFor('claude')).toBe(1);
      expect(s._capacityFor('codex')).toBe(1);
    });
  }

  // AND A BAD NUMBER IS NOT A PLAN NUMBER. When `planSlotsFrom` is set the
  // Codex side reaches for the app default, and that default has to survive
  // the same floor rather than being handed through unchecked.
  it('gives codex the app default even when the claude number is unreadable', () => {
    const s = sup({ maxConcurrentSessions: 'three', planSlotsFrom: 'Pro' });
    expect(s._capacityFor('claude')).toBe(1);
    expect(s._capacityFor('codex')).toBe(DEFAULT_SESSIONS_AT_ONCE);
  });
});

/* ============= and the sentence stops explaining the wrong one ========== */

describe('the settings sentence about her plan', () => {
  const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

  // THE SENTENCE ITSELF, NOT A SUBSTRING OF THE FILE. The "Agents at once" row
  // builds its `desc` as one template literal, so it can be lifted out and run
  // against a payload -- which is the only way to assert what she actually
  // reads. A `toContain` over source would pass on a sentence that is never
  // reachable, which is the shape of defect this whole slice is about.
  const template = (() => {
    const at = settings.indexOf('desc={`', settings.indexOf('label="Agents at once"'));
    const start = at + 'desc={`'.length;
    // The closing backtick of the template, which is followed by `}`.
    const end = settings.indexOf('`}', start);
    return settings.slice(start, end);
  })();
  /*
   * AND THE ENGINE COUNT IS LIFTED OUT OF THE FILE TOO, on the same terms and
     for the same reason (2026-09-05). This sentence read `(w.engineChoices?.length
     ?? 1) > 1` inline until the Permissions slice found Settings.tsx asking that
     one question three different ways across two panes four hundred lines apart,
     and converged them on `engineRows` / `twoEngines`. Handing this template a
     `twoEngines` computed HERE would turn a test of the real rule into a test of
     a copy of it, which is the class of defect the convergence was fixing, so
     the two lines the component derives it from are read off the source and run
     in front of the template. It is stronger than it was: it now proves the
     derivation and the sentence together. */
  const derivation = (() => {
    const at = settings.indexOf('const engineRows = ');
    const end = settings.indexOf('\n', settings.indexOf('const twoEngines = '));
    expect(at).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(at);
    return settings.slice(at, end);
  })();
  // THE APP'S NAME GOES IN WITH IT, because the sentence reads it out of
  // shared/product-name.mjs rather than spelling it, and a template lifted out
  // of the file and run here has nothing else in scope.
  // eslint-disable-next-line no-new-func
  const say = (w) => new Function('w', 'NAME', `${derivation}\nreturn \`${template}\`;`)(w, NAME);

  const pro = { sessionsAtOnceFromPlan: 'Pro', sessionsAtOnce: 1, accounts: [{}] };

  // A MAC WITH ONE CODING AGENT READS EXACTLY WHAT IT READ BEFORE, to the
  // character. Only one engine is true of that Mac, and naming an engine on it
  // would be a word
  // about software she does not have.
  it('keeps its old words where there is only one coding agent', () => {
    expect(say({ ...pro, engineChoices: [{ id: 'claude' }] })).toBe(
      `Your plan is Pro, so ${NAME} starts one at a time. Put it up whenever you like. The rest wait in line.`,
    );
  });

  // AND WHERE THE PAYLOAD PREDATES THE ENGINE LIST ENTIRELY. A renderer left
  // open across a config change is the case `engineOffered` already guards at
  // the door; here it must not make the sentence read as a two-engine Mac.
  it('keeps its old words when the payload names no engines at all', () => {
    expect(say(pro)).toContain(`so ${NAME} starts one at a time`);
  });

  // AND NAMES THE ENGINE WHERE THERE ARE TWO, because there the unqualified
  // sentence is false: the app starts one Claude Code agent at a time and three
  // Codex ones, under a line that has just said there is room for four.
  it('names claude code where there are two, so it cannot explain a codex cap', () => {
    expect(say({ ...pro, engineChoices: [{ id: 'claude' }, { id: 'codex' }] })).toBe(
      `Your plan is Pro, so ${NAME} starts one Claude Code agent at a time. Put it up whenever you like. The rest wait in line.`,
    );
  });

  // THE CASE THAT MUST NOT MATCH: nobody's plan set the number, so there is no
  // plan sentence to qualify and a second engine adds nothing to this row.
  it('says nothing about a plan or an engine when she set the number herself', () => {
    expect(say({ sessionsAtOnceFromPlan: null, sessionsAtOnce: 3, accounts: [{}], engineChoices: [{ id: 'claude' }, { id: 'codex' }] }))
      .toBe('Up to 3 run together. The rest wait in line.');
  });
});
