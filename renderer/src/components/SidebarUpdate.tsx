// A NEW VERSION, SHOWN IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The one place the app says a newer Agentbox is waiting. It used to be a row
// in the inbox, which scrolled under newer work; of three sidebar looks drawn
// (a line in the foot, this card, an icon by the team's name) she picked the
// card and had the row taken out. It appears exactly when ⌘K offers the
// restart (`announcesUpdate`), and pressing it is that same restart.
//
// THE ICON IS GREY. It was the accent on the first drawing, which on this skin
// is a red-orange, and it read as "there's a bug". The card's border is what
// makes it stand out; nothing here wears an alarm colour.
//
// Shut, the sidebar has room for an icon only, so the card becomes its icon.

import { NAME } from '../../../shared/product-name.mjs';
import { SAY } from '../update-row';

export const SIDE_SAY = {
  title: 'New version ready',
  installing: 'Updating',
  how: 'Restarting takes about a minute.',
  changed: 'What changed:',
} as const;

function RestartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>;
}

export function SidebarUpdate({ collapsed, installing, changes = [], error = null, onRestart }: {
  collapsed: boolean; installing: boolean;
  /** What changed, already counted (`changeLines`). Empty for an installed app. */
  changes?: string[];
  /** Why the last restart did not finish, if it did not. */
  error?: string | null;
  onRestart: () => void;
}) {
  // Pointing at it names what changed: the card is narrow, and a list of
  // commit titles would make it the tallest thing in the sidebar.
  const tip = changes.length ? `${SIDE_SAY.changed}\n${changes.map((c) => `- ${c}`).join('\n')}` : undefined;
  if (collapsed) {
    return <button type="button" className="sb-update-icon" data-installing={installing || undefined} disabled={installing}
      title={installing ? SAY.installing : `${SAY.restart}. ${SIDE_SAY.how}${tip ? `\n\n${tip}` : ''}`}
      aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
      <RestartIcon />
    </button>;
  }
  return <div className="sb-update-card" data-installing={installing || undefined} title={tip}>
    <div className="sb-update-card-title"><RestartIcon /><span>{installing ? SIDE_SAY.installing : SIDE_SAY.title}</span></div>
    <p>{installing ? `${NAME} restarts by itself in about a minute.` : error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : SIDE_SAY.how}</p>
    {!installing && <button type="button" onClick={onRestart}>{SAY.restart}</button>}
  </div>;
}
