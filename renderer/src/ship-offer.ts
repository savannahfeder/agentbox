// PURE. THE DECISION A FINISHED RUN LEFT BEHIND, WHEN THE RUN OFFERED NONE.
//
// An offer is read off the agent's own words and nowhere else (./format), so
// whether finished work can be shipped from its thread comes down to whether
// that run remembered to write an Options section. One that forgot leaves its
// commits on a branch with no way out of the thread but a typed sentence.
//
// The app already knows what it asks here: the file the supervisor writes when
// a worker exits says the run left a change (../change-figures), and the row
// says nothing has happened to it since.
//
// IT IS A FLOOR, NOT A POLICY. An agent that offers its own pick keeps it,
// whatever it says, because its words know what the run did and these do not.
import { offerIsLive, type ParsedOption } from './format';

/** The label the ship queue takes a thread by (main/ship-queue.mjs). */
export const SHIP_LABEL = 'ship';

export const SHIP_ASK = 'Ship this change?';

/** Answered the way the agents' own ship offers are, in their words. */
export const SHIP_OFFER: ParsedOption[] = [
  { n: 1, text: 'Ship it', recommended: true },
  { n: 2, text: 'Discard the change', recommended: false },
];

interface Finished {
  status?: string;
  labels?: string[];
  result?: string;
  note?: string;
  body?: string;
  answer?: string;
  wrote?: Record<string, { ts: number } | undefined>;
}

const at = (item: Finished, field: string) => item.wrote?.[field]?.ts ?? 0;

/**
 * Whether the app asks on this thread's behalf. `change` is whether the run
 * left one (the figures the pane already reads), `running` whether anything is
 * still going on the row.
 */
export function shipOfferLive(item: Finished, { change, running }: { change: boolean; running: boolean }): boolean {
  if (!change || running) return false;
  // A thread you have finished with is yours, and a thread already waiting on
  // the ship queue is not asking anybody anything.
  if (item.status === 'done') return false;
  if ((item.labels ?? []).includes(SHIP_LABEL)) return false;
  // A result is written when a worker exits, so it is also how the pane knows
  // the run ended at all.
  if (!(item.result ?? '').trim()) return false;
  // AND IT IS THE NEWEST WORD ON THE ROW, which is the one test that covers
  // all of: it has shipped (the queue writes its note after), its ship failed
  // (the same), and you have already answered it (a run is on its way).
  if (at(item, 'result') < at(item, 'note') || at(item, 'result') < at(item, 'answer')) return false;
  return !offerIsLive(item);
}
