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
const OFFERS = 'mobile/src/lib/thread-offers.ts';
const PROJECT = 'mobile/src/app/settings/project/[slug].tsx';
const ROOMS = 'mobile/src/lib/rooms-settings.ts';

export const PARITY = {
  // ⌘K
  'palette:new-project': { missing: 'a setting the computer honours that makes a project' },
  'palette:new-thread': { phone: P, find: "label: 'New thread'" },
  'palette:filter': { phone: FILTERS, find: 'label="Agent"' },
  'palette:clear-filter': { phone: FILTERS, find: 'Clear filters' },
  'palette:end-tutorial': { desktopOnly: 'the tutorial runs on the computer only' },
  'palette:projects-page': { phone: PROJECT, find: 'title="Rank first"', still: 'no new project, and no bringing an archived one back' },
  'palette:cloud-toggle': { phone: SET, find: 'label="Use the cloud"' },
  'palette:cloud-*': { phone: SET, find: 'label="Use the cloud"' },
  'palette:view-home': { desktopOnly: 'the Home page is on the computer only' },
  'palette:view-groups': { phone: P, find: "id: 'chats'" },
  'palette:view-connections': { missing: 'the computer sending which connections are signed in' },
  'palette:view-teammates': { phone: P, find: 'mate-${t.id}', still: 'one chat per teammate, no shared team chat' },
  'palette:new-teammate': { phone: P, find: "id: 'new-mate'" },
  'palette:update': { desktopOnly: MAC },
  'palette:update-move': { desktopOnly: MAC },
  'palette:update-check': { desktopOnly: MAC },
  'palette:stale': { desktopOnly: MAC },
  'palette:pause': { phone: P, find: "id: 'pause'" },
  'palette:resume-stopped': { phone: P, find: "id: 'resume-stopped'" },
  'palette:standing': { missing: 'instruction text is kept out of the cloud on purpose; putting it on the phone is a privacy decision' },
  'palette:usage': { phone: P, find: "id: 'usage'" },
  'palette:settings': { phone: P, find: 'page-${p.id}' },
  'palette:shortcuts': { desktopOnly: KEYS },
  'palette:flip-view': { phone: FILTERS, find: 'label="Board"' },
  'palette:import-agents': { desktopOnly: 'it reads Claude Code and Codex chats off the computer\'s disk' },
  'palette:tutorial': { desktopOnly: 'the tutorial runs on the computer only' },
  'palette:first-run': { desktopOnly: 'it sets up the computer' },
  'palette:keyhints': { desktopOnly: KEYS },
  'palette:rank-*': { phone: P, find: 'Rank ${p.name} first' },
  'palette:group-*': { phone: P, find: 'group-${g.id}' },
  'palette:team-list-*': { phone: P, find: 'team-list-shipped', still: 'What shipped this week, but not Decisions, which the phone does not read' },
  'palette:files-*': { missing: 'an index of the team\'s files carried to the phone' },
  'palette:teammate-*': { phone: P, find: 'mate-${t.id}' },
  'palette:teammate-pause-*': { phone: P, find: 'teammate-pause-${t.id}' },
  'palette:view-inbox': { phone: P, find: "id: 'inbox'" },
  'palette:view-progress': { phone: P, find: "id: 'progress'" },
  'palette:view-later': { phone: P, find: "id: 'later'" },
  'palette:view-done': { phone: P, find: "id: 'done'" },
  'palette:theme-light': { phone: P, find: 'look-${l.id}' },
  'palette:theme-dark': { phone: P, find: 'look-${l.id}' },
  'palette:theme-match': { phone: P, find: 'look-${l.id}' },
  'palette:theme-sky-*': { missing: 'the sky themes behind the desktop\'s Home and Inbox (an Alpha feature); the phone has neither the skies nor Home' },

  // A thread
  'thread:done': { phone: MENU, find: 'label="Close this thread"' },
  'thread:snooze': { phone: MENU, find: 'onLater(row.ts, row.label)' },
  'thread:unsnooze': { phone: MENU, find: 'if (row.now) onBack()' },
  'thread:read': { phone: 'mobile/src/lib/unread.ts', find: 'export function markSeen' },
  'thread:unread': { phone: MENU, find: 'label="Mark unread"' },
  'thread:resume': { phone: 'mobile/src/app/index.tsx', find: 'label="Resume agents"' },
  'thread:remote-control': { desktopOnly: 'it hands the computer\'s own session to Claude\'s app' },
  'thread:open-terminal': { desktopOnly: 'a terminal on the computer' },
  'thread:approve': { phone: THREAD, find: "kind: 'approve-filed'", still: 'only proposals filed from a thread' },
  'thread:reopen': { phone: MENU, find: 'label="Reopen"' },
  'thread:close-task': { missing: 'closing a given task for both people' },
  'thread:reply': { phone: ACTS, find: "kind: 'reply'" },
  'thread:try-again': { phone: MENU, find: 'label="Try again"' },
  'thread:resume-any': { phone: MENU, find: 'Resume this agent (reopen and carry on)' },
  'thread:move-refused': { phone: OFFERS, find: 'whyItCannotMove(item' },
  'thread:move-*': { phone: MENU, find: 'label="Move to another project"' },
  'thread:stop': { phone: THREAD, find: "'Stop this agent'" },
  'thread:send-back': { phone: ACTS, find: "kind: 'send-back'" },
  'thread:redeliver': { phone: MENU, find: 'Restart the agent (it stopped)' },
  'thread:open': { phone: THREAD, find: 'useLocalSearchParams<{ product: string; id: string }>' },
  'thread:wait-stop': { missing: 'a thread setting for blockedBy' },
  'thread:wait-*': { missing: 'a thread setting for blockedBy' },
  'thread:decide': { missing: 'saving an answer as a decision, which is a team-room call' },
  'thread:shipped': { missing: 'the computer takes it; the phone copy of a thread does not say whether it is a team thread or shipped' },
  'thread:see-team': { missing: 'the computer takes it; the phone copy of a thread does not say who can see it' },
  'thread:see-people': { missing: 'the phone copy of a thread does not say who can see it, nor list the people to pick' },
  'thread:see-private': { missing: 'the computer takes it; the phone copy of a thread does not say who can see it' },
  'thread:pin': { phone: MENU, find: "'Pin thread'" },
  'thread:rename': { phone: MENU, find: 'label="Rename"' },
  'thread:summary': { phone: THREAD, find: 'function Summary(' },
  'thread:code': { missing: 'the code change carried in the phone copy' },
  'thread:place': { phone: OFFERS, find: "'Keep on your computer'" },
  'thread:end-repeat': { phone: MENU, find: 'label="Stop repeating"' },
  'thread:add-people': { missing: 'adding people to a thread' },
  'thread:route-*': { missing: 'routing a thread to an agent or to you' },
  'thread:give-*': { missing: 'giving a thread to a teammate' },
  'thread:run-now': { phone: MENU, find: 'label="Run now"' },
  'thread:priority-*': { phone: MENU, find: 'label="Priority"' },
  'thread:model-*': { phone: 'mobile/src/ui/Pickers.tsx', find: '<SheetHead>Agent</SheetHead>', still: 'the model and agent ride a reply; the desktop also sets them without one' },

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
  'settings-page:files': { desktopOnly: MAC },
  'settings-page:team': { phone: SET, find: "id: 'team'" },
  'settings-page:rooms': { phone: SET, find: "id: 'rooms'", still: 'no picture of how your room sees your card' },
  'settings-page:cloud': { desktopOnly: SELLS },

  // Rows Settings search finds
  'settings:general/Your account': { phone: 'mobile/src/ui/SettingsHome.tsx', find: 'title="Sign out"' },
  'settings:general/Public links': { phone: SET, find: '<Group label="Public links">' },
  'settings:general/Show keyboard shortcut hints': { desktopOnly: KEYS },
  'settings:general/Shrink the sidebar to icons': { desktopOnly: MAC },
  'settings:general/Counts and crash reports': { phone: SET, find: 'label="Counts and crash reports"' },
  'settings:general/Where things are kept': { desktopOnly: MAC },
  'settings:general/Check for updates': { desktopOnly: MAC },
  'settings:appearance/Theme': { phone: SET, find: '<Group label="Theme">' },
  'settings:appearance/Blur and darkness': { desktopOnly: 'it tunes the desktop window\'s glass over a picture' },
  'settings:shortcuts/Keyboard shortcuts': { desktopOnly: KEYS },
  'settings:phone/Use it on your phone': { phone: SET, find: 'label="Projects on your phone"' },
  'settings:alpha/Rooms': { phone: SET, find: 'label="Rooms"' },
  'settings:rooms/Show my full name': { phone: ROOMS, find: "'Show my full name', full" },
  'settings:rooms/What you are working on': { phone: ROOMS, find: "'What you are working on', working" },
  'settings:rooms/Your activity on your page': { phone: ROOMS, find: "'Your activity on your page', me.show_activity" },
  'settings:rooms/Go invisible': { phone: ROOMS, find: "'Go invisible', !!invisible" },
  'settings:claude/Usage': { phone: SET, find: '<Meters meters={meterPair(a.usage?.limits' },
  'settings:claude/Signed in': { phone: SET, find: "key: 'activeAccount'" },
  'settings:claude/Cloud accounts': { phone: SET, find: 'cloudOnlyAccounts(w, engine)' },
  'settings:claude/Keys for cloud threads': { desktopOnly: SECRET },
  'settings:claude/Permission mode': { phone: SET, find: "key: 'permission'" },
  'settings:codex/Usage': { phone: SET, find: '<Meters meters={meterPair(a.usage?.limits' },
  'settings:codex/Signed in': { phone: SET, find: "key: 'activeAccount'" },
  'settings:codex/Cloud accounts': { phone: SET, find: 'cloudInUseName(s.settings!.workspace, engine)' },
  'settings:codex/Permission mode': { phone: SET, find: "key: 'codexMode'" },
  'settings:files/Keep files in the cloud': { desktopOnly: MAC },
  'settings:files/Take big files off this computer': { desktopOnly: MAC },
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
  'settings:projects/Projects': { phone: PROJECT, find: 'label="Archive this project"', still: 'no new project, and no bringing an archived one back' },
  'settings:team/Team': { phone: 'mobile/src/ui/TeamPage.tsx', find: 'inviteTo' },
};

// 26 from 25 once, on 2026-11-09: the skies reached the desktop on main before this check did.
export const STILL_TO_DO = 26;
