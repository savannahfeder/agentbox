// A NEW VERSION, SHOWN IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The one place the app says a newer Agentbox is waiting. It used to be a row
// in the inbox, which scrolled under newer work; of three sidebar looks drawn
// (a line in the foot, a card, an icon by the team's name) the card was
// picked and the row taken out. It appears exactly when ⌘K offers the
// restart (`announcesUpdate`), and pressing it is that same restart.
//
// A CARD YOU CAN SHRINK TO ONE LINE (w-23fa810982, 2026-10-02). Changes land
// several times a day, so the card was up most of the day and pulled at you
// to restart. Replacing it with one grey line went too far: "we still want
// the big sign, but we wanted it to be condensable to be chiller". So the card
// is the default, and a small button on its corner, shown when you point at
// it, shrinks it to one row in the foot list beside Settings: grey, no border,
// what the card said kept in the tooltip. The row has the same small button to
// bring the card back. The choice is remembered (`readUpdateSmall`).
//
// Shut, the sidebar hides every row's words, so the update is the row's icon,
// card or not, and neither small button is drawn.
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
  shrink: 'Shrink to one line',
  grow: 'Show the full card',
} as const;

function RestartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>;
}

function ShrinkIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 12h12"/></svg>;
}

function GrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6"/></svg>;
}

export function SidebarUpdate({ installing, changes = [], error = null, small, collapsed, onRestart, onSmall }: {
  installing: boolean;
  /** What changed, already counted (`changeLines`). Empty for an installed app. */
  changes?: string[];
  /** Why the last restart did not finish, if it did not. */
  error?: string | null;
  /** Shrunk to one line by its own small button. */
  small: boolean;
  /** The sidebar is shut: the row's icon only, no small buttons. */
  collapsed: boolean;
  onRestart: () => void;
  onSmall: (small: boolean) => void;
}) {
  const changed = changes.length ? `${SIDE_SAY.changed}\n${changes.map((c) => `- ${c}`).join('\n')}` : '';

  if (!small && !collapsed) {
    // Pointing at it names what changed: the card is narrow, and a list of
    // commit titles would make it the tallest thing in the sidebar.
    return <div className="sb-update-card" data-installing={installing || undefined} title={changed || undefined}>
      <div className="sb-update-card-title"><RestartIcon /><span>{installing ? SIDE_SAY.installing : SIDE_SAY.title}</span></div>
      <button type="button" className="sb-update-shrink" aria-label={SIDE_SAY.shrink} title={SIDE_SAY.shrink} onClick={() => onSmall(true)}><ShrinkIcon /></button>
      <p>{installing ? `${NAME} restarts by itself in about a minute.` : error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : SIDE_SAY.how}</p>
      {!installing && <button type="button" className="sb-update-go" onClick={onRestart}>{SAY.restart}</button>}
    </div>;
  }

  const tip = installing ? SAY.installing : [
    error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : `${SAY.restart}. ${SIDE_SAY.how}`,
    changed,
  ].filter(Boolean).join('\n\n');
  const row = <button type="button" className="sb-update-row" data-installing={installing || undefined} disabled={installing}
    title={tip} aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
    <RestartIcon /><span>{installing ? SIDE_SAY.installing : SAY.restart}</span>
  </button>;
  if (collapsed) return row;
  return <div className="sb-update-small">
    {row}
    <button type="button" className="sb-update-grow" aria-label={SIDE_SAY.grow} title={SIDE_SAY.grow} onClick={() => onSmall(false)}><GrowIcon /></button>
  </div>;
}
