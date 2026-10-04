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

import { NAME } from '../../../shared/product-name.mjs';
import { SAY } from '../update-row';

export const SIDE_SAY = {
  title: 'New version ready',
  installing: 'Updating',
  how: 'Restarting takes about a minute.',
  changed: 'What changed:',
  close: 'Close',
  closeTip: 'Hide until the next version',
} as const;

function RestartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>;
}

export function SidebarUpdate({ installing, changes = [], error = null, collapsed, onRestart, onClose }: {
  installing: boolean;
  /** What changed, already counted (`changeLines`). Empty for an installed app. */
  changes?: string[];
  /** Why the last restart did not finish, if it did not. */
  error?: string | null;
  /** The sidebar is shut: the restart row's icon only, no ×. */
  collapsed: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  const changed = changes.length ? `${SIDE_SAY.changed}\n${changes.map((c) => `- ${c}`).join('\n')}` : '';

  if (collapsed) {
    const tip = installing ? SAY.installing : [
      error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : `${SAY.restart}. ${SIDE_SAY.how}`,
      changed,
    ].filter(Boolean).join('\n\n');
    return <button type="button" className="sb-update-row" data-installing={installing || undefined} disabled={installing}
      title={tip} aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
      <RestartIcon /><span>{installing ? SIDE_SAY.installing : SAY.restart}</span>
    </button>;
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
