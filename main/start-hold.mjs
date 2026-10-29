// NO NEW AGENT STARTS WHILE MEMORY IS SHORT (w-ec27ff1a51).
//
// 2026-10-11, a 16 GB Mac ran out of application memory with Agentbox at
// 22 GB and six agents running. The memory check (main/memory-gate.mjs) held
// tests and builds back, but nothing asked memory before STARTING an agent, so
// the fleet filled every slot it had into a Mac that was already short.
//
// So while the memory switch is on and the Mac reads tight or very short, a new
// agent waits. That is the whole rule. Everything else here is a way out of it,
// because the founder's condition was that urgent work still comes first and
// that nothing sits stuck for long on a misread:
//
//   - NOTHING RUNNING, ONE STARTS. Whatever is filling memory then is not us,
//     and an app with no agent running at all is broken rather than careful.
//   - AN URGENT ROW, OR ONE SHE ASKED FOR BY NAME, starts while tight and waits
//     only while very short: the command gate's rule for urgent commands.
//   - A SWAP IS NOT A NEW AGENT. A row something was paused for (an Urgent row
//     taking a lesser session's slot, or Run now) always starts, so urgent work
//     still takes over while memory is very short, by replacing, not adding.
//   - A READING THAT IS MISSING, UNREADABLE OR OLDER THAN A MINUTE IS NOT A
//     REASON TO HOLD. The hold acts only on a reading it actually has.
//   - TEN MINUTES HELD, ONE STARTS ANYWAY, and the ten minutes start again from
//     it. A reading stuck on "tight" by mistake costs a slow queue, never a
//     stopped one.
//   - THE WORST READING OF THE LAST THREE MINUTES DECIDES, not the newest
//     (w-9c7ca4b8a9). 2026-10-27, 21:40 to 22:00 her time, the minute log read
//     tight or critical in 16 of 20 minutes and normal in the other 4, and
//     each normal ten seconds let more agents in: one running became nine in
//     eight minutes, the kernel said critical, and her Mac was unusable. Memory does not come
//     back in ten seconds; a reading that does is the compressor catching up.
//   - THE KERNEL'S WARN ALONE HOLDS ONLY A MAC ALREADY RUNNING ITS OWN NUMBER
//     (`roomy`, what it carries without this check: 4 at 16 GB). A 16 GB Mac
//     reports warn in bursts all day at 30 to 50% free, and with the window
//     above that held the second agent for an hour (2026-10-28). The freeze
//     read the same warn; what differed was nine agents running. Free memory
//     under the line and the kernel's critical still hold at any count.
//
// Pure, so every one of those is a test (tests/no-new-agent-starts-while-memory-is-short).

import { execFileSync } from 'node:child_process';
import { pressureFrom } from './memory-gate.mjs';

/** One reading, synchronously, for the moment before a restart brings the
 *  fleet back. Nulls (so no hold) when it cannot be read. */
export function readMacPressureNow() {
  let level = null;
  let freePct = null;
  try {
    const out = execFileSync('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level', 'kern.memorystatus_level'],
      { timeout: 2_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    [level, freePct] = out.trim().split(/\s+/).map(Number);
  } catch { /* not a Mac, or sysctl did not answer */ }
  return { level: Number.isFinite(level) ? level : null, freePct: Number.isFinite(freePct) ? freePct : null, at: Date.now() };
}

/** A reading older than this is not acted on. */
export const STALE_MS = 60_000;
/** The longest new work waits on memory before one agent starts anyway. */
export const MAX_HOLD_MS = 10 * 60_000;
/** How far back a short reading still holds starts after a normal one. */
export const SETTLE_MS = 3 * 60_000;

const RANK = { normal: 0, tight: 1, critical: 2 };
/** `kern.memorystatus_vm_pressure_level`'s warn; 1 is normal and 4 critical. */
const WARN_LEVEL = 2;

/** The worst of the readings stamped inside `windowMs` of `now`. Pure. */
export function worstPressure(readings, now, windowMs = SETTLE_MS) {
  let worst = 'normal';
  for (const r of readings ?? []) {
    if (!r || !(Math.abs(now - Number(r.at)) <= windowMs)) continue;
    if (!Number.isFinite(r.level) && !Number.isFinite(r.freePct)) continue;
    const p = pressureFrom(r);
    if (RANK[p] > RANK[worst]) worst = p;
  }
  return worst;
}

/**
 * Whether one more agent may start now, and why. `reading` is
 * `{ level, freePct, at }` from `readMacPressure`, stamped when it arrived.
 * `recent` is the readings before it; the worst inside `settleMs` decides.
 * `heldSince` is when the current hold began (null when nothing is held);
 * `lastStartAt` is when an agent last started. Under `roomy` agents running,
 * the kernel's warn level is not counted.
 */
export function startDecision({
  on, reading, recent = [], now, running,
  urgent = false, asked = false, swap = false,
  lastStartAt = 0, heldSince = null, roomy = 0,
  staleMs = STALE_MS, maxHoldMs = MAX_HOLD_MS, settleMs = SETTLE_MS,
}) {
  if (!on) return { start: true, why: 'off' };
  if (!(running > 0)) return { start: true, why: 'nothing-running' };
  if (swap) return { start: true, why: 'swap' };
  const at = Number(reading?.at);
  const known = reading && (Number.isFinite(reading.level) || Number.isFinite(reading.freePct));
  if (!known || !Number.isFinite(at) || Math.abs(now - at) > staleMs) return { start: true, why: 'no-reading' };
  const readings = running < roomy
    ? [reading, ...recent].map((r) => (r?.level === WARN_LEVEL ? { ...r, level: null } : r))
    : [reading, ...recent];
  const pressure = worstPressure(readings, now, settleMs);
  if (pressure === 'normal') return { start: true, why: 'normal' };
  if (pressure === 'tight' && (urgent || asked)) return { start: true, why: 'urgent' };
  const waitingSince = Math.max(heldSince ?? now, Number(lastStartAt) || 0);
  if (now - waitingSince >= maxHoldMs) return { start: true, why: 'overdue' };
  return { start: false, why: pressure };
}
