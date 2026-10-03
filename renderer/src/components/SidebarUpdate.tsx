// A NEW VERSION, SHOWN IN THE SIDEBAR (w-7a39dace23, 2026-10-01).
//
// The one place the app says a newer Agentbox is waiting. It used to be a row
// in the inbox, which scrolled under newer work; of three sidebar looks drawn
// (a line in the foot, a card, an icon by the team's name) the card was
// picked and the row taken out. It appears exactly when ⌘K offers the
// restart (`announcesUpdate`), and pressing it is that same restart.
//
// ONE QUIET LINE, NOT A CARD (w-23fa810982, 2026-10-02). Changes land several
// times a day, so the card was up most of the day, and a bordered box with a
// title, a sentence and a button pulled at you to restart every time. It is
// now one row in the foot list beside Settings, the same size as it, in grey,
// with no border. What the card said (how long it takes, what changed, why the
// last try failed) is in the tooltip. Shut, the sidebar hides its words the
// way it hides every row's, so the same button is the icon.
//
// THE ICON IS GREY. It was the accent on the first drawing, which on this skin
// is a red-orange, and a red mark reads as something broken.

import { SAY } from '../update-row';

export const SIDE_SAY = {
  installing: 'Updating',
  how: 'Restarting takes about a minute.',
  changed: 'What changed:',
} as const;

function RestartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>;
}

export function SidebarUpdate({ installing, changes = [], error = null, onRestart }: {
  installing: boolean;
  /** What changed, already counted (`changeLines`). Empty for an installed app. */
  changes?: string[];
  /** Why the last restart did not finish, if it did not. */
  error?: string | null;
  onRestart: () => void;
}) {
  const tip = installing ? SAY.installing : [
    error ? `${error.replace(/\.?$/, '.')} Pressing it again tries again.` : `${SAY.restart}. ${SIDE_SAY.how}`,
    changes.length ? `${SIDE_SAY.changed}\n${changes.map((c) => `- ${c}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return <button type="button" className="sb-update-row" data-installing={installing || undefined} disabled={installing}
    title={tip} aria-label={installing ? SIDE_SAY.installing : SAY.restart} onClick={onRestart}>
    <RestartIcon /><span>{installing ? SIDE_SAY.installing : SAY.restart}</span>
  </button>;
}
