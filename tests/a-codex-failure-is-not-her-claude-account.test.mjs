// A DEAD CODEX SESSION MUST NOT QUARANTINE HER CLAUDE SUBSCRIPTION.
//
// The bug this is a rerun of is, 2026-08-24: her second Claude subscription was
// signed out, half of every spawn round-robined onto it and died in two
// seconds, and the screen reported an account-shaped fact as an app-shaped one.
// Five dead spawns between 17:39 and 19:08, each one halting the account that
// was working. The fix was one sentence — A FACT ABOUT ONE ACCOUNT STAYS ON
// THAT ACCOUNT — and a second engine reintroduces it for free, because BOTH
// ENGINES CALL THEIR PRIMARY LOGIN 'default' and the cooldown, strike and
// trouble maps are keyed on that name.
//
// Two hazards, and hers is exactly the shape that hits both: one Claude
// subscription plus one Codex login, both called 'default'.
//
//   WRONG QUARANTINE. A Codex session dying on `_profileCooldown['default']`
//   takes her WORKING Claude subscription out of the rotation for thirty
//   minutes over a failure in the other engine.
//
//   WRONG HOME. Every entry in `authProfiles` is a CLAUDE_CONFIG_DIR: a folder
//   holding a Claude login and no `auth.json` Codex could read. Picking one for
//   a Codex worker points it at a stranger's folder.
//
// WHAT WAS ALREADY HERE AND IS NOT UNDONE. An earlier slice made
// `noteExitForBackoff` return before any of this for a Codex session, so a
// Codex failure could not arm the fleet-wide spawn brake. That was the right
// call and the brake half of it is unchanged and asserted below; what it left
// open is that Codex then had NO account health at all — no strikes, no
// cooldown, no recovery — so a Codex login that had run out was hammered by
// every tick with nothing keeping track. This file pins both halves: Codex
// keeps its own books, and its books are not her Claude account's.

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

// The bookkeeping this file is about lives on the instance and needs no store,
// no config file and no spawning. Built bare on purpose: a test that has to
// boot a fleet to ask one question stops being run.
//
// `home` IS EMPTY ON PURPOSE AND IT IS NOT DECORATION. `_profiles` runs the
// configured list through `effectiveProfiles`, which scans the home directory
// for Claude logins it was not told about and appends them. Left at the real
// one, these tests read whoever is running them: on a Mac with a `~/.claude`
// login the pool gains a second entry, the round robin lands on it, and the
// single-account cases below fail. Measured 2026-09-09, green on a machine
// with no `~/.claude` and red on the founder's.
const EMPTY_HOME = mkdtempSync(join(tmpdir(), 'codex-no-home-'));

function bare(config = {}) {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: [], maxConcurrentSessions: 3, home: EMPTY_HOME, ...config };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

const dead = (engine, tail) => ({
  engine, profile: 'default', startedAt: Date.now(), tail: [`stderr: ${tail}`],
});

describe('a codex session runs on a codex home, never a claude one', () => {
  it('never hands her claude account folders to codex', () => {
    const s = bare({ authProfiles: ['default', '/Users/her/.claude-second'] });
    // Ten picks, so a round robin cannot pass this by luck.
    const picked = new Set();
    for (let i = 0; i < 10; i += 1) picked.add(s._pickProfile('codex'));
    expect([...picked]).toEqual(['default']);
    expect(picked.has('/Users/her/.claude-second')).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH: Claude Code still round-robins across both of
  // her subscriptions, which is what roughly doubles her throughput. A fix that
  // pinned everything to 'default' would pass the test above and cost her half
  // her fleet.
  it('still round-robins claude code across both of her subscriptions', () => {
    const s = bare({ authProfiles: ['default', '/Users/her/.claude-second'] });
    const picked = new Set();
    for (let i = 0; i < 10; i += 1) picked.add(s._pickProfile('claude'));
    expect(picked).toEqual(new Set(['default', '/Users/her/.claude-second']));
  });

  // The default, so a caller that names no engine is answered about the engine
  // it is actually going to spawn.
  it('answers a claude account when nobody names an engine', () => {
    const s = bare({ authProfiles: ['/Users/her/.claude-second'] });
    expect(s._pickProfile()).toBe('/Users/her/.claude-second');
  });

  // Not needed yet — she has one Codex login — and read here so that a second
  // one is a config key rather than a change to the method.
  it('would use a second codex login if she ever had one', () => {
    const s = bare({ codexProfiles: ['default', '/Users/her/.codex-second'] });
    const picked = new Set();
    for (let i = 0; i < 10; i += 1) picked.add(s._pickProfile('codex'));
    expect(picked).toEqual(new Set(['default', '/Users/her/.codex-second']));
  });

  // A quarantined Codex login leaves the Codex rotation, exactly as a
  // quarantined Claude one leaves Claude's, and the OTHER engine's rotation is
  // untouched by it.
  it('keeps a resting codex login out of the codex rotation only', () => {
    const s = bare({
      authProfiles: ['default', '/Users/her/.claude-second'],
      codexProfiles: ['default', '/Users/her/.codex-second'],
    });
    s._profileCooldown['codex:default'] = Date.now() + 60_000;
    const codex = new Set();
    for (let i = 0; i < 10; i += 1) codex.add(s._pickProfile('codex'));
    expect(codex).toEqual(new Set(['/Users/her/.codex-second']));
    const claude = new Set();
    for (let i = 0; i < 10; i += 1) claude.add(s._pickProfile('claude'));
    expect(claude).toEqual(new Set(['default', '/Users/her/.claude-second']));
  });
});

/* ============ the same rule, observed at a real spawn ==================== */

describe('a real codex spawn bills a codex home', () => {
  const dirs = [];
  afterAll(() => {
    for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
    try { rmSync(EMPTY_HOME, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  // WHERE THE PICK ACTUALLY HAPPENS. Everything above asks `_pickProfile`
  // directly; this asks the line in `spawnWorker` that calls it, which is the
  // line that would go on handing Codex a Claude folder if the engine were
  // dropped on the way. `_spawnCodexWorker` is stubbed so no transport runs:
  // the session is recorded synchronously, and its `profile` is the whole
  // question.
  it('never records one of her claude config folders on a codex session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-account-'));
    dirs.push(dir);
    const product = { slug: 'agentbox', dir, repoPath: null };
    const sup = new Supervisor(
      {
        home: '/nonexistent-home-with-no-second-account',
        storeRoot: dir,
        claudeBin: '/nonexistent/claude-code/claude',
        codexBin: '/nonexistent/codex/codex',
        // THE MOMENT SHE OPENED THE GATE. The `_engineFor` override below says
        // which engine a row runs on; this says the second engine may be run at
        // all, which is the fact `_capacityFor` asks (via `engineChoices`) before
        // it gives Codex a single slot. Opening one and not the other describes a
        // Mac that cannot exist: in the app both come off this same value.
        engineChoice: '2026-09-04T00:00:00Z',
        maxConcurrentSessions: 4,
        // BOTH of her Claude logins, so a pick that reached the wrong pool has
        // somewhere wrong to land and cannot pass by luck.
        authProfiles: ['default', '/Users/her/.claude-second'],
      },
      {
        listItems: () => [],
        listProducts: () => [product],
        isDue: () => true,
        settleAnswer() {},
        recordSessionResult() {},
      },
      '/nonexistent-app',
    );
    sup._engineFor = () => 'codex';
    sup._spawnCodexWorker = () => ({ stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} });

    const seen = new Set();
    for (let i = 0; i < 6; i += 1) {
      const id = `w-codex-${i}`;
      sup.spawnWorker({ id, product: 'agentbox', title: 'try the second engine', status: 'open' });
      seen.add(sup.sessions.get(id).profile);
      sup.sessions.delete(id);
    }
    expect([...seen]).toEqual(['default']);
    expect(seen.has('/Users/her/.claude-second')).toBe(false);
  });
});

describe('a fact about codex stays on codex', () => {
  it('keeps the two default folders apart in the bookkeeping', () => {
    const s = bare();
    expect(s._accountKey('claude', 'default')).toBe('default');
    expect(s._accountKey('codex', 'default')).toBe('codex:default');
    expect(s._accountKey('codex', 'default')).not.toBe(s._accountKey('claude', 'default'));
    // A record written before the second engine existed carries no engine and
    // was Claude Code's. Keying it as anything else would strand it.
    expect(s._accountKey(undefined, 'default')).toBe('default');
  });

  // THE WHOLE POINT. A Codex login that has run out must not take her working
  // Claude subscription out of the rotation for half an hour.
  it('does not quarantine her claude account when a codex spawn dies', () => {
    const s = bare({ authProfiles: ['default'] });
    s.noteExitForBackoff(dead('codex', 'not logged in'), { onLine: () => {} });

    expect(s._profileCooldown['codex:default'] ?? 0).toBeGreaterThan(Date.now());
    expect(s._profileCooldown.default ?? 0).toBe(0);
    expect(s._profileTrouble.default).toBeUndefined();
    // And her Claude account is still one she can run work on.
    expect(s._healthyProfiles()).toContain('default');
  });

  // AND VICE VERSA, which is the direction the earlier slice's early return
  // could not answer: a dead Claude session leaves the Codex books alone.
  it('does not quarantine her codex login when a claude spawn dies', () => {
    const s = bare({ authProfiles: ['default'] });
    s.noteExitForBackoff(dead('claude', 'Invalid API key · Please run /login'), { onLine: () => {} });

    expect(s._profileCooldown.default ?? 0).toBeGreaterThan(Date.now());
    expect(s._profileCooldown['codex:default'] ?? 0).toBe(0);
    expect(s._profileTrouble['codex:default']).toBeUndefined();
    expect(s._profileStrikes['codex:default'] ?? 0).toBe(0);
  });

  // Codex gets the SAME ambiguous-death ladder Claude has: three strikes, then
  // a rest. Two is not a quarantine, because the next spawn might well work.
  it('gives codex its own three-strike ladder', () => {
    const s = bare({ authProfiles: ['default'] });
    for (let i = 0; i < 2; i += 1) s.noteExitForBackoff(dead('codex', 'broke'), { onLine: () => {} });
    expect(s._profileStrikes['codex:default']).toBe(2);
    expect(s._profileCooldown['codex:default'] ?? 0).toBe(0);

    s.noteExitForBackoff(dead('codex', 'broke'), { onLine: () => {} });
    expect(s._profileCooldown['codex:default'] ?? 0).toBeGreaterThan(Date.now());
    // Her Claude account never earned a single one of those.
    expect(s._profileStrikes.default ?? 0).toBe(0);
  });

  // Recovery, and it is per engine too: a Codex session that survives clears
  // Codex's books and touches nothing of her Claude account's.
  it('clears codex trouble when a codex session survives, and only codex', () => {
    const s = bare({ authProfiles: ['default'] });
    s._profileTrouble = { default: { cause: 'signed-out', since: 1, at: 1 }, 'codex:default': { cause: 'signed-out', since: 1, at: 1 } };
    s._profileStrikes = { default: 2, 'codex:default': 2 };
    s._profileCooldown = { default: Date.now() + 60_000, 'codex:default': Date.now() + 60_000 };

    // A long, ordinary run: nothing about it is a fast exit.
    s.noteExitForBackoff(
      { engine: 'codex', profile: 'default', startedAt: Date.now() - 60 * 60_000, tail: [] },
      { onLine: () => {} },
    );

    expect(s._profileTrouble['codex:default']).toBeUndefined();
    expect(s._profileStrikes['codex:default']).toBe(0);
    expect(s._profileTrouble.default).toBeDefined();
    expect(s._profileCooldown.default).toBeGreaterThan(Date.now());
  });

  // THE OTHER DIRECTION OF THE SAME RULE, and it is the one moving the strike
  // ladder onto Codex could have broken. A Codex thread running happily for an
  // hour is not evidence that her CLAUDE subscription came back, so it must not
  // lift a brake the Claude fleet earned: doing so would put the fleet straight
  // back into the hammer the brake exists to stop, once per surviving Codex run.
  it('does not lift her claude fleet\'s brake because a codex run survived', () => {
    const s = bare({ authProfiles: ['default'] });
    s._spawnCooldownUntil = Date.now() + 10 * 60_000;
    s._fastExits = 4;
    s._fleetTroubleSince = 1;
    s._lastFastExit = { at: 1, cause: 'signed-out', raw: 'not logged in' };

    s.noteExitForBackoff(
      { engine: 'codex', profile: 'default', startedAt: Date.now() - 60 * 60_000, tail: [] },
      { onLine: () => {} },
    );
    expect(s._spawnCooldownUntil).toBeGreaterThan(Date.now());
    expect(s._fastExits).toBe(4);

    // THE CASE THAT MUST NOT MATCH: a surviving CLAUDE session does lift it,
    // which is the behaviour that gets the fleet going again after an outage.
    s.noteExitForBackoff(
      { engine: 'claude', profile: 'default', startedAt: Date.now() - 60 * 60_000, tail: [] },
      { onLine: () => {} },
    );
    expect(s._spawnCooldownUntil).toBe(0);
    expect(s._fastExits).toBe(0);
    expect(s._lastFastExit).toBe(null);
  });

  // The fleet-wide brake means "nowhere left to run", and Claude Code is what
  // everything falls back to. An unhappy second engine slows nothing down. This
  // is the half the earlier slice already bought and it stays bought.
  it('does not put the brake on the whole fleet because codex is unhappy', () => {
    const s = bare({ authProfiles: ['default'] });
    for (let i = 0; i < 5; i += 1) s.noteExitForBackoff(dead('codex', 'broke'), { onLine: () => {} });
    expect(s._spawnCooldownUntil ?? 0).toBe(0);
    expect(s._fastExits ?? 0).toBe(0);
  });

  // THE TWO CASES WHERE THE KEY ALONE IS NOT ENOUGH, and they are the ones that
  // would actually reach her. Keying the strike as `codex:default` keeps her
  // Claude account out of `_healthyProfiles`'s answer, so a Codex death on an
  // otherwise healthy Mac walks into the "her account is fine" branch. Both of
  // these are about what that branch and the one beside it would then DO to a
  // brake the Claude fleet already owns.
  it('neither lifts nor deepens a brake her claude fleet already owns', () => {
    // ONE: her Claude account is fine, the fleet is braked from earlier, and a
    // Codex spawn dies on arrival. Without the guard this reads as "her account
    // is fine and it stays fine" and CLEARS the brake — a Codex failure would
    // release a cooldown Claude Code earned, once per dead Codex spawn.
    const fine = bare({ authProfiles: ['default'] });
    fine._spawnCooldownUntil = Date.now() + 10 * 60_000;
    fine._fastExits = 4;
    fine.noteExitForBackoff(dead('codex', 'broke'), { onLine: () => {} });
    expect(fine._spawnCooldownUntil).toBeGreaterThan(Date.now());
    expect(fine._fastExits).toBe(4);

    // TWO: her only Claude subscription is already in trouble, so there IS
    // nowhere left to run and the brake is armed. Without the guard every dead
    // Codex spawn doubles it, so when her Claude login comes back the fleet
    // stays stopped for up to thirty minutes over a failure in the other
    // engine. That is the 2026-08-24 incident exactly.
    const out = bare({ authProfiles: ['default'] });
    out._profileTrouble = { default: { cause: 'signed-out', since: 1, at: 1 } };
    expect(out._healthyProfiles()).toEqual([]);
    for (let i = 0; i < 5; i += 1) out.noteExitForBackoff(dead('codex', 'broke'), { onLine: () => {} });
    expect(out._spawnCooldownUntil ?? 0).toBe(0);
    expect(out._fastExits ?? 0).toBe(0);

    // THE CASE THAT MUST NOT MATCH: on the same nowhere-left-to-run Mac, a dead
    // CLAUDE spawn does arm it, which is the thing that stops one outage
    // becoming a hammer.
    out.noteExitForBackoff(dead('claude', 'broke'), { onLine: () => {} });
    expect(out._spawnCooldownUntil).toBeGreaterThan(Date.now());
    expect(out._fastExits).toBe(1);
  });

  // THE CASE THAT MUST NOT MATCH: the original behaviour is untouched. A Claude
  // account with no healthy sibling still earns the brake, which is the thing
  // that stops one outage becoming a hammer.
  it('still brakes when there is no healthy claude account left', () => {
    const s = bare({ authProfiles: ['default'] });
    s.noteExitForBackoff(dead('claude', 'Invalid API key · Please run /login'), { onLine: () => {} });
    expect(s._profileCooldown.default ?? 0).toBeGreaterThan(Date.now());
    expect(s._spawnCooldownUntil ?? 0).toBeGreaterThan(Date.now());
  });

  // A kill of ours is not evidence about any account, on either engine.
  it('charges a session we killed to nobody', () => {
    const s = bare({ authProfiles: ['default'] });
    s.noteExitForBackoff({ ...dead('codex', 'broke'), stoppedByUs: true }, { onLine: () => {} });
    expect(s._profileStrikes['codex:default'] ?? 0).toBe(0);
    expect(s._profileCooldown['codex:default'] ?? 0).toBe(0);
  });
});

describe('a resting account cannot be resumed onto, whichever engine it is', () => {
  it('reads the codex cooldown for a codex session and the claude one for a claude session', () => {
    const s = bare({ authProfiles: ['default'] });
    s._profileCooldown['codex:default'] = Date.now() + 60_000;

    expect(s._profileResting(s._accountKey('codex', 'default'))).toBe(true);
    expect(s._profileResting(s._accountKey('claude', 'default'))).toBe(false);
    // And a record from before the second engine existed is a Claude one.
    expect(s._profileResting(s._accountKey(undefined, 'default'))).toBe(false);
  });
});
