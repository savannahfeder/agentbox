// WHAT FOLDS WHEN THE WINDOW IS NARROW (w-df42206cea, 2026-10-05).
//
// The summary closes by default when a thread's pane has no room for it, "but
// you can reopen it". The sidebar is always narrow, so it has nothing to fold.
//
// A FOLD THE APP MADE IS NOT A CHOICE, so it is never remembered: widen the
// window and what you had comes back. A click while there is no room is
// honoured at once and is for now only, until the window crosses the line
// again. A click with room is your choice and is remembered, as before.
import { useCallback, useState } from 'react';

/** The summary's widest panel (368) and 520 of conversation beside it. */
export const SUMMARY_NEEDS = 368 + 520;

export const summaryFits = (paneWidth: number) => paneWidth >= SUMMARY_NEEDS;

/** Where the summary is drawn: beside the conversation, over it when opened
 *  without room (beside it would leave the words a strip), or folded to its rail. */
export function summaryPlace({ offered, shown, fits }: { offered: boolean; shown: boolean; fits: boolean }): 'open' | 'over' | 'rail' | undefined {
  if (!offered) return undefined;
  if (!shown) return 'rail';
  return fits ? 'open' : 'over';
}

/** `override` is a click made while there was no room; null when there was none. */
type Room = { choice: boolean; fits: boolean; override: boolean | null };

export function shownWithRoom({ choice, fits, override }: Room): boolean {
  if (fits) return choice;
  return override ?? false;
}

/** What one click does: with room it changes the choice, without room only the override. */
export function nextWithRoom(room: Room): { choice: boolean; override: boolean | null } {
  if (room.fits) return { choice: !room.choice, override: null };
  return { choice: room.choice, override: !shownWithRoom(room) };
}

/**
 * The shown state and the one toggle for a panel that folds without room.
 * `choice` and `setChoice` are the remembered preference the caller already
 * keeps. The override is cleared each time `fits` changes, so a click made in a
 * narrow window lasts until the window is widened past the line, and a later
 * narrowing folds the panel again.
 */
export function useRoomyToggle(fits: boolean, choice: boolean, setChoice: (v: boolean) => void): [boolean, () => void] {
  const [override, setOverride] = useState<boolean | null>(null);
  const [seen, setSeen] = useState(fits);
  if (seen !== fits) { setSeen(fits); setOverride(null); }
  const room = { choice, fits, override: seen === fits ? override : null };
  const shown = shownWithRoom(room);
  const toggle = useCallback(() => {
    const next = nextWithRoom(room);
    if (next.choice !== choice) setChoice(next.choice);
    setOverride(next.override);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, fits, override, setChoice]);
  return [shown, toggle];
}
