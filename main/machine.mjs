// HOW MANY AGENTS WE SUGGEST RUNNING ON THIS PARTICULAR MAC.
//
// IT SUGGESTS AND IT NEVER REFUSES. The stepper goes to `MAX_SLOTS` on every
// machine, the same on an 8 GB M1 as on a Studio, and the writer clamps to that
// range and not to anything here. For one round it did clamp, and the founder's
// answer is why it does not: these are developers using the tool as they want,
// and somebody who wants twelve agents on a small laptop has decided that.
//
// What this number DOES is choose where somebody starts, and say so in a
// sentence on the Agents row.
//
// ═══ WHERE THE NUMBERS COME FROM, AND WHY THEY ARE NOT THE MEASURED ONES ═══
//
// FIRST, WHAT WAS MEASURED. On the founder's Mac (Apple M4, 16 GB, 10 cores)
// with four agents live, 2026-09-22, `ps -Ao pid,ppid,rss` summed over each
// agent's whole process tree:
//
//     agent tree           400 MB      675 MB      1353 MB
//     the claude process   311 MB      337 MB       525 MB
//
// So an agent is the `claude` process plus whatever it has spawned, and the
// spread is the spawned half: a session reading files sits near 400 MB and one
// running a build or a test suite passes a gigabyte. The app itself measured
// 1.43 GB across all its Electron processes at the same moment.
//
// THAT ARITHMETIC SAID 8 ON HER MAC AND IT WAS WRONG. Budgeting 6 GB of
// headroom and a gigabyte an agent, 16 GB comes out at eight at once.
//
// Her reading beats the arithmetic and it is not close. Resident memory is the
// easiest thing to measure and it is not what runs out first: four agents on a
// ten core Mac are also four `ripgrep` sweeps, four test suites and four
// builds, against an editor and a browser she is using at the same time. None
// of that is in an RSS column. The measurement above is kept because it is
// real and because it says what an agent costs when you need that; it is just
// not the thing that decides this.
//
// SO THE LADDER IS ANCHORED ON HER TWO POINTS. 2 at 8 GB, which she confirmed,
// and 4 at 16 GB, which she set. Those two fit ONE AGENT PER 4 GB OF MEMORY
// exactly, with nothing held back, and that is the whole rule:
//
//     8 GB     ->  2        32 GB    ->  8
//     16 GB    ->  4        36 GB    ->  9
//     24 GB    ->  6        64 GB    -> 12 (MAX_SLOTS)
//
// "For 24 GB, have it scale accordingly" is that line continuing, which is why
// it is a line and not a table: a machine nobody listed still gets an answer.
//
// AND CORES STILL BIND ON AN ODD MACHINE. `cores - 2` leaves the app and the
// machine's own work a core each. On every Mac Apple actually sells this is
// slack -- memory decides at 8, 16, 24 and 32 -- but a box with a lot of RAM
// and few cores exists (a VM, a rented host) and one agent per 4 GB would
// promise it twelve.
//
// IF THE MACHINE CANNOT BE READ, THE ANSWER IS 4.

import os from 'node:os';

/** The most agents the stepper offers, on any machine. Not derived from
 *  anything here: it is the control's own range and it is the same everywhere. */
export const MAX_SLOTS = 12;
/** One agent per this many gigabytes of memory. Her two anchors, 2 at 8 GB and
 *  4 at 16 GB, fit this exactly. */
export const GB_PER_AGENT = 4;
/** Cores held back for the app and the machine's own work. */
export const RESERVED_CORES = 2;
/** What we suggest when the machine cannot be read at all. Her number. */
export const BASELINE_SLOTS = 4;

/**
 * What we suggest for this machine, with the two halves it came from so a
 * screen can say why. `memBytes` and `cores` are arguments rather than reads so
 * a test can lay out an 8 GB M1 without owning one.
 *
 * `known` is false when the machine could not be read and the answer is the
 * baseline rather than a reading, which is what stops the row claiming a Mac
 * has 0 GB.
 */
export function machineSlots({ memBytes = os.totalmem(), cores = os.cpus().length } = {}) {
  const memGb = Math.round((Number(memBytes) || 0) / (1024 ** 3));
  const cpu = Math.max(0, Math.round(Number(cores) || 0));
  // NOTHING TO GO ON IS ITS OWN ANSWER, not a small one. `os.totalmem()` coming
  // back as 0, or a core count of nothing, means we did not read the machine;
  // treating that as a tiny Mac would start somebody on one agent because a
  // syscall failed.
  if (memGb <= 0 || cpu <= 0) {
    return { slots: BASELINE_SLOTS, memGb: 0, cores: 0, byMemory: 0, byCores: 0, known: false };
  }
  // Floor, not round: half an agent's worth of memory is not an agent.
  const byMemory = Math.floor(memGb / GB_PER_AGENT);
  const byCores = cpu - RESERVED_CORES;
  // AT LEAST ONE, ALWAYS. A machine too small for this arithmetic still has to
  // run the app, and an app that suggests no agent at all is broken rather than
  // careful. A 4 GB machine gets one at a time and a slow day.
  const slots = Math.max(1, Math.min(MAX_SLOTS, byMemory, byCores));
  return { slots, memGb, cores: cpu, byMemory, byCores, known: true };
}

/**
 * The sentence the Agents row puts under the stepper, in her vocabulary: what
 * this Mac is, and what we would run on it. It SUGGESTS and never refuses, so
 * it says "we suggest" and not "as high as it goes", which is what this line
 * said for one round while the number really was a wall.
 *
 * Null once somebody is already at or under the suggestion, because a sentence
 * recommending a number she has already taken is a line to read past. Null too
 * when the machine could not be read, because the honest version of it would
 * have to say "this Mac has 0 GB".
 */
export function machineNote({ slots, memGb, cores, known = true }, at = 0) {
  if (!known) return null;
  if (at && at <= slots) return null;
  return `This Mac has ${memGb} GB and ${cores} cores, so we suggest ${slots} at once. Go higher if you want to.`;
}
