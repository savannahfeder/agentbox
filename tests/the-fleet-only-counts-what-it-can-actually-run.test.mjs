// THE FLEET ONLY COUNTS WHAT IT CAN ACTUALLY RUN.
//
// Three defects in the per-engine capacity arithmetic, all found by an
// adversarial pass over the slice that introduced it. They are one file because
// they are one question asked three ways: is the number a spawn is measured
// against a number of things that could really start?
//
// 1. A QUARANTINED ACCOUNT WENT STRAIGHT BACK INTO ROTATION.
//
// `_liveProfilesFor` ended `return live.length ? live: ['default']`. That
// fallback is right for PICKING -- somewhere has to be tried -- and wrong for
// COUNTING, and the same method was doing both. With two Claude logins it hid
// at worst half the truth. With Codex's SINGLE login it inverted the whole
// mechanism: quarantining the one account it has put that same account back in
// the pool on the very next line, so a login that had run out was struck,
// cooled down, and then handed the next spawn anyway. The cooldown is the only
// thing keeping a dead Codex account out of her work, and it was a no-op on the
// engine it matters most for.
//
// 2. THE AGGREGATE CEILING WAS REMOVED AS UNREACHABLE, AND IT IS REACHABLE.
//
// `_hasSlotFor` used to read `_loadFor(e) < _capacityFor(e) && _load <
// _capacity`, and the second conjunct was deleted with a comment arguing that
// the sum of the per-engine caps cannot be exceeded by the sum of the
// per-engine loads. That is true only while CAPACITY IS CONSTANT. It is not: a
// profile entering cooldown shrinks `_capacityFor` for its engine while the
// sessions already running on the OTHER engine stay live. Then the total load
// is above the new total capacity, the other engine is still under its own cap,
// and one more session starts on a Mac that is already over the ceiling
// `_capacity` reports to her screen. A conjunct no mutation can break is a
// claim the code is not making; this one a mutation breaks, so the code has to
// make it.
//
// 3. A CLAUDE FAILURE STOPPED CODEX FOR HALF AN HOUR.
//
//    `_tick` returns at its second line while `_spawnCooldownUntil` is in the
//    future, and that brake is armed only by a FAST CLAUDE EXIT with no healthy
//    Claude account left. The comment above it says the brake means "nowhere
//    left to run", which is a sentence about Claude Code: a Codex row runs on a
//    different subscription and a different binary. So a signed-out Claude
//    login starved a working Codex account for up to thirty minutes, which is
//    the 2026-08-24 mistake (a fact about one account applied to another) with
//    a second engine standing in for the second login.
//
// AND ONE MORE THE SAME PASS FOUND, WHICH IS THE QUIETEST OF THE FOUR: a
// malformed `maxConcurrentSessions` used to fail SAFE and now fails STOPPED.
// The test was `load >= capacity`, so a NaN was false and the spawn went ahead;
// it is `load < capacity` now, so a NaN is false and NOTHING EVER SPAWNS, with
// nothing said anywhere. `zero.config.json` is spread verbatim into config, so
// `"maxConcurrentSessions": null` is the whole of what it takes.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const CODEX_BIN = '/nonexistent/codex/codex';
const HER_SECOND_CLAUDE = '/Users/her/.claude-second';
const NOW = 1_756_000_000_000;

const store = (items = [], products = []) => ({
  listItems: () => items,
  listProducts: () => products,
  isDue: () => true,
  settleAnswer() {},
  recordSessionResult() {},
});

const hers = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 5, answer: undefined, createdAt: NOW, updatedAt: NOW,
  claim: null, claimExpired: false, ...extra,
});

let sup; let spawned;

const build = (items = [], {
  slots = 3, codexBin = CODEX_BIN, authProfiles = ['default'], codexProfiles = undefined, config = {},
} = {}) => {
  sup = new Supervisor(
    {
      home: ONE_ACCOUNT_HOME,
      storeRoot: '/nonexistent-zero-root',
      maxConcurrentSessions: slots,
      authProfiles,
      codexBin,
      // THE MOMENT SHE OPENED THE GATE. The `_engineFor` override below says
      // which engine a row runs on; this says the second engine may be run at
      // all, which is the fact `_capacityFor` asks (via `engineChoices`) before
      // it gives Codex a single slot. Opening one and not the other describes a
      // Mac that cannot exist: in the app both come off this same value.
      engineChoice: '2026-09-04T00:00:00Z',
      ...(codexProfiles ? { codexProfiles } : {}),
      ...config,
    },
    store(items, [{ slug: 'agentbox', dir: '/nonexistent-zero-root', repoPath: null }]),
    '/nonexistent-app',
  );
  sup._engineFor = (item) => (item?.engine === 'codex' ? 'codex' : 'claude');
  spawned = [];
  sup.spawnWorker = (item) => {
    spawned.push(item.id);
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, engine: sup._engineFor(item) });
  };
  return sup;
};

const fill = (n, engine) => {
  for (let i = 0; i < n; i += 1) {
    const id = `w-busy-${engine}-${i}`;
    sup.sessions.set(id, { itemId: id, product: 'agentbox', engine, child: { kill() {} } });
  }
};

/** Put one account out of the rotation, through the same key the fleet uses. */
const quarantine = (engine, profile = 'default') => {
  sup._profileCooldown = sup._profileCooldown ?? {};
  sup._profileCooldown[sup._accountKey(engine, profile)] = Date.now() + 30 * 60_000;
};

beforeEach(() => { build([]); });

/* ============= 1. a quarantined account is out, not back in ============== */

describe('an account that is resting', () => {
  it('leaves the pool that capacity is counted from', () => {
    quarantine('codex');
    expect(sup._liveProfilesFor('codex')).toEqual([]);
  });

  it('takes her codex capacity to nothing, so nothing starts on it', () => {
    quarantine('codex');
    expect(sup._capacityFor('codex')).toBe(0);
    expect(sup._hasSlotFor('codex')).toBe(false);
  });

  // HER SENTENCE, THE WHOLE WAY THROUGH THE QUEUE. A Codex row filed while the
  // one Codex login is quarantined waits for the cooldown rather than being
  // handed straight back to the account that just failed.
  it('does not hand the next codex row to the login that just ran out', async () => {
    build([hers('w-250cd74811', { engine: 'codex' })]);
    quarantine('codex');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // THE CASE THAT MUST NOT MATCH, and it is why the fallback was there. PICKING
  // still has to answer something: a continuation bypasses the slot check, and
  // a pick with nowhere to go must not be undefined.
  it('is still what a pick falls back to, because a pick must answer something', () => {
    quarantine('codex');
    expect(sup._pickProfile('codex')).toBe('default');
  });

  // AND THE BOUNDARY EITHER SIDE on her two Claude logins: one resting leaves
  // the other, and only both resting empties the pool.
  it('leaves her other claude login counted when only one is resting', () => {
    build([], { authProfiles: ['default', HER_SECOND_CLAUDE] });
    quarantine('claude', HER_SECOND_CLAUDE);
    expect(sup._liveProfilesFor('claude')).toEqual(['default']);
    expect(sup._capacityFor('claude')).toBe(3);
  });

  it('empties the pool only when every one of them is resting', () => {
    build([], { authProfiles: ['default', HER_SECOND_CLAUDE] });
    quarantine('claude', 'default');
    quarantine('claude', HER_SECOND_CLAUDE);
    expect(sup._liveProfilesFor('claude')).toEqual([]);
  });
});

/* ============ 2. the mac's ceiling, which really can be crossed ========== */

describe('the whole-Mac ceiling when capacity shrinks under live sessions', () => {
  // The exact shape the removed conjunct was called unreachable for.
  // 2 Claude logins x 3 = 6, Codex 1 x 3 = 3, nine on the Mac. Four Claude and
  // three Codex sessions are up, seven of nine. The Codex login is quarantined:
  // Codex capacity falls to 0 and the Mac's ceiling with it, to six -- but the
  // three Codex threads it was counting are STILL RUNNING. Load seven, ceiling
  // six, and Claude is under its own cap of six with four.
  const overTheCeiling = () => {
    build([], { authProfiles: ['default', HER_SECOND_CLAUDE], slots: 3 });
    fill(4, 'claude');
    fill(3, 'codex');
    quarantine('codex');
  };

  it('is really crossed by a cooldown, so this is not a hypothetical', () => {
    overTheCeiling();
    expect(sup._load()).toBe(7);
    expect(sup._capacity()).toBe(6);
    // And the per-engine test on its own would say yes.
    expect(sup._loadFor('claude')).toBeLessThan(sup._capacityFor('claude'));
  });

  it('refuses one more session even though its own engine is under its cap', () => {
    overTheCeiling();
    expect(sup._hasSlotFor('claude')).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH. An ordinary Mac under both numbers still
  // starts things, or this conjunct would be a fleet that never runs.
  it('still admits a session when the Mac is under both numbers', () => {
    build([], { authProfiles: ['default', HER_SECOND_CLAUDE], slots: 3 });
    fill(2, 'claude');
    fill(1, 'codex');
    expect(sup._hasSlotFor('claude')).toBe(true);
    expect(sup._hasSlotFor('codex')).toBe(true);
  });
});

/* ============== 3. the claude brake stops claude, and only it ============ */

describe('the fleet-wide brake a claude failure arms', () => {
  const braked = () => { sup._spawnCooldownUntil = Date.now() + 10 * 60_000; };

  it('stops claude spawning, which is what it is for', () => {
    braked();
    expect(sup._hasSlotFor('claude')).toBe(false);
  });

  it('leaves codex alone, because a codex row runs on the other subscription', () => {
    braked();
    expect(sup._hasSlotFor('codex')).toBe(true);
  });

  it('lets a codex row start while her claude fleet is braked', async () => {
    build([hers('w-250cd74811', { engine: 'codex' }), hers('w-claude-work')]);
    braked();
    await sup.tick();
    expect(spawned).toEqual(['w-250cd74811']);
  });

  // THE CASE THAT MUST NOT MATCH, and it is most installs: with no Codex on the
  // Mac the brake behaves exactly as it did, right down to the early return.
  it('still stops the whole pass when there is no other engine to run on', async () => {
    build([hers('w-claude-work')], { codexBin: null });
    braked();
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // AND THE BRAKE STILL LIFTS. It is a clock, not a state.
  it('is over the moment its clock is', () => {
    sup._spawnCooldownUntil = Date.now() - 1;
    expect(sup._hasSlotFor('claude')).toBe(true);
  });
});

/* ================= and a cap nobody can read is a cap of one ============= */

describe('a maxConcurrentSessions that is not a number', () => {
  it.each([
    ['null, which zero.config.json can hold', null],
    ['a word', 'three'],
    ['zero', 0],
    ['negative', -4],
    ['a fraction below one', 0.5],
  ])('degrades to one slot rather than to none, for %s', (_what, slots) => {
    build([], { slots });
    expect(sup._capacityFor('claude')).toBe(1);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('never silently stops the whole fleet', async () => {
    build([hers('w-claude-work')], { slots: null });
    await sup.tick();
    expect(spawned).toEqual(['w-claude-work']);
  });

  // THE CASE THAT MUST NOT MATCH: a real number is her number and is untouched.
  it('leaves a real number exactly as she set it', () => {
    build([], { slots: 4 });
    expect(sup._capacityFor('claude')).toBe(4);
  });
});
