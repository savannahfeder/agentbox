// HEAVY COMMANDS WAIT THEIR TURN WHEN MEMORY IS SHORT (w-3958c3753d).
//
// THE BOTTLENECK WAS NEVER HOW MANY AGENTS ARE OPEN. On the founder's 16 GB M4,
// 2026-10-04, swap reached 10.6 GB of 11.3 and the load average 180 on ten cores
// with four or five agents running. An agent waiting on the model is 220-340 MB;
// one running a test suite or a build passes a gigabyte. Agents spend most of
// their time waiting on the model, so many of them can be open at once as long
// as only a few run something heavy at the same moment.
//
// SO EVERY SHELL COMMAND AN AGENT RUNS ASKS THIS FIRST, through a hook the
// worker carries (scripts/memory-gate-hook.sh, main/memory-gate-server.mjs).
// Asking costs about 9 ms (measured with curl over the local socket, 30 runs);
// agents ran a median of 2 commands per active minute and at most 13, against a
// median of 6.8 s of model thinking between commands. This file is the answer
// to the question, and does no I/O so every rule below is a test.
//
// THE RULES, agreed with Codex over five rounds before any of this was written:
//   - A command known to be light (main/memory-gate-history.mjs) starts at once,
//     unless memory is critical. A lane of `lightLane` keeps even those bounded.
//   - A heavy or never-seen command needs one of `slots`, and only while memory
//     is normal. A never-seen one holds its slot for `specWindowMs`, and after
//     that only while it is measured at `heavyMb` or more: a dev server that
//     sits at 60 MB should not block everyone's tests for an afternoon.
//   - Waiting commands go in the app's own order (the supervisor's `_score`:
//     the project's place, then urgent / high / medium / low), oldest first on a
//     tie, and a command that has waited `agingMs` moves up one level so
//     nothing low starves behind a stream of high ones.
//   - NOTHING LOWER SLIPS PAST A HIGHER COMMAND WAITING FOR A SLOT. Otherwise a
//     stream of small never-seen commands keeps taking the slot an urgent test
//     is waiting for. Light commands are the exception: they need no slot.
//   - A running command is never stopped, paused or killed. Pausing was the
//     first design and Codex took it apart: a paused program frees no memory,
//     trips its own time limits, and stays frozen forever if the app dies.
//   - No command waits forever. After `maxWaitMs` the agent is told no, with a
//     reason it can act on, and the hook's own time limit sits above that.
//   - AN URGENT ROW DOES NOT QUEUE (w-713aba0c89). Her only Urgent row on
//     2026-10-07 was first in line for 34 minutes while no slot came free, so
//     first in line bought nothing. Its commands now run whatever the slots and
//     whatever "tight" says, and wait only while memory is critical. They still
//     take a slot while they run, so everything else waits behind them.
//   - COMMANDS MEASURED AS ONE FIGURE HOLD ONE SLOT (w-713aba0c89). Every Codex
//     thread runs under one app-server, so two Codex commands at once read as
//     the same number, and a `cat` beside a test run used to hold a slot of its
//     own off the test run's gigabyte. A command known heavy still holds its own.

import { CommandHistory, HEAVY_MB } from './memory-gate-history.mjs';
import { NAME } from '../shared/product-name.mjs';

/**
 * The kernel's own pressure reading (`kern.memorystatus_vm_pressure_level`:
 * 1 normal, 2 warn, 4 critical) and the free share it reports
 * (`kern.memorystatus_level`), as one of three words. Free memory is the early
 * signal: the kernel only says "warn" once it is already compressing hard.
 */
export function pressureFrom({ level, freePct } = {}, { tightPct = 12, criticalPct = 5 } = {}) {
  const free = typeof freePct === 'number' && Number.isFinite(freePct) ? freePct : null;
  if (level >= 4 || (free !== null && free < criticalPct)) return 'critical';
  if (level >= 2 || (free !== null && free < tightPct)) return 'tight';
  return 'normal';
}

/** One heavy slot per 8 GB, at least one; two on a machine it cannot read. */
export function autoSlots(memBytes) {
  const gb = Math.round((Number(memBytes) || 0) / 1024 ** 3);
  if (gb <= 0) return 2;
  return Math.max(1, Math.floor(gb / 8));
}

export const DEFAULTS = {
  slots: 2,
  specWindowMs: 10_000,
  heavyMb: HEAVY_MB,
  lightLane: 8,
  maxWaitMs: 20 * 60_000,
  agingMs: 5 * 60_000,
};

/**
 * IT SAYS WHICH OF THE TWO REASONS IT WAS (w-8386b3fd47). This sentence is the
 * only account an agent ever gets of why its command did not run, and it used to
 * blame memory either way. Two sessions were refused ordinary file reads while
 * the coordinator itself reported normal pressure and 42% free, read the
 * sentence, believed the machine was out of memory and spent their turns looking
 * for a fault that was not there. A queue behind heavier work and a computer that
 * is genuinely short are different things to be told.
 */
export function refusal(waitedMs, pressure = 'normal') {
  const minutes = Math.max(1, Math.round(waitedMs / 60_000));
  const held = `${NAME} held this command for ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const why = pressure === 'normal'
    ? `${held} behind heavier work that has not finished, and it still cannot start it.`
    : `This computer is short of memory, so ${held} while heavier work ran, and it still cannot start it.`;
  return `${why} Do not retry it straight away. Carry on with anything that does not need it, `
    + 'or end your turn and say what you are waiting for.';
}

export class MemoryGate {
  constructor({ history = new CommandHistory(), clock = Date.now, ...opts } = {}) {
    Object.assign(this, DEFAULTS, opts);
    this.history = history;
    this.clock = clock;
    this.pressure = 'normal';
    this.running = new Map();
    this.waiting = new Map();
  }

  setPressure(p) {
    if (p === this.pressure) return;
    this.pressure = p;
    this._pump();
  }

  setSlots(n) {
    this.slots = Math.max(1, Math.round(Number(n) || 1));
    this._pump();
  }

  /**
   * Ask to run `req.command`. `reply` is called exactly once per call with
   * `{ allow: true }` or `{ allow: false, reason }`, now or later.
   */
  submit(req, reply) {
    const id = String(req.id);
    if (this.running.has(id)) { reply({ allow: true, cls: this.running.get(id).cls }); return; }
    const already = this.waiting.get(id);
    if (already) { already.replies.push(reply); return; }
    this.waiting.set(id, {
      id,
      item: req.item ?? null,
      product: req.product ?? null,
      command: String(req.command ?? ''),
      score: Number.isFinite(Number(req.score)) ? Number(req.score) : 0,
      urgent: req.urgent === true,
      session: req.session ?? null,
      background: !!req.background,
      cls: this.history.classify(req.command),
      arrived: this.clock(),
      replies: [reply],
    });
    this._pump();
  }

  /** The command ended (or its asker went away). Returns what it was, or null. */
  finish(id) {
    const key = String(id);
    const was = this.running.get(key) ?? null;
    if (was) this.running.delete(key);
    if (this.waiting.delete(key) || was) this._pump();
    return was;
  }

  /** A sampled footprint of a running command, in MB. Only the peak is kept. */
  observe(id, mb) {
    const r = this.running.get(String(id));
    if (!r || !Number.isFinite(mb)) return;
    r.peakMb = Math.max(r.peakMb ?? 0, mb);
  }

  /**
   * This running command's memory reading is shared with others on the same
   * agent process (`group`), so it is not its own figure. Nothing clears it.
   */
  share(id, group) {
    const r = this.running.get(String(id));
    if (!r || r.shared === group) return;
    r.shared = group;
    this._pump();
  }

  tick() { this._pump(); }

  snapshot() {
    const now = this.clock();
    return {
      pressure: this.pressure,
      slots: this.slots,
      running: [...this.running.values()].map((r) => ({
        id: r.id, item: r.item, product: r.product, command: r.command, cls: r.cls,
        peakMb: r.peakMb, ranMs: now - r.startedAt, holdsSlot: this._holdsSlot(r, now),
      })),
      waiting: this._ordered(now).map((w) => ({
        id: w.id, item: w.item, product: w.product, command: w.command, cls: w.cls,
        score: w.score, waitedMs: now - w.arrived,
      })),
    };
  }

  _holdsSlot(r, now) {
    if ((r.peakMb ?? 0) >= this.heavyMb) return true;
    if (r.cls === 'heavy') return true;
    if (r.cls === 'unknown') {
      if (now - r.startedAt < this.specWindowMs) return true;
      // Never measured is not evidence that it is small.
      return r.peakMb === null;
    }
    return false;
  }

  _ordered(now) {
    const eff = (w) => w.score + Math.floor((now - w.arrived) / this.agingMs);
    return [...this.waiting.values()].sort((a, b) => (eff(b) - eff(a)) || (a.arrived - b.arrived));
  }

  _pump() {
    const now = this.clock();
    for (const w of [...this.waiting.values()]) {
      if (now - w.arrived >= this.maxWaitMs) {
        this.waiting.delete(w.id);
        for (const r of w.replies) r({ allow: false, reason: refusal(now - w.arrived, this.pressure) });
      }
    }
    if (this.pressure === 'critical') return;
    let slotsUsed = 0;
    let lightUsed = 0;
    const sharedGroups = new Set();
    for (const r of this.running.values()) {
      if (this._holdsSlot(r, now)) {
        if (r.shared != null && r.cls !== 'heavy') {
          if (sharedGroups.has(r.shared)) continue;
          sharedGroups.add(r.shared);
        }
        slotsUsed++;
      } else if (r.cls === 'light') lightUsed++;
    }
    let blocked = false;
    for (const w of this._ordered(now)) {
      if (w.urgent) { this._admit(w, now); slotsUsed++; continue; }
      if (w.cls === 'light') {
        if (lightUsed < this.lightLane) { this._admit(w, now); lightUsed++; }
        continue;
      }
      if (blocked) continue;
      if (this.pressure === 'tight' || slotsUsed >= this.slots) { blocked = true; continue; }
      this._admit(w, now);
      slotsUsed++;
    }
  }

  _admit(w, now) {
    this.waiting.delete(w.id);
    this.running.set(w.id, {
      id: w.id, item: w.item, product: w.product, command: w.command, cls: w.cls,
      urgent: w.urgent, session: w.session, background: w.background, startedAt: now, peakMb: null, shared: null,
    });
    for (const r of w.replies) r({ allow: true, cls: w.cls });
  }
}
