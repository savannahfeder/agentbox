// CAPACITY IS PER SUBSCRIPTION, NOT PER MAC.
//
// IT DID NOT. There was one number for the whole machine —
// `maxConcurrentSessions * this._liveProfiles.length`, and `_liveProfiles` is
// the CLAUDE auth-profile pool — so a Codex task queued behind three Claude
// workers while her OpenAI subscription sat idle, and logging into Codex could
// never widen anything, because the multiplier counted Claude logins.
//
// Two subscriptions are two rate limits. The number that matters to a Codex
// worker is how many Codex threads are running, and the number that matters to
// a Claude worker is how many Claude sessions are running. So there are two
// caps now, and the whole-Mac ceiling is those two added together: the machine
// is still one machine, and 3 Claude + 3 Codex is six sessions, not unlimited.
//
// THE TRAP THIS FILE EXISTS TO CATCH is not the arithmetic, it is the queue.
// The spawn loop does not SKIP a row it cannot fit, it BREAKS out of the scan —
// which was correct while there was one cap, because nothing further down could
// fit either. With per-engine caps that break is a starvation bug: a Codex row
// sitting behind three unfittable Claude rows is never reached at all, and her
// Codex subscription goes on doing nothing with a Codex task in the queue. It
// is the same shape as the bug the slash-command sort-to-front was written for
// (tests/a-command-does-not-wait-for-a-slot.test.mjs measured it as "the cap
// does not skip a row it cannot fit, it BREAKS"), and the deleted 2026-08-25
// build shipped with it. `runs the row behind three it cannot fit` below is
// that case, and it is the one that goes red if anyone puts the break back.
//
// THE GATE IS STILL SHUT. `_engineFor` answers Claude Code for every row on
// every machine, so the only honest way to put a Codex row through the real
// queue is to override that one method on one instance — the same seam
// tests/the-supervisor-can-run-a-codex-worker-and-still-routes-nothing-to-it
// uses, and for the same reason: it overrides exactly the decision and nothing
// else. The last block asserts the gate on an untouched supervisor.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk as well as what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity every number
// here is about. A home with nothing in it is the machine these tests mean.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const CODEX_BIN = '/nonexistent/codex/codex';
// One of her CLAUDE_CONFIG_DIR folders: a Claude login lives here and no Codex
// auth ever will. Handing this to a Codex worker is the "wrong home" half of
// tests/a-codex-failure-is-not-her-claude-account.test.mjs.
const HER_SECOND_CLAUDE = '/Users/her/.claude-second';

const NOW = 1_756_000_000_000; // 2026-08-24, the week she asked

const store = (items, products = []) => ({
  listItems: () => items,
  listProducts: () => products,
  isDue: () => true,
  settleAnswer() {},
});

// Her own fresh task: the 'founder' label is what compose stamps.
const hers = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 5, answer: undefined, createdAt: NOW, updatedAt: NOW,
  claim: null, claimExpired: false, ...extra,
});

// A card she has answered. The answer is the continuation's whole reason to run.
const answered = (id, answer, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'question', labels: ['founder'],
  priority: 5, answer, createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

let sup; let spawned;

const build = (items, {
  slots = 3, codexBin = CODEX_BIN, authProfiles = ['default'], codexProfiles = undefined,
  products = [], config = {},
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
    store(items, products),
    '/nonexistent-app',
  );
  // THE ONE LINE IN THIS FILE THAT PRETENDS THE GATE IS OPEN. See the header.
  sup._engineFor = (item) => (item?.engine === 'codex' ? 'codex' : 'claude');
  spawned = [];
  sup.spawnWorker = (item) => {
    spawned.push(item.id);
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, engine: sup._engineFor(item) });
  };
  return sup;
};

// Workers already up on other rows, filling one engine's fleet. `command`
// absent is what an ordinary session looks like.
const fill = (n, engine, product = 'agentbox') => {
  for (let i = 0; i < n; i += 1) {
    const id = `w-busy-${engine}-${i}`;
    sup.sessions.set(id, { itemId: id, product, engine, child: { kill() {} } });
  }
};

beforeEach(() => { build([]); });

/* ================= her case, and the two caps either side ================= */

describe('a codex task against a full claude fleet', () => {
  // HER SENTENCE, at her numbers. Three Claude workers, max three, a Codex task
  // filed on a fourth row. Before this it spawned nothing and her second
  // subscription sat idle.
  it('runs immediately, because her codex capacity is not hit', async () => {
    build([hers('w-250cd74811', { engine: 'codex' })], { slots: 3 });
    fill(3, 'claude');
    await sup.tick();
    expect(spawned).toEqual(['w-250cd74811']);
  });

  // THE BOUNDARY ON ONE SIDE. The Claude cap is still real: a Claude row does
  // NOT get to start just because Codex is idle. This is the half that would
  // break if per-engine had been done by widening one number.
  it('still makes a claude task wait when the claude fleet is full', async () => {
    build([hers('w-claude-work')], { slots: 3 });
    fill(3, 'claude');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // THE BOUNDARY ON THE OTHER SIDE. Codex has a cap of its own and it holds:
  // a fourth Codex row waits behind three Codex threads.
  it('makes a codex task wait when the codex fleet is full', async () => {
    build([hers('w-codex-fourth', { engine: 'codex' })], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // And the mirror of her case, which is the reason this is not a Codex
  // special case: a Claude task runs while the CODEX fleet is full.
  it('runs a claude task while the codex fleet is full', async () => {
    build([hers('w-claude-work')], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual(['w-claude-work']);
  });
});

/* ============ the trap: the queue must skip, never break =============== */

describe('a full fleet on one engine does not stop the scan', () => {
  // THE ONE THAT MATTERS. Three Claude rows she has ranked above the Codex one,
  // a full Claude fleet, and the Codex row last in the sorted queue. A cap that
  // breaks never reaches it; a cap that skips does.
  it('runs the codex row sitting behind three claude rows it cannot fit', async () => {
    build([
      hers('w-claude-a', { priority: 9 }),
      hers('w-claude-b', { priority: 8 }),
      hers('w-claude-c', { priority: 7 }),
      hers('w-codex-last', { engine: 'codex', priority: 1 }),
    ], { slots: 3 });
    fill(3, 'claude');
    await sup.tick();
    expect(spawned).toEqual(['w-codex-last']);
  });

  // And the same read from the other end: a full CODEX fleet must not bury the
  // Claude rows behind it either. Nothing about the fix may be Codex-shaped.
  it('runs the claude row sitting behind a codex row it cannot fit', async () => {
    build([
      hers('w-codex-first', { engine: 'codex', priority: 9 }),
      hers('w-claude-last', { priority: 1 }),
    ], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual(['w-claude-last']);
  });

  // A tick is allowed to fill BOTH engines in one pass. Without this the fix
  // could be "skip one row" rather than "keep scanning".
  it('fills both engines in the same pass', async () => {
    build([
      hers('w-claude-1', { priority: 9 }),
      hers('w-codex-1', { engine: 'codex', priority: 8 }),
      hers('w-claude-2', { priority: 7 }),
      hers('w-codex-2', { engine: 'codex', priority: 6 }),
    ], { slots: 2 });
    await sup.tick();
    expect(spawned.sort()).toEqual(['w-claude-1', 'w-claude-2', 'w-codex-1', 'w-codex-2']);
  });
});

/* ==================== the machine is still one machine =================== */

describe('the whole-mac ceiling', () => {
  it('is the two engines added together', () => {
    build([], { slots: 3 });
    expect(sup._capacityFor('claude')).toBe(3);
    expect(sup._capacityFor('codex')).toBe(3);
    expect(sup._capacity()).toBe(6);
    expect(sup._capacity()).toBe(sup._capacityFor('claude') + sup._capacityFor('codex'));
  });

  it('holds: nothing starts on either engine once both are full', async () => {
    build([
      hers('w-claude-work', { priority: 9 }),
      hers('w-codex-work', { engine: 'codex', priority: 8 }),
    ], { slots: 3 });
    fill(3, 'claude');
    fill(3, 'codex');
    expect(sup._load()).toBe(6);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the whole reason the old number was
  // wrong: a Claude login is not a Codex slot. Signing into a second Claude
  // subscription doubles the Claude fleet and leaves Codex exactly where it was.
  it('does not let a second claude login widen the codex fleet', () => {
    build([], { slots: 3, authProfiles: ['default', HER_SECOND_CLAUDE] });
    expect(sup._capacityFor('claude')).toBe(6);
    expect(sup._capacityFor('codex')).toBe(3);
  });

  // And the same rule the other way round, which is the half her ask was about:
  // a Codex login widens Codex and nothing else.
  it('does not let a second codex login widen the claude fleet', () => {
    build([], { slots: 3, codexProfiles: ['default', '/Users/her/.codex-second'] });
    expect(sup._capacityFor('claude')).toBe(3);
    expect(sup._capacityFor('codex')).toBe(6);
  });

  // A MAC WITH NO CODEX ON IT IS THE MAC EVERY OTHER TEST IN THIS SUITE MEANS,
  // and the number it reports must not have moved: `capacity` rides the
  // snapshot to her screen, and an engine that cannot run is not a slot.
  it('counts no codex slots on a mac with no codex', () => {
    build([], { slots: 3, codexBin: null });
    expect(sup._capacityFor('codex')).toBe(0);
    expect(sup._capacity()).toBe(3);
  });

  it('counts a session against its own engine and no other', () => {
    build([], { slots: 3 });
    fill(2, 'claude');
    fill(1, 'codex');
    expect(sup._loadFor('claude')).toBe(2);
    expect(sup._loadFor('codex')).toBe(1);
    expect(sup._load()).toBe(3);
  });

  // A session written before the second engine existed carries no `engine`, and
  // it was a Claude session. Counting it as neither would silently raise the
  // Claude cap on every restart.
  it('counts a session with no engine on it as claude', () => {
    build([], { slots: 3 });
    sup.sessions.set('w-old', { itemId: 'w-old', product: 'agentbox' });
    expect(sup._loadFor('claude')).toBe(1);
    expect(sup._loadFor('codex')).toBe(0);
  });
});

/* ================= what the cap still does not count ==================== */

describe('a command she typed', () => {
  it('still runs with every slot on both engines taken', async () => {
    build([answered('w-5d1ad29efa', '/usage')], { slots: 3 });
    fill(3, 'claude');
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual(['w-5d1ad29efa']);
  });

  // AND NOT ON THE SECOND ENGINE, WHICH THIS USED TO ASSERT THE OTHER WAY UP.
  // That symmetry was the mistake. The eight are CLAUDE CODE'S OWN COMMANDS,
  // and `spawnWorker` has always known it: it guards `commandPrompt` with
  // `engine === DEFAULT_ENGINE`, because Codex knows none of them and the
  // prompt there is not argv at all -- it is handed to a turn's `input`, so
  // `/usage` reaches it as her message.
  //
  // So a Codex row marked `command` was an ORDINARY TURN wearing the exemption:
  // sorted ahead of every priority she set and spawned on a full fleet, taking
  // a slot from a row that was waiting, for something that runs as long as any
  // other turn. The exemption is bought by "2.8 to 4.8 seconds of printing a
  // table" and that price is not paid here.
  // tests/a-slash-command-does-not-jump-the-queue-on-codex holds the rest.
  it('waits on a codex row with the codex fleet full, because it is not a command there', async () => {
    build([answered('w-usage-codex', '/usage', { engine: 'codex' })], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // AND IT IS THE ENGINE THAT DECIDES, NOT THE FLEET BEING FULL: the same row
  // with a free slot runs, as the ordinary turn it is.
  it('runs on a codex row with a slot free, as an ordinary turn', async () => {
    build([answered('w-usage-codex', '/usage', { engine: 'codex' })], { slots: 3 });
    await sup.tick();
    expect(spawned).toEqual(['w-usage-codex']);
    expect(sup._loadFor('codex')).toBe(1);
  });

  // THE CASE THAT MUST NOT MATCH: an ordinary reply is a worker and workers are
  // what the cap is for, on either engine.
  it('unlike an ordinary reply, which still waits on its own engine', async () => {
    build([answered('w-ordinary', 'yes, merge it', { engine: 'codex' })], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('is not in the number either engine is measured against', () => {
    build([], { slots: 3 });
    fill(2, 'claude');
    sup.sessions.set('w-usage', { itemId: 'w-usage', product: 'agentbox', command: true, engine: 'claude' });
    sup.sessions.set('w-usage-x', { itemId: 'w-usage-x', product: 'agentbox', command: true, engine: 'codex' });
    expect(sup.sessions.size).toBe(4);
    expect(sup._loadFor('claude')).toBe(2);
    expect(sup._loadFor('codex')).toBe(0);
  });
});

/* ============== an interruption frees a slot on ONE engine =============== */

describe('an urgent row interrupts only its own engine', () => {
  // A running Claude session that the wake sweep could genuinely resume: a
  // record with a session id, and a transcript on disk. Without both halves
  // `_preemptFor` refuses every candidate and the tests below would pass for
  // the wrong reason.
  const resumableClaudeFleet = (n) => {
    fill(n, 'claude');
    sup.transcriptFile = (rec) => (rec?.sessionId ? '/nonexistent/transcript.jsonl' : null);
    const victims = [];
    for (let i = 0; i < n; i += 1) {
      const id = `w-busy-claude-${i}`;
      sup._liveSessions[id] = {
        sessionId: `S-${i}`, product: 'agentbox', cwd: '/nonexistent', profile: 'default', engine: 'claude',
      };
      victims.push(hers(id, { priority: 1 }));
    }
    return victims;
  };

  // Proof the fixture is real: an Urgent CLAUDE row does take a Claude session.
  it('takes a claude session for an urgent claude row', () => {
    build([], { slots: 3 });
    const victims = resumableClaudeFleet(3);
    const urgent = hers('w-urgent-claude', { priority: 9 });
    expect(sup._preemptFor(urgent, [...victims, urgent], 'claude')).toBe('w-busy-claude-0');
  });

  // THE CASE THAT MUST NOT MATCH. Killing a Claude session frees a CLAUDE slot,
  // which is no use to a Codex row and costs her a running worker for nothing.
  it('never takes a claude session for an urgent codex row', () => {
    build([], { slots: 3 });
    const victims = resumableClaudeFleet(3);
    const urgent = hers('w-urgent-codex', { engine: 'codex', priority: 9 });
    expect(sup._preemptFor(urgent, [...victims, urgent], 'codex')).toBe(null);
    expect([...sup.sessions.values()].some((s) => s.stoppedByUs)).toBe(false);
  });
});

/* ============== one interruption per engine, and no more ================ */

describe('a tick interrupts at most one session per engine', () => {
  // The other half of what the old `break` was doing. Nothing further down the
  // queue outranks the row we just made room for, so a second preemption on the
  // SAME engine could only take a slot for a row that is going to wait anyway —
  // which is a productive worker killed for nothing. Two Urgent rows behind one
  // full fleet must cost her exactly one session.
  it('does not take a second claude session for a second urgent claude row', async () => {
    const victims = [];
    for (let i = 0; i < 3; i += 1) victims.push(hers(`w-busy-claude-${i}`, { priority: 1 }));
    build([hers('w-urgent-a', { priority: 9 }), hers('w-urgent-b', { priority: 9 }), ...victims], { slots: 3 });
    fill(3, 'claude');
    sup.transcriptFile = (rec) => (rec?.sessionId ? '/nonexistent/transcript.jsonl' : null);
    for (let i = 0; i < 3; i += 1) {
      sup._liveSessions[`w-busy-claude-${i}`] = {
        sessionId: `S-${i}`, product: 'agentbox', cwd: '/nonexistent', profile: 'default', engine: 'claude',
      };
    }
    await sup.tick();
    expect([...sup.sessions.values()].filter((x) => x.stoppedByUs)).toHaveLength(1);
  });
});

/* ============ every other door the cap stands in front of =============== */

describe('the other paths measure a row against its own engine too', () => {
  // A ROW SHE RESUMED BY NAME KEEPS ITS PLACE, and the scan goes on past it.
  // This queue used to break on the cap exactly as the main one did, so a Codex
  // row she asked for out loud would sit behind a Claude row that could not
  // start — and "a resume that quietly never happens is the failure this whole
  // path exists to end".
  it('resumes the queued codex row while the queued claude row still waits', async () => {
    // A question with no answer is in neither the fresh-work pass nor the
    // continuation pass, so the only thing that can spawn these is the resume
    // queue itself.
    const parked = (id, extra = {}) => ({
      id, product: 'agentbox', status: 'open', kind: 'question', labels: [],
      priority: 5, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false, ...extra,
    });
    build([parked('w-resume-claude'), parked('w-resume-codex', { engine: 'codex' })], { slots: 3 });
    fill(3, 'claude');
    sup._resumeQueue.add('w-resume-claude');
    sup._resumeQueue.add('w-resume-codex');

    await sup.tick();

    expect(spawned).toEqual(['w-resume-codex']);
    // And the one that could not fit is still queued rather than dropped.
    expect([...sup._resumeQueue]).toEqual(['w-resume-claude']);
  });

  // AN INTERRUPTED SESSION IS PUT BACK ON THE ACCOUNT THAT HOLDS IT, and this
  // sweep asks whether that account is resting. Both engines call their primary
  // login 'default', so reading the raw name would tell a Codex row that her
  // quarantined CLAUDE subscription is the reason it cannot come back.
  it('does not read her claude cooldown when recovering a codex session', () => {
    build([{
      id: 'w-stranded', product: 'agentbox', status: 'claimed', kind: 'directive',
      labels: ['founder'], priority: 5, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false,
    }], { slots: 3 });
    sup.transcriptFile = () => '/nonexistent/transcript.jsonl';
    sup._liveSessions['w-stranded'] = {
      sessionId: 'S-1', product: 'agentbox', cwd: '/nonexistent', profile: 'default', engine: 'codex',
    };
    sup._profileCooldown.default = Date.now() + 30 * 60_000;

    expect(sup.recoverInterrupted('test')).toMatchObject({ resumed: 1, resting: 0 });

    // THE CASE THAT MUST NOT MATCH: its OWN account resting does stop it, which
    // is the 2026-08-24 lesson this guard was written for.
    build([{
      id: 'w-stranded', product: 'agentbox', status: 'claimed', kind: 'directive',
      labels: ['founder'], priority: 5, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false,
    }], { slots: 3 });
    sup.transcriptFile = () => '/nonexistent/transcript.jsonl';
    sup._liveSessions['w-stranded'] = {
      sessionId: 'S-1', product: 'agentbox', cwd: '/nonexistent', profile: 'default', engine: 'codex',
    };
    sup._profileCooldown['codex:default'] = Date.now() + 30 * 60_000;

    expect(sup.recoverInterrupted('test')).toMatchObject({ resumed: 0, resting: 1 });
  });

  // A DRIVE WAS A CLAUDE CODE SESSION and had to take a Claude slot, which is
  // what this block measured. The drive is deleted (w-d19d6d387c, 2026-09-22).
  // The digest is the synthetic session that remains, and it is measured
  // against its own engine in
  // tests/a-digest-runs-on-the-engine-whose-slot-it-took.test.mjs.
});

/* ========================= and nothing routes to it ====================== */

describe('the gate is still shut', () => {
  // No override on this one, and no moment in the config: this is every Mac
  // before she opts in, hers included.
  //
  // THIS USED TO ASSERT `_capacityFor('codex')` IS 3, under a comment reading
  // "capacity is a fact about the machine; routing is a fact about the build,
  // and this slice moved only the first". That sentence was the bug written
  // down. `_capacityFor` refused Codex on the BINARY alone, while `_engineFor`
  // and `engineChoices` refuse on the gate FIRST and the binary second -- so
  // this Mac counted three Codex slots that no row can be routed to, and the
  // number rides `zero:snapshot` to Settings, which printed "Room for 6 at
  // once" directly above "Up to 3 run together". Capacity for an engine
  // nothing can reach is not a fact about the machine; it is a number about
  // nothing. tests/the-room-she-is-told-about-is-room-she-really-has.test.mjs
  // is the rest of it.
  it('gives codex no slots and no rows while the gate is shut', () => {
    const untouched = new Supervisor(
      {
        home: ONE_ACCOUNT_HOME,
        storeRoot: '/nonexistent-zero-root',
        maxConcurrentSessions: 3,
        authProfiles: ['default'],
        codexBin: CODEX_BIN,
      },
      store([]),
      '/nonexistent-app',
    );
    expect(untouched._capacityFor('codex')).toBe(0);
    // And the Claude fleet's own number is untouched by that, which is what
    // makes the whole-Mac total honest rather than merely smaller.
    expect(untouched._capacityFor('claude')).toBe(3);
    expect(untouched._capacity()).toBe(3);
    expect(untouched._engineFor(hers('w-250cd74811', { engine: 'codex' }))).toBe('claude');
    untouched.config.engine = 'codex';
    expect(untouched._engineFor(hers('w-250cd74811', { engine: 'codex' }))).toBe('claude');
  });
});
