// A NEW VERSION, SHOWN IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The one place the app says a newer Agentbox is waiting. It used to be a row
// in the inbox, which scrolled under newer work; of three sidebar looks drawn
// (a line in the foot, a card, an icon by the team's name) the card was
// picked and the row taken out. It appears exactly when ⌘K offers the
// restart (`announcesUpdate`), and pressing it is that same restart.
//
// A × CLOSES IT UNTIL THE NEXT VERSION (w-23fa810982, 2026-10-02). Changes
// land several times a day, so the card was up most of the day and pulled at
// you to restart. One grey line instead of it, then a minus that shrank it to
// that line, were both turned down; the ask that settled it was "just let
// people hit 'x' and it disappears. Next time they restart it'll update, and
// eventually another will come at next update anyways." So the × in the
// corner, shown when you point at the card, hides it for that version
// (`closedHere`), and ⌘K still offers the restart.
//
// Shut, the sidebar has room for an icon only, so the card becomes the restart
// row's icon, with no ×.
//
// THE ICONS ARE GREY. The first drawing used the accent, which on this skin is
// a red-orange, and a red mark reads as something broken.

import type { ReactNode } from 'react';
import { NAME } from '../../../shared/product-name.mjs';
import { MOVE_SAY, SAY } from '../update-row';
import { sayWhere } from '../../../shared/where-it-runs-from.mjs';

export const SIDE_SAY = {
  title: 'New version ready',
  installing: 'Updating',
  how: 'Restarting takes about a minute.',
  changed: 'What changed:',
  close: 'Close',
  closeTip: 'Hide until the next version',
  // The move card's × hides a card about something no later version will fix,
  // so it says where the offer still is rather than when it comes back.
  moveCloseTip: 'Hide it · Settings still offers it',
} as const;

// AND THE CARD FOR A COPY THAT CANNOT UPDATE ITSELF AT ALL (w-ca1fc3ac58,
// 2026-10-12). Two installs ran 0.1.11 for a week off the disk image: they
// could not update, the app reported Squirrel's refusal as a crash every six
// hours, and nothing on the screen ever mentioned it. This is the same card
// in the same place, with the one press that fixes it for good, and the same ×
// so it can be put away. The Settings row and ⌘K keep the offer after that:
// unlike a waiting version, nothing else will ever install this one.
export function SidebarMove({ place, error = null, collapsed, rail = false, onMove, onClose }: {
  /** Which read-only place this is (shared/where-it-runs-from.mjs). */
  place: string | null;
  /** Why the last move did not work, if it did not. */
  error?: string | null;
  collapsed: boolean;
  /** The sidebar widens under the pointer: the card rises out of the row (`RailCard`). */
  rail?: boolean;
  onMove: () => void;
  onClose: () => void;
}) {
  // THE CARD SAYS THE FACT AND THE BUTTON SAYS THE FIX. The Settings row has
  // the width for both sentences; here the long one ran to six lines.
  const why = error ? `${error.replace(/\.?$/, '.')} ${MOVE_SAY.retry}` : (sayWhere(place, { short: true }) ?? MOVE_SAY.cannotUpdateHere);
  const row = <button type="button" className="sb-update-row" title={`${MOVE_SAY.button}. ${why}`} aria-label={MOVE_SAY.button} onClick={onMove}>
    <MoveIcon /><span>{MOVE_SAY.button}</span>
  </button>;

  if (rail) return <RailCard icon={<MoveIcon />} title={MOVE_SAY.title} text={why} closeTip={SIDE_SAY.moveCloseTip} onClose={onClose} row={row} />;
  if (collapsed) return row;

  return <div className="sb-update-card">
    <div className="sb-update-card-title"><MoveIcon /><span>{MOVE_SAY.title}</span></div>
    <button type="button" className="sb-update-close" aria-label={SIDE_SAY.close} title={SIDE_SAY.moveCloseTip} onClick={onClose}><CloseIcon /></button>
    <p>{why}</p>
    <button type="button" className="sb-update-go" onClick={onMove}>{MOVE_SAY.button}</button>
  </div>;
}

// A box with an arrow going into it. Grey like the restart arrow, for the
// reason at the top of this file: a red mark reads as something broken.
function MoveIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4 14v5a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-5"/><path d="M12 3.5v10"/><path d="M8.5 10 12 13.5 15.5 10"/></svg>;
}

function RestartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>;
}

/**
 * THE CARD, IN THE SIDEBAR THAT WIDENS UNDER THE POINTER.
 *
 *  The row stays where it is in the foot list and becomes the card's button;
 *  the rest of the card stands on the row's slot and grows upward, so nothing
 *  below or under the pointer moves. The markup is the same narrow and wide,
 *  and CSS hides the card while narrow (threads/pages.css).
 */
function RailCard({ icon, title, text, closeTip, changed, onClose, row }: {
  icon: ReactNode; title: string; text: string; closeTip: string; changed?: string; onClose: () => void; row: ReactNode;
}) {
  return <div className="sb-update-slot">
    <div className="sb-update-card sb-update-rise" title={changed || undefined}>
      <div className="sb-update-card-title">{icon}<span>{title}</span></div>
      <button type="button" className="sb-update-close" aria-label={SIDE_SAY.close} title={closeTip} onClick={onClose}><CloseIcon /></button>
      <p>{text}</p>
    </div>
    {row}
  </div>;
}

export function SidebarUpdate({ installing, changes = [], error = null, collapsed, rail = false, onRestart, onClose }: {
  installing: boolean;
  /** What changed, already counted (`changeLines`). Empty for an installed app. */
  changes?: string[];
  /** Why the last restart did not finish, if it did not. */
  error?: string | null;
  /** The sidebar is shut: the restart row's icon only, no ×. */
  collapsed: boolean;
  /** The sidebar widens under the pointer: the card rises out of the row (`RailCard`). */
  rail?: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  const changed = changes.length ? `${SIDE_SAY.changed}\n${changes.map((c) => `- ${c}`).join('\n')}` : '';
  const failed = error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : '';

  if (collapsed || rail) {
    const tip = installing ? SAY.installing : [failed || `${SAY.restart}. ${SIDE_SAY.how}`, changed].filter(Boolean).join('\n\n');
    const row = <button type="button" className="sb-update-row" data-installing={installing || undefined} disabled={installing}
      title={tip} aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
      <RestartIcon /><span>{installing ? SIDE_SAY.installing : SAY.restart}</span>
    </button>;
    // While it rebuilds there is nothing to press, so there is no card to rise.
    if (!rail || installing) return row;
    return <RailCard icon={<RestartIcon />} title={SIDE_SAY.title} text={failed || SIDE_SAY.how} closeTip={SIDE_SAY.closeTip} changed={changed} onClose={onClose} row={row} />;
  }

  // Pointing at it names what changed: the card is narrow, and a list of
  // commit titles would make it the tallest thing in the sidebar.
  return <div className="sb-update-card" data-installing={installing || undefined} title={changed || undefined}>
    <div className="sb-update-card-title"><RestartIcon /><span>{installing ? SIDE_SAY.installing : SIDE_SAY.title}</span></div>
    {!installing && <button type="button" className="sb-update-close" aria-label={SIDE_SAY.close} title={SIDE_SAY.closeTip} onClick={onClose}><CloseIcon /></button>}
    <p>{installing ? `${NAME} restarts by itself in about a minute.` : error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : SIDE_SAY.how}</p>
    {!installing && <button type="button" className="sb-update-go" onClick={onRestart}>{SAY.restart}</button>}
  </div>;
}
