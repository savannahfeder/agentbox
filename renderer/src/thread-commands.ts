// PURE. The ⌘K rows for what a thread's own controls do: the summary panel,
// the three-dot menu, the S key, a conversation's Add people and the strip a
// teammate's task opens with. Each row is offered exactly where its control
// is, and says in `does` what App.tsx should run.
//
// Every row keeps its own keywords so a word finds only the rows it means:
// "private" must never put a row that SHARES the thread under the return key.

import type { Seen } from './threads/summary-rules';
import { PLACE_ROW, type ThreadPlace } from './threads/ThreadMenu';

export type TeamRoute = 'agent' | 'me' | 'back';

export type ThreadDoes =
  | { act: 'see'; to: 'team' | 'private'; already: boolean }
  | { act: 'people' }
  | { act: 'pin'; pin: boolean }
  | { act: 'place'; keep: boolean }
  | { act: 'code' }
  | { act: 'summary' }
  | { act: 'rename' }
  | { act: 'end-repeat' }
  | { act: 'add-people' }
  | { act: 'route'; route: TeamRoute };

export interface ThreadCommand {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  keyHint?: string;
  does: ThreadDoes;
}

export interface ThreadFacts {
  /** Who sees it now, or null where that is not this thread's to change. */
  seen?: Seen | null;
  /** The people it is shared with, in the panel's words ("Theo and Ana"). */
  chosen?: string;
  /** Whether anybody else is on the team to choose. */
  teammates?: boolean;
  /** Null where it cannot be pinned. */
  pinned?: boolean | null;
  place?: ThreadPlace | null;
  /** What the open thread draws, or null when this thread is not the open one. */
  open?: { change: boolean; summary: 'open' | 'closed' | null } | null;
  rename?: boolean;
  repeats?: boolean;
  addPeople?: boolean;
  /** The strip's choices on a task a teammate gave you, in its words. */
  routes?: { route: TeamRoute; label: string }[];
}

// THESE ROWS ARE WRITTEN THE WAY THE MENU WRITES THEM (2026-10-24). A `titled`
// helper here upper-cased every word on the way into ⌘K, so the menu said "Run
// on this Mac" and ⌘K said "Run on This Mac", and the list mixed the two
// styles. The menu's is the one kept (./threads/ThreadMenu).

const SEES = 'visible visibility who sees seen';

/** What a press on a Make Private or Share with Team row says, done or already so. */
export const SEE_SAID = {
  private: 'Only you can see this thread now.',
  team: 'Your team can see this thread now.',
} as const;

export function threadCommands(f: ThreadFacts): ThreadCommand[] {
  const rows: ThreadCommand[] = [];
  for (const r of f.routes ?? []) {
    rows.push({
      id: `route-${r.route}`,
      label: r.label,
      keywords: r.route === 'agent' ? 'give hand agent delegate' : r.route === 'me' ? 'myself me keep mine take' : 'hand back return decline',
      does: { act: 'route', route: r.route },
    });
  }
  // The three in the panel's order, the one it is now marked rather than
  // left out, so typing "private" on a private thread still answers.
  if (f.seen) {
    rows.push({
      id: 'see-team',
      label: 'Share with the team',
      ...(f.seen === 'team' ? { hint: 'your team sees it now' } : {}),
      keywords: `${SEES} share shared team teammates everyone`,
      does: { act: 'see', to: 'team', already: f.seen === 'team' },
    });
    if (f.teammates) {
      rows.push({
        id: 'see-people',
        label: 'Share with chosen people…',
        ...(f.seen === 'people' && f.chosen ? { hint: `shared with ${f.chosen} now` } : {}),
        keywords: `${SEES} share shared chosen people person someone pick few`,
        does: { act: 'people' },
      });
    }
    rows.push({
      id: 'see-private',
      label: 'Make private',
      ...(f.seen === 'private' ? { hint: 'only you see it now' } : {}),
      keywords: `${SEES} private privacy only me just me only you personal secret`,
      does: { act: 'see', to: 'private', already: f.seen === 'private' },
    });
  }
  if (f.pinned != null) {
    rows.push({ id: 'pin', label: f.pinned ? 'Unpin thread' : 'Pin thread', keywords: 'pin pinned unpin top stick sticky', does: { act: 'pin', pin: !f.pinned } });
  }
  if (f.rename) rows.push({ id: 'rename', label: 'Rename thread…', keywords: 'rename name title retitle call it', does: { act: 'rename' } });
  if (f.open?.summary) {
    rows.push({
      id: 'summary',
      label: f.open.summary === 'open' ? 'Hide summary' : 'Show summary',
      keyHint: 'S',
      keywords: 'summary panel context details properties info',
      does: { act: 'summary' },
    });
  }
  if (f.open?.change) rows.push({ id: 'code', label: 'View code changes', keywords: 'code changes diff files what changed', does: { act: 'code' } });
  if (f.place) {
    rows.push({
      id: 'place',
      label: PLACE_ROW[f.place].label,
      hint: PLACE_ROW[f.place].detail.charAt(0).toLowerCase() + PLACE_ROW[f.place].detail.slice(1),
      keywords: 'cloud mac computer here local where runs machine',
      does: { act: 'place', keep: f.place !== 'kept' },
    });
  }
  if (f.repeats) rows.push({ id: 'end-repeat', label: 'Stop repeating', keywords: 'repeat repeating recurring every daily weekly stop end cancel', does: { act: 'end-repeat' } });
  if (f.addPeople) rows.push({ id: 'add-people', label: 'Add people…', hint: 'a new conversation with them', keywords: 'add people invite person someone group conversation', does: { act: 'add-people' } });
  return rows;
}
