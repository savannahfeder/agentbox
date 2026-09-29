import type { View } from '../types';
// HAIRLINE, her pick of five (w-6c5534a58d, 2026-09-26): "I think that Hairline
// does look really good." Drawn at 1.25 on a 24 grid with rounded corners so the
// tabs sit at the same weight as the plus and the magnifier she picked in August;
// the old 1.5 set next to those read as two icon sets mixed together.
//
// Closed is the stack, a pile of finished cards: "Closed is the stack. That is
// approved." (09-26). Not a box ("the closed-eye icon") and not a tick, both of
// which she turned down; the history and logbook glyphs lost the same round.
export function SidebarIcon({ view }: { view: View }) {
  return <svg className="workspace-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {view === 'inbox' && <><path d="M4.5 13.2 6.7 6.4A2 2 0 0 1 8.6 5h6.8a2 2 0 0 1 1.9 1.4l2.2 6.8V17a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M4.5 13.2h4.1l1.1 2.1h4.6l1.1-2.1h4.1"/></>}
    {view === 'snoozed' && <><rect x="4.5" y="5.5" width="15" height="14" rx="3"/><path d="M8.5 3.8V7M15.5 3.8V7M4.5 10h15"/><circle cx="15.2" cy="15" r="1.1" fill="currentColor" stroke="none"/></>}
    {view === 'progress' && <><path d="M12 4.5a7.5 7.5 0 1 1-7.5 7.5"/><path d="M4.5 12A7.5 7.5 0 0 1 12 4.5" opacity=".3"/></>}
    {view === 'done' && <><rect x="4.5" y="10" width="15" height="9.5" rx="2"/><path d="M6.5 7h11M8.5 4.5h7"/></>}
  </svg>;
}
