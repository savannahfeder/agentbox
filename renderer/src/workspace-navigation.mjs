// THE SIDEBAR IS DRAWN UNLESS THE WALK IS RUNNING. `restBarUp` was the other
// reason and it went with the rest screen on 2026-09-22 (w-030026f226): that
// screen put a bar of its own across the top and the sidebar had to stand down
// for it. Nothing else in the app takes the window that way.
export function workspaceNavigationShown({ inFullScreen = false, walking = false }) {
  return !walking;
}

export function workspacePageTitle(view) {
  return { inbox: 'Inbox', snoozed: 'Scheduled', progress: 'In progress', done: 'Closed' }[view] ?? 'Inbox';
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
export function workspaceDestinations({ scheduledCount = 0, view = 'inbox' } = {}) {
  const scheduled = Number.isFinite(scheduledCount) ? Math.max(0, Math.floor(scheduledCount)) : 0;
  return [
    ['inbox', 'Inbox'],
    ['progress', 'In progress'],
    ...(scheduled > 0 || view === 'snoozed' ? [['snoozed', 'Scheduled']] : []),
    ['done', 'Closed'],
  ];
}

// WHAT THE TOP STRIP CARRIES WHILE A SEARCH IS OPEN.
//
// In the workspace layout the strip is where an opened task's title and byline
// are drawn: App.tsx renders `.workspace-task-header` there and Focus.tsx
// teleports its band into it (`headerTarget`). The search field was tested
// BEFORE that host, so opening a result took the host off the screen. The band
// then fell back to drawing inside the pane while the strip kept its 88 point
// task height with nothing in it but a field. Measured headless over her own
// store at 1440 by 940: 88 points of empty bar, then a second 79 point header
// under it, the title indented to the prose column and the chevron stranded 280
// points left of it. Two headers and 167 points for one task.
//
// So the field WAITS while a task is open. It waits rather than closes: the
// query is untouched, so escape out of the task puts her back on her results
// with what she typed still in the box. On the list itself, where the strip has
// nothing else to carry, nothing changes at all.
export function searchFieldInStrip({ searching = false, workspaceNavigation = false, focused = false, settingsOpen = false } = {}) {
  if (!searching) return false;
  return !(workspaceNavigation && focused && !settingsOpen);
}

// WHICH SECTION A KEY ASKS FOR, COUNTING FROM ONE. 0 means this key is not one
// of ours.
//
// IT WAS ⌘⌥↑ AND ⌘⌥↓ UNTIL 2026-09-23 AND SHE TOOK BOTH APART, for two reasons
// that are each enough on their own: "3 keys is just a bit much. That actually
// activates my tile application, which moves the application around different
// parts of the screen and makes it jump." A shortcut that moves her WINDOW
// while she is trying to move between sections is worse than no shortcut, and
// nothing in this app can see that collision happen.
//
// SO IT IS ⌘1 TO ⌘4, WHICH IS TWO KEYS AND GOES STRAIGHT THERE. She said one
// key is too little and three too many, and named what she actually does with
// it: "I'm always jumping between inbox and in progress." Cycling makes that
// two presses in one direction and three in the other, and the count changes
// when Scheduled appears and disappears. ⌘1 and ⌘2 are always the same two
// keys for the same two places, which is the thing she is doing.
//
// ⌘1..⌘4 ARE FREE AND THIS IS NOT A COLLISION. They used to set priority and
// that was removed on her word; shortcuts.ts already carries the note saying
// the handler no longer fires.
//
// IT IS THE POSITION IN THE LIST, NOT THE NAME. `workspaceDestinations` drops
// Scheduled when nothing is deferred, so ⌘3 is Scheduled on a day she has
// something scheduled and Closed on a day she has not. That is the same list
// the sidebar is drawing, in the same order, so the number always means the
// row she can see in that position.
export function sidebarSlot(e) {
  if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.repeat || e.defaultPrevented) return 0;
  return /^[1-4]$/.test(e.key) ? Number(e.key) : 0;
}
