// WHAT THE PHONE HAS OF EVERYTHING THE DESKTOP DOES BY NAME.
//
// Every key is a desktop feature that scripts/lib/desktop-features.mjs reads
// out of the desktop's code: a ⌘K row (`palette:`), a command on a thread
// (`thread:`), a Settings page or a row Settings search finds. Each one says
// one of three things:
//
//   { phone, find }       the phone has it: `find` is text in the file `phone`
//                         that is the feature, so the claim breaks when it goes.
//   { phone, find, still } the phone has part of it; `still` says what is not there.
//   { desktopOnly }       why a phone should not have it.
//   { missing }           not on the phone yet, and what it would take.
//
// tests/the-phone-app-has-every-desktop-feature-or-says-why-not.test.mjs fails
// on a desktop feature this file does not name, on a claim whose text is gone,
// and when the count of `missing` and `still` is not STILL_TO_DO. Lower that
// number when a gap closes; it is never raised to let a new desktop feature in.

const MAC = 'about the desktop app itself on this computer (its window, keys, updates or disk)';
const KEYS = 'a keyboard shortcut, and a phone has no keyboard to learn';
const SELLS = 'the phone app sells nothing, so the App Store takes no cut (guideline 3.1)';
const SECRET = 'keys and tokens stay off the phone and out of the cloud copy';

const P = 'mobile/src/lib/palette.ts';
const MENU = 'mobile/src/ui/ThreadMenu.tsx';
const THREAD = 'mobile/src/app/thread/[product]/[id].tsx';
const ACTS = 'mobile/src/lib/actions.ts';
const SET = 'mobile/src/ui/SettingsPages.tsx';
const FILTERS = 'mobile/src/ui/Filters.tsx';

export const PARITY = {
  // ⌘K
  'palette:new-project': { missing: 'a setting the computer honours that makes a project' },
  'palette:new-thread': { phone: P, find: "label: 'New thread'" },
  'palette:filter': { phone: P, find: "id: 'filter'", still: 'no Claude or Codex filter' },
  'palette:clear-filter': { phone: FILTERS, find: 'Clear filters' },
  'palette:end-tutorial': { desktopOnly: 'the tutorial runs on the computer only' },
  'palette:projects-page': { phone: SET, find: "id: 'projects'", still: 'no order, rename or archive' },
  'palette:search': { phone: 'mobile/src/app/search.tsx', find: 'placeholder="Search"' },
  'palette:cloud-toggle': { missing: 'cloudRuns in the settings copy and the WORKSPACE list' },
  'palette:cloud-*': { missing: 'cloudRuns in the settings copy and the WORKSPACE list' },
  'palette:view-groups': { phone: P, find: "id: 'chats'" },
  'palette:view-connections': { missing: 'the computer sending which connections are signed in' },
  'palette:view-teammates': { phone: P, find: 'mate-${t.id}', still: 'one chat per teammate, no shared team chat' },
  'palette:new-teammate': { phone: P, find: "id: 'new-mate'" },
  'palette:update': { desktopOnly: MAC },
  'palette:update-move': { desktopOnly: MAC },
  'palette:update-check': { desktopOnly: MAC },
  'palette:stale': { desktopOnly: MAC },
  'palette:pause': { missing: 'the pause in the settings copy and a workspace key for zero:supervisor-pause' },
  'palette:resume-stopped': { missing: 'a workspace key for zero:resume-agents' },
  'palette:standing': { missing: 'instruction text is kept out of the cloud on purpose; putting it on the phone is a privacy decision' },
  'palette:usage': { phone: SET, find: "key: 'activeAccount'", still: 'which account, but not how much of the week is left' },
  'palette:settings': { phone: P, find: 'page-${p.id}' },
  'palette:shortcuts': { desktopOnly: KEYS },
  'palette:flip-view': { phone: FILTERS, find: 'label="Board"' },
  'palette:import-agents': { desktopOnly: 'it reads Claude Code and Codex chats off the computer\'s disk' },
  'palette:tutorial': { desktopOnly: 'the tutorial runs on the computer only' },
  'palette:first-run': { desktopOnly: 'it sets up the computer' },
  'palette:keyhints': { desktopOnly: KEYS },
  'palette:rank-*': { missing: 'the project order in the copy and a key for zero:set-product-order' },
  'palette:group-*': { phone: P, find: 'group-${g.id}' },
  'palette:team-list-*': { missing: 'What shipped this week and Decisions, as phone screens' },
  'palette:files-*': { missing: 'an index of the team\'s files carried to the phone' },
  'palette:teammate-*': { phone: P, find: 'mate-${t.id}' },
  'palette:teammate-pause-*': { phone: 'mobile/src/app/teammate/[id].tsx', find: "askTeammate('pause'", still: 'not in the command list' },
  'palette:view-inbox': { phone: P, find: "id: 'inbox'" },
  'palette:view-progress': { phone: P, find: "id: 'progress'" },
  'palette:view-later': { phone: P, find: "id: 'later'" },
  'palette:view-done': { phone: P, find: "id: 'done'" },
  'palette:theme-light': { phone: P, find: 'look-${l.id}' },
  'palette:theme-dark': { phone: P, find: 'look-${l.id}' },
  'palette:theme-match': { phone: P, find: 'look-${l.id}' },

  // A thread
  'thread:done': { phone: MENU, find: 'label="Close this thread"' },
  'thread:snooze': { phone: MENU, find: 'onLater(row.ts, row.label)' },
  'thread:unsnooze': { phone: MENU, find: 'if (row.now) onBack()' },
  'thread:read': { phone: 'mobile/src/lib/unread.ts', find: 'export function markSeen' },
  'thread:unread': { phone: MENU, find: 'label="Mark unread"' },
  'thread:resume': { missing: 'resume on ticked rows (a thread setting for zero:resume-items)' },
  'thread:remote-control': { desktopOnly: 'it hands the computer\'s own session to Claude\'s app' },
  'thread:open-terminal': { desktopOnly: 'a terminal on the computer' },
  'thread:approve': { phone: THREAD, find: "kind: 'approve-filed'", still: 'only proposals filed from a thread' },
  'thread:reopen': { missing: 'a Reopen row on a closed thread (the reopen command exists)' },
  'thread:close-task': { missing: 'closing a given task for both people' },
  'thread:reply': { phone: ACTS, find: "kind: 'reply'" },
  'thread:try-again': { missing: 'a thread setting for zero:resume-items' },
  'thread:resume-any': { missing: 'a thread setting for zero:resume-items' },
  'thread:move-refused': { missing: 'Move to another project, and why it cannot' },
  'thread:move-*': { missing: 'a thread setting for zero:move-item' },
  'thread:stop': { phone: THREAD, find: "'Stop this agent'" },
  'thread:send-back': { phone: ACTS, find: "kind: 'send-back'" },
  'thread:redeliver': { missing: 'a thread setting for zero:redeliver' },
  'thread:open': { phone: THREAD, find: 'useLocalSearchParams<{ product: string; id: string }>' },
  'thread:wait-stop': { missing: 'a thread setting for blockedBy' },
  'thread:wait-*': { missing: 'a thread setting for blockedBy' },
  'thread:decide': { missing: 'saving an answer as a decision, which is a team-room call' },
  'thread:shipped': { missing: 'a thread setting for shippedAt' },
  'thread:see-team': { missing: 'a thread setting for visibility' },
  'thread:see-people': { missing: 'a thread setting for visibility and visibleTo' },
  'thread:see-private': { missing: 'a thread setting for visibility' },
  'thread:pin': { phone: MENU, find: "'Pin thread'" },
  'thread:rename': { missing: 'a thread setting for label' },
  'thread:summary': { phone: THREAD, find: 'function Summary(' },
  'thread:code': { missing: 'the code change carried in the phone copy' },
  'thread:place': { phone: MENU, find: 'label="Move to cloud"', still: 'no Keep on this computer' },
  'thread:end-repeat': { phone: 'mobile/src/app/repeat/[product]/[id].tsx', find: 'label="End it"', still: 'not from the thread itself' },
  'thread:add-people': { missing: 'adding people to a thread' },
  'thread:route-*': { missing: 'routing a thread to an agent or to you' },
  'thread:give-*': { missing: 'giving a thread to a teammate' },
  'thread:run-now': { phone: MENU, find: 'label="Run now"' },
  'thread:priority-*': { phone: THREAD, find: "'priority' | 'mode' | 'model'", still: 'only with a reply, not on its own' },
  'thread:model-*': { phone: THREAD, find: "'priority' | 'mode' | 'model'", still: 'only with a reply, and no switch between Claude and Codex' },

  // Settings pages
  'settings-page:general': { phone: SET, find: "id: 'general'" },
  'settings-page:appearance': { phone: SET, find: "id: 'appearance'" },
  'settings-page:shortcuts': { desktopOnly: KEYS },
  'settings-page:phone': { phone: SET, find: "id: 'phone'" },
  'settings-page:alpha': { phone: SET, find: "id: 'alpha'" },
  'settings-page:claude': { phone: SET, find: "id: 'claude'" },
  'settings-page:codex': { phone: SET, find: "id: 'codex'" },
  'settings-page:running': { phone: SET, find: "id: 'running'" },
  'settings-page:instructions': { phone: SET, find: "id: 'instructions'", still: 'ADHD mode only; the instruction text stays on the computer' },
  'settings-page:projects': { phone: SET, find: "id: 'projects'" },
  'settings-page:team': { phone: SET, find: "id: 'team'" },
  'settings-page:rooms': { missing: 'a Rooms page writing your card and name to the team cloud' },
  'settings-page:cloud': { desktopOnly: SELLS },

  // Rows Settings search finds
  'settings:general/Your account': { phone: SET, find: 'Signed in as' },
  'settings:general/Public links': { missing: 'the computer\'s public links in the copy, and a way to stop one' },
  'settings:general/Show keyboard shortcut hints': { desktopOnly: KEYS },
  'settings:general/Shrink the sidebar to icons': { desktopOnly: MAC },
  'settings:general/Counts and crash reports': { phone: SET, find: 'label="Counts and crash reports"' },
  'settings:general/Where things are kept': { desktopOnly: MAC },
  'settings:general/Check for updates': { desktopOnly: MAC },
  'settings:appearance/Theme': { phone: SET, find: '<Group label="Theme">' },
  'settings:appearance/Blur and darkness': { desktopOnly: 'it tunes the desktop window\'s glass over a picture' },
  'settings:shortcuts/Keyboard shortcuts': { desktopOnly: KEYS },
  'settings:phone/Use it on your phone': { phone: SET, find: 'label="Projects on your phone"' },
  'settings:phone/Connected devices': { desktopOnly: 'pairing a phone happens on the computer' },
  'settings:alpha/Rooms': { phone: SET, find: 'label="Rooms"' },
  'settings:rooms/Show my full name': { missing: 'a Rooms page' },
  'settings:rooms/What you are working on': { missing: 'a Rooms page' },
  'settings:rooms/Your activity on your page': { missing: 'a Rooms page' },
  'settings:rooms/Go invisible': { missing: 'a Rooms page' },
  'settings:claude/Usage': { missing: 'the usage meters in the settings copy' },
  'settings:claude/Signed in': { phone: SET, find: "key: 'activeAccount'" },
  'settings:claude/Cloud accounts': { missing: 'the cloud\'s accounts in the copy' },
  'settings:claude/Keys for cloud threads': { desktopOnly: SECRET },
  'settings:claude/Permission mode': { phone: SET, find: "key: 'permission'" },
  'settings:codex/Usage': { missing: 'the usage meters in the settings copy' },
  'settings:codex/Signed in': { phone: SET, find: "key: 'activeAccount'" },
  'settings:codex/Cloud accounts': { missing: 'the cloud\'s accounts in the copy' },
  'settings:codex/Permission mode': { phone: SET, find: "key: 'codexMode'" },
  'settings:cloud/Your plan': { desktopOnly: SELLS },
  'settings:cloud/This month': { desktopOnly: SELLS },
  'settings:cloud/Change plan': { desktopOnly: SELLS },
  'settings:running/How many run at once': { phone: SET, find: 'label="How many run at once"' },
  'settings:running/Hold heavy work when memory is short': { phone: SET, find: 'label="Hold heavy work when memory is short"' },
  'settings:running/Stop programs agents leave behind': { phone: SET, find: 'label="Stop programs agents leave behind"' },
  'settings:running/Something felt slow': { phone: SET, find: 'label="Something felt slow"' },
  'settings:running/Agents you started yourself': { phone: SET, find: '<Group label="Agents you started yourself">' },
  'settings:running/Bring in new chats': { phone: SET, find: 'label="Bring in new chats"' },
  'settings:instructions/Instructions for every agent': { missing: 'instruction text is kept out of the cloud on purpose; putting it on the phone is a privacy decision' },
  'settings:projects/Projects': { phone: SET, find: "id: 'projects'", still: 'no order, rename or archive' },
  'settings:team/Team': { phone: 'mobile/src/ui/TeamPage.tsx', find: 'inviteTo' },
};

export const STILL_TO_DO = 53;
