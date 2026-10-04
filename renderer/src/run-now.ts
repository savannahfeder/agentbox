// WHEN RUN NOW IS OFFERED, asked by the three-dot menu (Focus.tsx) and by ⌘K
// (App.tsx), so the two can never disagree about the same task.
//
// It used to ask the supervisor's waiting list alone, and a task In progress
// that the list did not carry showed no Run now anywhere: an Urgent task sat
// over an hour with every slot full and nothing to press (w-09be058d09). The
// tab's own rule says a worker is coming to anything In progress, so that is
// a task waiting for a slot, and pushing it ahead is exactly what Run now is.
// When the supervisor cannot act on a push (agents paused, scheduled, held by
// another session) it refuses with a reason, and the toast says it.
//
// tests/run-now-is-offered-on-every-waiting-task-and-in-command-k.test.mjs

import type { LiveFacts } from './live-line';
import type { WorkItem } from './types';

export type RunNowFacts = Pick<LiveFacts, 'session' | 'queued' | 'runNow'> & { inProgress?: boolean };

export function offersRunNow(item: WorkItem, facts: RunNowFacts): boolean {
  // A row standing for an agent outside the app has no slot to be given.
  if (item.agent) return false;
  if (facts.session) return false;
  // Already pushed: the task says Up next, and the press has been heard.
  if (facts.runNow?.includes(item.id)) return false;
  return !!facts.queued?.includes(item.id) || !!facts.inProgress;
}

export function runNowCommands(item: WorkItem, facts: RunNowFacts, run: () => void) {
  return offersRunNow(item, facts)
    ? [{ id: 'run-now', label: 'Run Now', keywords: 'start go next urgent jump queue', run }]
    : [];
}
