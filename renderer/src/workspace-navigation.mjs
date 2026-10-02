// THE SIDEBAR IS ALWAYS DRAWN, THE WALK INCLUDED. The walk used to hide the
// sidebar and drew the old top tab strip instead, so
// the tutorial taught a layout nobody saw again once it ended. Since
// w-ec62ab6b38 (2026-09-28) the tutorial runs in the same window people use
// afterwards, and its tab tour rings the sidebar's own rows. The setup screens
// before it are full-window and cover the sidebar anyway.
export function workspaceNavigationShown({ inFullScreen = false, walking = false } = {}) {
  return true;
}

// THE LAST TAB'S NAME IS PART OF THE ROUND ON FINISHING (w-581dbc6cc4). The
// page title must match whatever the sidebar calls it, and "Closed" was not the
// best word. So the word comes from `done-word.ts`, where the button, the row
// hint and the palette read the same one. Of six pairs, the Done button and its
// matching name were chosen.
export function workspacePageTitle(view, doneNoun = 'Closed') {
  return { inbox: 'Inbox', snoozed: 'Scheduled', progress: 'In progress', done: doneNoun }[view] ?? 'Inbox';
}

// WHICH DESTINATIONS THE SIDEBAR DRAWS, AND IN WHAT ORDER.
//
// Scheduled used to sit second and sit there empty, which is a row that says
// nothing on the screen she reads most. It now comes after In progress and only
// when something is actually waiting for a moment.
//
// ONE EXCEPTION, AND IT IS NOT A HEDGE: the tab stays while she is standing on
// it. Waking the last deferred task takes the count to zero, and dropping the
// tab under her at that instant leaves her reading a page no row in the sidebar
// claims. She leaves Scheduled and it goes.
//
// The count is the same shape as In progress: a number when there is one and
// nothing at all when there is not.
//
// This list is also what Tab rotates through (App.tsx), so a hidden Scheduled
// is skipped rather than landed on.
export function workspaceDestinations({ scheduledCount = 0, view = 'inbox', doneNoun = 'Closed' } = {}) {
  const scheduled = Number.isFinite(scheduledCount) ? Math.max(0, Math.floor(scheduledCount)) : 0;
  return [
    ['inbox', 'Inbox'],
    ['progress', 'In progress'],
    ...(scheduled > 0 || view === 'snoozed' ? [['snoozed', 'Scheduled']] : []),
    ['done', doneNoun],
  ];
}

// WHAT THE TOP STRIP CARRIES WHILE A SEARCH IS OPEN.
//
// In the workspace layout the strip is where an opened task's title and byline
// are drawn: App.tsx renders `.workspace-task-header` there and Focus.tsx
// teleports its band into it (`headerTarget`). The search field was tested
// BEFORE that host, so opening a result took the host off the screen. The band
// then fell back to drawing inside the pane while the strip kept its 88 point
// task height with nothing in it but a field. Measured headless over a real
// store at 1440 by 940: 88 points of empty bar, then a second 79 point header
// under it, the title indented to the prose column and the chevron stranded 280
// points left of it. Two headers and 167 points for one task.
//
// So the field WAITS while a task is open. It waits rather than closes: the
// query is untouched, so escape out of the task puts her back on her results
// with what the user typed still in the box. On the list itself, where the strip has
// nothing else to carry, nothing changes at all.
export function searchFieldInStrip({ searching = false, workspaceNavigation = false, focused = false, settingsOpen = false } = {}) {
  if (!searching) return false;
  return !(workspaceNavigation && focused && !settingsOpen);
}

// THERE IS NO SECTION KEY ANY MORE (w-914b16eab6, 2026-10-02). ⌘1 to ⌘4 went
// straight to a section of the sidebar from 2026-09-23, and before that it was
// ⌘⌥ and an arrow, which a window-tiling app caught first. In progress, Later
// and Done became tabs on the Inbox page on 2026-10-01, and Tab and Shift-Tab
// move along those (App.tsx, `nextTab` in threads/page-rules). The number keys
// were removed on her word rather than left jumping through a sidebar list that
// is no longer drawn.
// tests/tab-moves-along-the-tabs-and-the-number-keys-are-gone.test.mjs.
