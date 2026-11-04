// TRY AGAIN (w-d08dcbb6fc): one press that puts an agent back on a thread
// nothing is going to start without a person. It is `resumeItems`, the path
// Resume takes over a selection: it ends a rest, a hold and a delivery mark,
// and starts the thread now or as soon as an agent is free.
//
// tests/a-stuck-thread-offers-try-again.test.mjs

import { liveLine, type LiveFacts } from './live-line';
import { saysARunGotNowhere } from '../../shared/spawn-trouble.mts';
import type { WorkItem } from './types';

// Queued, Up next and Shipping come on their own. Signed out waits for a
// sign-in, which a press cannot do. At its limit is offered because switching
// accounts is exactly when someone wants one more try.
const STUCK = new Set(['idle', 'silent', 'limit']);

export function offersTryAgain(item: WorkItem, facts: LiveFacts & { practice?: boolean } = {}): boolean {
  if (item.agent || item.status === 'done' || facts.session || facts.practice) return false;
  // Without the fleet this window knows nothing about what is coming.
  if (!Array.isArray(facts.queued)) return false;
  if (facts.asking || facts.shipping || facts.remoteHeld) return false;
  if ((facts.scheduledUntil ?? 0) > (facts.now ?? Date.now())) return false;
  if (facts.stalled) return true;
  const live = liveLine(item, facts);
  if (live) return STUCK.has(live.state);
  // Out of In progress, the newest word on it is the app's own note that a run stopped.
  return item.status === 'open' && item.wrote?.result?.source === 'agent' && saysARunGotNowhere(item.result);
}

export interface TryAgainOutcome { resumed?: number; queued?: number; working?: number; missing?: number; failed?: number; why?: string }

/** What a press of Try again says, whatever came back, so a press is never silent. */
export function tryAgainWords(r: TryAgainOutcome | null | undefined): string {
  if (!r) return 'Try again did not reach the app.';
  if (r.resumed) return 'Trying again now.';
  if (r.queued) return 'Queued.';
  if (r.working) return 'Already running.';
  if (r.failed) return `It could not start: ${String(r.why ?? 'the app did not say why').replace(/\.$/, '')}.`;
  if (r.missing) return 'This thread is gone from this computer.';
  return 'It cannot start on this computer: another computer runs it.';
}
