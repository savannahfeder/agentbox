// TRY AGAIN (w-d08dcbb6fc): one press that puts an agent back on a thread
// nothing is going to start without a person. It is `resumeItems`, the path
// Resume takes over a selection: it ends a rest, a hold and a delivery mark,
// and starts the thread now or as soon as an agent is free.
//
// tests/a-stuck-thread-offers-try-again.test.mjs

import { liveLine, type LiveFacts } from './live-line';
import { saysARunGotNowhere } from '../../shared/spawn-trouble.mjs';
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
