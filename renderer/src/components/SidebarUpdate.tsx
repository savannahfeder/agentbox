// A NEW VERSION, SHOWN IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The inbox row (update-row.ts) is easy to miss once it scrolls under newer
// work, and she asked for the update to show visually in the sidebar too. It
// is a second place for the same fact, not a second fact: it appears exactly
// when ⌘K offers the restart (`announcesUpdate` with nothing closed), so
// closing the row does not hide it, and pressing it is the row's own button.
//
// Three looks are drawn for her to pick from, and `look` chooses between them
// until she has. No red and no count, which the sidebar never carries.

import { NAME } from '../../../shared/product-name.mjs';
import { SAY } from '../update-row';

export type SidebarUpdateLook = 'line' | 'card' | 'mark';

export const SIDEBAR_UPDATE_LOOKS: SidebarUpdateLook[] = ['line', 'card', 'mark'];

export function sidebarUpdateLook(raw: string | null | undefined): SidebarUpdateLook {
  return (SIDEBAR_UPDATE_LOOKS as string[]).includes(raw ?? '') ? raw as SidebarUpdateLook : 'line';
}

/** The words, from the row's own vocabulary so the two never disagree. */
export const SIDE_SAY = {
  ready: SAY.restart,
  installing: 'Updating',
  cardTitle: 'New version ready',
  cardHow: 'Restarting takes about a minute.',
} as const;

function RestartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>;
}

export function SidebarUpdate({ look, installing, onRestart }: {
  look: SidebarUpdateLook; installing: boolean; onRestart: () => void;
}) {
  const title = installing ? `Updating. ${NAME} restarts by itself in about a minute.` : `${SAY.restart}. ${SIDE_SAY.cardHow}`;
  if (look === 'mark') {
    return <button type="button" className="sb-update-mark" data-installing={installing || undefined} disabled={installing} title={title} aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
      <RestartIcon />
    </button>;
  }
  if (look === 'card') {
    return <div className="sb-update-card" data-installing={installing || undefined}>
      <div className="sb-update-card-title"><RestartIcon /><span>{installing ? SIDE_SAY.installing : SIDE_SAY.cardTitle}</span></div>
      <p>{installing ? `${NAME} restarts by itself in about a minute.` : SIDE_SAY.cardHow}</p>
      {!installing && <button type="button" onClick={onRestart}>{SAY.restart}</button>}
    </div>;
  }
  return <button type="button" className="sb-update-line" data-installing={installing || undefined} disabled={installing} title={title} aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
    <RestartIcon /><span>{installing ? SIDE_SAY.installing : SIDE_SAY.ready}</span>
  </button>;
}
