// WHAT THE SUPERVISOR SAYS ABOUT EVERY THREAD AT ONCE, for the surfaces that
// draw threads beside each other: the table, the board and the summary panel.
//
// `App` already holds all of it, off one snapshot, and already hands the
// running ids down as a context. This carries the rest of the same answer so a
// row can say what is happening without four more props threaded through two
// components that have nothing to do with agents.
import { createContext } from 'react';
import type { RunningSession, WhyNotCloud } from './types';

export interface Fleet {
  /** The run on each thread an agent is on right now, by thread id. */
  sessions?: Map<string, RunningSession>;
  /** `supervisor.queued`: a tick spawns these as soon as a slot frees. */
  queued?: string[];
  /** `supervisor.remoteHeld`: sessions of ours open between Remote Control turns. */
  remoteHeld?: string[];
  /** `supervisor.runNow`: the queued ones pushed to the front. */
  runNow?: string[];
  /** `supervisor.signInNeeded`: the tool each held thread is signed out of. */
  signInNeeded?: Record<string, string>;
  /** `supervisor.atLimit`: the tool that is out of usage and when it resets. */
  atLimit?: Record<string, { tool: string; until: number }>;
  /** `supervisor.cannotStart`: queued, but the last pass could not start these, and why. */
  cannotStart?: Record<string, { why: string; tool: string }>;
  /** `supervisor.shipping`: the app still owes these a ship. */
  shipping?: string[];
  /** `snapshot.approvals`: an agent on each of these is stopped on a permission
   *  request, so the row says Asking rather than Working. */
  asking?: string[];
  /** `supervisor.stalled`: a worker died on these. */
  stalled?: string[];
  /** `supervisor.silent`: the last run here ended and wrote nothing down. */
  silent?: Record<string, { runs: number; endedAt: number }>;
  /** Spawning is off altogether. */
  paused?: boolean;
  /** `supervisor.whyNotCloud`: why a thread runs locally or waits, with the cloud on Everything. */
  whyNotCloud?: Record<string, WhyNotCloud>;
}

export const FleetContext = createContext<Fleet>({});

/** The queue as a row should read it: an answer held for its undo is already on its way to an agent. */
export function queuedWithHeld(queued: string[] | undefined, held: string | null): string[] | undefined {
  if (!held || !queued || queued.includes(held)) return queued;
  return [...queued, held];
}
