// WHAT FOLDS WHEN THE WINDOW IS NARROW (w-df42206cea, 2026-10-05).
//
// In a window about 970 points wide the sidebar (246) and the summary (352)
// left a thread's conversation about 360 points. Asked for: the summary closed
// by default when there is no room, "but you can reopen it", and "maybe better
// to close left sidebar first". So the sidebar folds to its strip of icons
// first, everywhere, and the summary folds only when the thread's pane is still
// too narrow for it after that.
//
// A FOLD THE APP MADE IS NOT A CHOICE, so it is never remembered: widen the
// window and what you had comes back. A click while there is no room is
// honoured at once and is for now only, until the window crosses the line
// again. A click with room is your choice and is remembered, as before.
import { useCallback, useEffect, useState } from 'react';

/** The window width below which the sidebar folds. Chosen so that at this
 *  width, with the sidebar open, a thread's pane still has room for the summary
 *  (1180 less the sidebar's 246 and the frame's 22 is 912, over SUMMARY_NEEDS):
 *  widening the window never opens the sidebar and closes the summary at once. */
export const SIDEBAR_FOLDS_BELOW = 1180;

/** The summary's 352 points and 520 of conversation beside it. */
export const SUMMARY_NEEDS = 352 + 520;

export const sidebarFits = (windowWidth: number) => windowWidth >= SIDEBAR_FOLDS_BELOW;
export const summaryFits = (paneWidth: number) => paneWidth >= SUMMARY_NEEDS;

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

/** The window's inner width, kept current. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return width;
}
