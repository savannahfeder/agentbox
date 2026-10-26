# Rooms (alpha): the build plan

Status: agreed with Codex after four review passes, 2026-10-20 (reviews at the
end). Thread w-3d0fa23ffb.

The approved design is round 23 in the thread's designs folder (`round-23.html`).
Everything in it is the target; this file says how to build it and in what order.

## What it is, in one paragraph

A room is a place where people who work with agents can see each other working.
It is a page of its own, reached from the Rooms page: a wall of cards, one per person
(face, name, level, the short name of what they are working on, how many agents
are running), with the room's chat beside it. Your team is a room. You can be in
other rooms too, including public ones like General, and invite friends by link.
Every chat you open full page (a room's, a group's, a direct one) opens on one
messages page: your conversations listed on the left, the open one beside them.
Your level comes from agent hours. Ranks are weekly. You can go invisible.

## Decisions already made by the founder (do not reopen)

- The wall: four across, 64px face, name with a faint level number, one line of
  work cut with "…", the "N agents working" lattice line. One shared grid, every
  line drawn once. Nobody greys out. Initials on one grey tile for everyone.
- The chat panel: faces in the name line, no header above messages beyond the
  room switcher. Chats run top-down everywhere: a short chat starts at the top;
  once it is full the newest message sits just above the box you type in.
- Sidebar and tabs, replaced 2026-10-21 (w-a0429b3d5e): the folding Rooms list,
  its New room row, pins, and room tabs after Done all went, because a tab that
  came and went and a busy sidebar made rooms confusing. The sidebar has one
  Rooms row under Messages. It opens the Rooms page, which lists the rooms you
  are in the way the threads table lists threads (people, agents working, last
  message, an unread dot) with New room in the top bar and Find rooms to join
  under the list. Pointing at a row shows dots for the room menu (Mark as read
  or unread, Invite people, Members, Ranks this week, Mute, Leave). A room opens
  as a page with a back arrow to the Rooms page, and Threads keeps its four tabs.
  Since 2026-10-22 (w-49cd37092c) one room sits after Done: the first pinned or
  first room until you pick, with an arrow that opens "Room in this tab" (each
  room, and No room tab). A room's menu has Show in the Threads tab.
- The chat beside a room is 41% of it (480px at 1440) until you drag its left
  edge, from 300 to 720, always leaving the board its three columns; the width
  is kept and a double-click puts it back (2026-10-23). The faces over the board
  go to even rows when eight no longer fit.
- Invite: on the room row, in the room menu, and in the chat panel header. The
  invite dialog is the plain one (who is here, invite link, email).
- Names show as "First L." by default; a person can turn on their full name.
- Level is earned from agent hours, cumulative, shown on the card and as a stat
  beside the ranks on a profile. No bar to the next level.
- Ranks are this week, with Today beside it. Reached from the room menu or any
  rank number. No ranks toggle on the room, no ranked wall.
- Profile: the header with level, rank in room, rank on Agentbox, days in a row;
  Progress tab (cumulative agent hours chart, the old header style) and
  Activity tab (waiting on them, running, done today).
- Invisible: explains itself before it happens, has a duration, and leaves a
  plain notice above the wall. A Rooms page in Settings holds name display, what
  your card shows, and invisible. Private threads never show.
- Everything sits behind an Alpha features switch in Settings.

## The alpha switch

- New Settings page "Alpha features" (Personal group), with a "Rooms" switch.
  Stored in `zero.config.json` as `alphaRooms`
  through the existing `setWorkspaceSetting` path (pattern: `adhdMode`).
- Rooms off (the default): no Rooms section, no room tabs, no messages page
  change, nothing about rooms is published, no room tables are read. The
  existing team features keep working exactly as today.
- Rooms needs the team cloud (signed in). With Rooms on and no team cloud, the
  Rooms page says why and offers sign-in.

## Cloud: schema (one new migration, `20261021000000_rooms.sql`)

Nothing reads `people` across teams. A stranger in a public room never sees
your email, full name or avatar unless your own profile publishes them.

Tables (every foreign key named, with what happens on delete):

- `rooms`: id uuid pk, name text (1..40), kind text (`room` | `group`),
  team_id uuid null references teams on delete cascade (unique: one room per
  team), listed bool default false (public, in Find rooms; only `kind = 'room'`),
  created_by uuid references people on delete set null, created_at.
- `room_members`: (room_id references rooms on delete cascade, person_id
  references people on delete cascade) pk, role (`owner` | `member`), joined_at.
  Explicit members only. A team room's members are the team's members, read
  live from `team_members` and never copied.
- `room_links`: token text pk (16 random bytes, base64url), room_id references
  rooms on delete cascade, created_by references people on delete set null,
  created_at, revoked_at null. One live link
  per room. No UPDATE or DELETE grant: revoking is a function.
- `room_email_invites`: (room_id references rooms on delete cascade, email) pk,
  invited_by references people on delete set null, created_at. No email is sent; the person sees it when they sign in
  with that confirmed email (the same rule as team invites).
- `room_profiles`: one row per person, what the person chose to show. person_id
  pk references people on delete cascade, display_name (≤40, made by its owner:
  "First L." or full name), avatar_url null, headline null (≤60), bio null
  (≤160), show_working text (`none` | `team` | `everyone`, default `team`),
  show_agents bool, show_level bool, show_status bool, invisible_until null,
  status_text null (≤80), status_until null, updated_at.
- `room_presence`: one row per person per Mac, because each Mac runs its own
  agents and keeps its own run ledger. (person_id references people on delete
  cascade, device text 12 hex) pk, agents_running int, working_on text null
  (≤64), working_private bool, working_at timestamptz null, hours_total,
  hours_week, week_start date, hours_today, day date, streak_days, active_days
  date[] (the last 60 local dates with a run, for the streak across Macs),
  hours_by_month jsonb (12 months), updated_at. Readers add a person's Macs
  together; a Mac silent for 15 minutes counts no running agents.
- `room_messages`: id uuid pk default gen_random_uuid(), room_id references
  rooms on delete cascade, by_person references people on delete set null,
  body text (1..4000), in_reply_to uuid null references room_messages on delete
  set null, mentions uuid[] default '{}', created_at default now() (forced by
  trigger). Since 20261022000000_room_messages_do_more.sql: edited_at and
  deleted_at, set only by `edit_room_message` and `delete_room_message`, which
  only the author may call. A deleted message keeps its row with an empty body.
- `room_reactions` (message, person, emoji) with an on flag, written only by
  `react_room_message`; turning one off is an update, because realtime sends
  no deletes. `room_files` (room, plain name) holds base64 files up to 10 MiB,
  voice notes among them; a message links one as `[name](attachments/name)`.
- `room_reads`: (room_id references rooms on delete cascade, person_id
  references people on delete cascade) pk, read_at. Written through
  `mark_room_read(room, at)`, which keeps the later of the two times, so two
  Macs never move it backwards, and `mark_room_unread(room, at)`, which is a
  person choosing to move their own read point back.

Seeded idempotently by the migration: one team room per existing team
(`on conflict do nothing`), a trigger that makes it for every new team, and
General (fixed id, listed, no owner).

### Who may do what (grants, then row policies)

`anon` gets nothing on any room table and may execute only `room_preview`.
`authenticated` gets the table rights below; the policies then decide rows.

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| rooms | `in_room(id)` or `listed` | `created_by = auth.uid()`, `team_id is null`, listed only if kind = room (with check) | name only (column grant), owner only | owner, explicit rooms only |
| room_members | `in_room(room_id)` | none (functions only) | none | `person_id = auth.uid()` (leave), or owner of an explicit room |
| room_links | `in_room(room_id)` | none (function makes it) | none | none |
| room_email_invites | `in_room(room_id)` | `in_room(room_id)`, `invited_by = auth.uid()` (with check) | none | inviter or owner |
| room_profiles | own row, or `shares_room(person_id)` and not invisible | own row (with check) | own row, listed columns only (column grant) | none |
| room_events | `in_room(room_id)` | none (triggers) | none | none |
| access_events | own rows | none (triggers) | none | none |
| room_presence | same as profiles, joined on the person, not gone | own rows (with check) | own rows (with check) | none |
| room_messages | `in_room(room_id)` | `in_room(room_id)` and `by_person = auth.uid()` (with check) | none | none |
| room_reads | own rows | none (function) | none | none |

Functions are `security definer`, `set search_path = public`, `revoke execute
... from public, anon`, then `grant execute ... to authenticated`, except
`room_preview` (also `anon`):

- `in_room(room)`: true if I am in `room_members`, or the room's `team_id` is
  in `my_teams()` (live, so leaving a team leaves its room the same moment).
- `shares_room(person)`: some room has us both under that rule. Listed rooms
  count only once both have joined them.
- `my_rooms()`: rooms I am in, with my role and the member count.
- `create_room(name, kind, listed, people[])`: makes the room and owner row.
  A group lists at most 11 others, all of whom share a room with me.
- `join_listed_room(room)`, `join_room_by_link(token)`,
  `accept_room_invite(room)` (confirmed email only), `pending_room_invites()`.
- `room_link(room)`: the live token, made on first ask. `revoke_room_link(room)`:
  creator or owner only; sets `revoked_at` and makes a new one.
- `room_preview(token)`: name, member count, agents running now, up to 8 display
  names and avatars of members who are not invisible. Nothing else, and nothing
  for a revoked or unknown token.
- `mark_room_read(room, at)`, `agentbox_rank()` (my rank by all-time hours among
  visible profiles, the number only).
- `remove_room_member(room, person)`: owner of an explicit room only.

### Realtime and losing access

- Supabase checks inserts and updates against the subscriber's row policies,
  but not deletes (a delete event goes to every subscriber of the table). So no
  room table is ever subscribed to for deletes, and nothing a client listens to
  is deleted:
  - Publication adds `room_messages`, `room_presence`, `room_profiles` and two
    small insert-only tables, `room_events` and `access_events`. Membership
    tables (`room_members`, `team_members`) are not published.
  - `room_events` (id, room_id references rooms on delete cascade, kind:
    `joined` | `left` | `renamed`, person_id, at): written by triggers on
    `room_members` and `rooms`, and for team rooms on `team_members`. Readable
    when `in_room(room_id)`. Members refresh the room's member list on one.
  - `access_events` (id, person_id references people on delete cascade, at):
    one row for the person whose access changed, written by the same triggers
    when they join or leave a room or a team. Readable only by that person.
- So the moment someone is removed from a room or a team, the server refuses
  their reads and writes and stops sending them that room's changes, and their
  client gets an `access_events` insert at once, re-reads `my_rooms()`, and
  drops the room: its tab and pin removed, its cached cards and messages
  cleared. The 5-second sync re-reads `my_rooms()` as the fallback for a missed
  event or a sleeping Mac.
- Presence and profiles are never deleted while Rooms is in use: going away
  sets `gone = true` and blanks the fields (an update, checked against the
  policies), and the read policy hides gone rows.
- Sign-out and Rooms off tear down the subscriptions and clear room state.
  Rooms off also marks my presence rows gone (I leave every wall); my profile
  stays so turning it back on restores my choices.

### Limits and abuse (alpha)

- Triggers refuse: more than 20 messages a minute per person; more than 10 new
  rooms a day per person; more than 50 email invites a day per person; more than
  30 joins an hour per person. Links are 128-bit, so guessing is not a path.
- Rooms hold at most 500 members; groups 12.
- An owner can remove a member and revoke the link. Anyone can leave. Listed
  rooms other than General can be made only by people already on a team in the
  alpha, and the service role can delete any room. Reporting is not in the
  alpha.
- Deleting a room (owner, explicit rooms only) cascades members, links, invites,
  messages and reads. When the last explicit owner leaves, the longest member
  becomes owner; when the last member leaves, the room is deleted. A team
  room goes when its team goes.

A group chat started from a room with someone outside my team is a room of
kind `group`. Group and direct chats among teammates keep using today's direct
records, unchanged, so their agents, pictures and threads keep working. The
room service never creates or writes direct records.

## Local: agent hours

There is no run history today (only PostHog counts and per-run trace logs).

- New ledger `runs.jsonl` under `appHome()`, one line per finished run, written
  in `settleExit`: `{key, at, start, item, product, engine, seconds, failed}`,
  `key = item:start`. Every run the agent actually started counts its wall
  time, failed ones included; a run that never started (spawn trouble) does
  not. Overlapping runs each count: five agents for an hour is five agent hours.
  Cloud runs come from `cloud-usage.jsonl` (`wallSeconds`), and are not also
  counted from `settleExit` when they are followed home.
- One-time backfill on first Rooms enable from the per-run trace logs
  (`sessions/<item>/<startedAt>.log`: start from the name, end from the
  `# exited` footer, else the file's mtime), written with the same keys, and
  every read dedupes by key, so running it twice or racing a live write is
  harmless. Bounded to the last 400 days; unreadable files are skipped.
- `shared/agent-hours.mjs` (pure): totals (all time, this week from local
  Monday, today), active dates, streak, monthly series, and the level.
  Persisted on my presence row only because other people cannot compute them:
  they read my numbers, never my ledger.
- Level (quick early, each level slower than the last, 99 at 10,000 hours,
  no ceiling): up to 99, `level(h) = 1 + floor(98 * (h / 10000) ^ 0.4)`; past
  99 each level costs 5% more hours than the one before. 1h is 3, 12h is 7,
  100h is 16, 1,945h is 51, 10,000h is 99. At about 65 agent hours a day
  that is the middle after a month, 99 after five, and about 125 after a
  year. A person's level comes from the sum of their Macs' hours.
- Streak across Macs: the union of each Mac's `active_days`, counted back from
  today (or yesterday, if today has no run yet).

## Local: what my presence publishes

`main/team/room-presence.mjs` builds my presence row from local facts, and the
team sync loop upserts it when its hash changes (at most every 5s):

- `working_on`: the short name (`rowTitle`) of the thread whose agent started
  most recently among this Mac's running sessions; else the thread I last moved
  in the last 8 hours; else null. A private thread (per `shownToTeam`) sends no
  name and `working_private = true`.
- `show_working` on my profile decides who sees the name. RLS works on rows and
  realtime sends whole rows, so the row carries a name only when
  `show_working = 'everyone'`. With `team`, my teammates' walls take the name
  from the `thread_cards` they already receive (my newest running card), and
  everyone else sees no name. With `none`, nobody's wall shows a name: the
  presence row carries none, and teammates' walls read my profile's
  `show_working` and do not look at thread cards for me. The Team board is a
  separate, existing surface and keeps showing my shared thread cards as today;
  the Rooms settings page says so in one line.
- `agents_running`: this Mac's `status().running.length` minus remote-idle and
  followed-home cloud runs already counted by the cloud Mac.
- Switches off (agents, level, status) blank those fields on my rows.
- Invisible sets `invisible_until` on my profile; the policies hide my profile
  and presence rows from everyone else until then. Coming back republishes.

## Chat, mentions, unread

- Room chat reads `room_messages` (the latest 200, older on scroll), realtime
  for new ones; a reconnect re-reads since the last message held. Replies use
  `in_reply_to` and open in the panel's thread view.
- A message that mentions me is a mention row with its own identity
  (`room-mention:<message id>`), drawn by the renderer from room state, never
  written into my store. It shows at the top of Needs you until my
  `room_reads.read_at` for that room passes its time, which any of my Macs can
  move. It does not go through `belongsInInbox`, never appears in Done or
  Later, and adds to the Needs you count through its own function. Needs you
  draws one row per person per room: one message reads as itself, several as
  "sent you 4 messages".
- Unread on a room row: messages after my read time, shown as "9+" at most.
  Mentions always count, also in a muted room; other messages do not count in a
  muted room. Mute is local, per person.
- Staying on a room's chat (panel visible) for two seconds with the window in
  front marks it read up to the newest message shown. Passing through it does
  not, so a mention is not cleared on the way past.

## The messages page

Replaced by Groups (2026-10-23, below). Kept for what it was:

- When Rooms is on, every full-page chat (a direct record opened from Threads,
  a room's chat opened with the arrows, All messages) is one page: the
  conversation list on the left (rooms, groups and direct records, newest
  first, unread dot) and the open chat beside it.
- Direct records keep their existing view and thread machinery inside the right
  pane, unchanged; only the list on the left is new, and it reads what the
  inbox already holds. Room and group chats render with the room chat component
  at full width.
- When Rooms is off, the existing Focus view is unchanged.

## UI, where it goes

- Sidebar: one row, Inbox, while Rooms is on; no rows for rooms or messages.
  Everything else is the Groups tab (below).
- Room page: `renderer/src/rooms/RoomPage.tsx` (the wall), `RoomChat.tsx` (the
  panel, the switcher, invite button, expand arrows), `PersonHover.tsx`,
  `RoomRanks.tsx`, `ProfilePage.tsx`, `InviteDialog.tsx`, `StartRoomDialog.tsx`,
  `FindRooms.tsx`, `MessagesPage.tsx`, `GoInvisible.tsx`.
- Settings: `settings-search.ts` gains `alpha` and `rooms` pages.
- Every new surface is checked in Dark and Light with the app's own tokens; the
  wall's grid uses `--line-strong` in Light, columns snapped to whole pixels.

## Joining

- Invite link: `https://agentbox.ac/join/<token>`. The app registers the
  `agentbox://` scheme (`app.setAsDefaultProtocolClient`, `open-url`) and the
  web page's "Open in Agentbox" uses `agentbox://join/<token>`. Pasting a link
  into Find rooms also works.
- The browser page is a static page for the landing site that calls
  `room_preview` with the anon key. Deploying it is the founder's call (it is
  public); the app side works without it.
- Start a room: name and who can join (anyone with the link, only people you
  invite, anyone on Agentbox).
- First run of Rooms: your team's room is pinned. With no team, General is
  joined and pinned so the page is never empty.

## What leaves the Mac (and the legal pages)

Rooms sends the card above and room messages to the team cloud. The privacy
page today says the app has no sign-in and no cloud copy, which the team
version already contradicts. Before Rooms leaves alpha, both legal pages need a
team and rooms section. That is a decision and an edit for the founder, flagged
in the result, not done silently. The README "What this sends" section gains a
Rooms paragraph in this work.

## Build order (each step lands with its tests)

1. Alpha switch: Settings page, config keys.
2. Agent hours: `runs.jsonl`, backfill, `shared/agent-hours.mjs`, level.
3. Cloud migration and both backends (Supabase and the in-memory stand-in),
   RLS proven in PGlite.
4. Room service in main (`main/team/rooms.mjs`): my rooms, members, cards,
   messages, links, invites, publish my card, IPC, snapshot `rooms` field.
5. Sidebar section, tabs, the wall, the chat panel (read and send), invite.
6. Hover card, profile, ranks, Rooms settings, invisible.
7. Messages page, mentions in Threads, direct chats from a room, groups.
8. Joining: links, deep link, Find rooms, Start a room, General.
9. End-to-end run (below), fixes, screenshots from each person's view.

## Testing

- Unit: `shared/agent-hours.mjs` (level boundaries, week edges across DST,
  streak with a gap, backfill parsing), card building (private thread, outside
  team, switches off, invisible).
- RLS and grants in PGlite with every migration: `anon` can execute only
  `room_preview` and reads no table; every security-definer function refuses a
  caller who is not allowed; forged writes (another person's presence, a
  message `by` someone else, a member row, a link update) are refused; a
  stranger in a public room reads the profile and presence but never the
  `people` row or email; invisible hides; a non-member reads no messages; the
  rate limits; link join and revoke; removing someone from a team removes them
  from its room the same moment; two Macs racing `mark_room_read`; a removed
  member gets their own `access_events` row while the members who stay get the
  room's `room_events` row; nobody can insert into either event table.
- Presence: `show_working` none, team and everyone from a teammate's view and a
  stranger's view; a private thread; two Macs summed; a silent Mac.
- Hours: failed and never-started runs, overlapping runs, cloud runs counted
  once, backfill run twice gives the same totals.
- Mentions: identity across Macs, cleared by a read on another Mac, never in
  Done, counted once, still counted in a muted room.
- Memory backend parity with Supabase (`team-cloud-backends-agree` style).
- Renderer: static markup tests for the wall card (truncation, initials, "Private
  thread", "Not running"), tabs, sidebar states, chat ordering.
- End to end, three fake people with real agents: a local Supabase (`supabase
  start` in `cloud/`, Docker, stopped after), three headless app servers
  (`bin/agentbox.mjs --dir <tmp>`, each with its own store and data folder,
  `AGENTBOX_TEAM_CONFIG` pointing at the local cloud, `AGENTBOX_TEAM_TEST_LOGIN`
  per person), each running one or two small real Claude tasks in a throwaway
  repo. Driven through headless Chrome over CDP, never the founder's own
  screen. Checked from each person's view: cards appear with the right thread
  names, private shows "Private thread", invisible disappears and comes back,
  a mention lands in Threads, a direct chat crosses, join by link, leave,
  pin/unpin, ranks. A 40-person room is filled with seeded cards to check scale.
- Nothing in the end-to-end run touches the founder's store, her app, or the
  hosted cloud. The migration reaches the hosted cloud only when she says so.

## Reviews

- Codex, first pass (2026-10-20): asked for the authorization matrix, team
  membership revocation, and an opt-out that cannot be bypassed. Added.
- Codex, second pass: asked how a removed member's client clears its cache at
  once, for the missing foreign keys, and for the report table. Added the keys
  and took reporting out of the alpha.
- Codex, third pass: delete events skip row policies. Replaced the membership
  subscriptions with insert-only `room_events` and `access_events`, and made
  presence and profiles go away by update, never by delete.
- Codex, fourth pass: agree to build. Client subscriptions are insert-only, and
  tests prove a removed member gets their own access event while the members
  who stay get the team-room event.

## Review questions for Codex

1. Is a separate `rooms` model right, or should rooms reuse `projects`/`lines`?
2. Thread names for people outside my team: the card carries a name only when
   I allow it, and teammates read it from `thread_cards`. Is there a leak or a
   simpler shape?
3. Is deriving team-room membership from `team_members` (not copying) sound for
   policies and realtime?
4. Mentions as renderer-drawn rows (not ledger items): any trap with the inbox
   rules (`belongsInInbox`, Done, counts)?
5. Anything that should not be in the alpha, or that is missing.

## What changed while building (2026-10-20)

- A room can be for invited people only (`invite_only`): no link works for it.
- Each person's place on the app comes from `agentbox_ranks(people)`, for me
  and the people I share a room with, so a profile can show it.
- `show_activity` on the profile: off, teammates see no Activity tab on my page.
- A switch turned off keeps the value off the cloud: my Mac publishes no agent
  count, hours or status, so no row, realtime event or invite preview has it.
- A stranger reads "Private thread" where a name is kept to my team; my own
  card always names my own thread.
- Messages sits under Threads in the sidebar while Rooms is on. "Keep as a
  room" was dropped. Renaming Threads to Inbox waits for the founder.
- Mentions are read on their own (`roomMentions`), so a busy room cannot bury
  one; the service reads the room again each time realtime subscribes.
- At most fifty email invites a day; a listed room gets a new owner when its
  owner leaves.
- Light uses the app's own `--line`; the stronger line of round 22 answered a
  screen's contrast fault.
- Checked with three accounts (two on one team, one on none) on a local
  Supabase, each with its own copy of the app and real Claude Code runs.
- Each member has their own invite link, so the join dialog can say who
  invited you. Turning yours off leaves everyone else's; the owner's turns off
  them all.
- An email invite is kept once used (`accepted_at`), so the invite dialog lists
  who you invited and who joined.
- Checked against round 23 screen by screen on 2026-10-21. Full pages (a room's
  chat, Messages, a person's page, Find rooms) have their title in the top bar
  and no state tabs. Day labels in the chat have no rule beside them. Left as
  built: rooms have no description line in Find rooms, a team room has no
  Leave in its menu (you leave by leaving the team), and Start a room offers
  Find a room to join, since the plus beside Rooms became New room.
- A room is its board (w-49cd37092c); there is no Grid or Board to pick. The
  header's filters button, the one the Inbox has, holds the board's Show and
  People lines. The board holds you and the teammates whose Activity you may
  open, and its People line narrows it. It draws each thread as a face beside the person's name over
  the title, with no project and no card, and leaves Later off until the
  filters menu's Show line turns it on. Titles are one line, cut with an ellipsis. The
  grid's people stay over it as a row of tiles in the Grid's lines, eight to a
  row at most: a face, a first name and agents working, never what anyone is
  on. Clicking a tile narrows the board. With Rooms on, the Inbox shows only your own threads: its
  People line and the faces on its button are gone, and the pick it kept comes
  back if Rooms is turned off.
- A person's page (w-88e1e23325). The second tab is "Today's activity", the
  Inbox's board for that one person. Progress opens on the total ("64, agent
  hours since July 2026", option A of five), and the chart under it shows a
  value only where you point. The ranks say "this week" and "all time". Your own
  page has your bio, with Add a bio and Edit. Message there opens the chat full
  page on Messages, and Back returns to the page. The rooms they are in open
  when clicked.
- After an hour with a second person in the founder's room (2026-10-22,
  `20261022000100_rooms_show_everyone.sql`): `show_working` defaults to
  `everyone`, and cards on the old default moved. While `everyone` and
  `show_activity` hold, a Mac puts up to 36 lines of what is waiting, running
  and done today on its presence row (`activity`), only threads the whole team
  may read, and a room-mate outside the team's page draws those lines on its board. The
  board still holds only people whose thread cards reach you. `room_names(r)`
  gives every member's name and face and nothing else, so a message keeps its
  author's name while they are invisible, and a member with no card is on the
  wall as "Not on Rooms yet". My own card counts this Mac's running agents. A
  group chat nobody has written in is listed only for whoever started it.

## Groups (2026-10-23, w-dcaa2c122e)

Rooms and Messages were two places for one idea. They are one, called Groups:

- The Inbox's tabs move into the top bar where the title was, and after Done
  and a rule comes Groups. It holds the group open last and counts groups with
  something unread; its arrow lists every group (`RoomTab.tsx`).
- A group's page (`GroupPage.tsx`): over it a row of every group, named ones
  first with a # and a border, then a rule, then chats by first name with their
  faces, then More (`GroupList.tsx`). Every chat is its own entry, a
  teammate's direct record among them. The chat fills the page with faces hung
  beside the words; down the right, People: face, name, level, what they are
  on, their agents. A group over twelve lists only who is working.
- A person in that list opens their page, which opens on Today's activity (their
  threads as a board) with Progress second.
- The group's options are one button in the top bar: Everyone's threads (the
  board), Invite people, Members, Mute, Leave, New group, Find groups to join.
- Any group, from anywhere (a mention, Message on someone's page, a join),
  opens in the Groups tab. A direct record opens on the same page as a group
  (2026-10-26, w-d28f0c6ba8): the Chats list, its chat, and People down the
  right. Its own thread page, with the "Needs you / name" bar, read as a
  different app for some people and not others.
- The Rooms page and the Messages page are no longer drawn; their components
  are still in the tree.

## Thread names stay with your team until you say (2026-10-24, w-64116bb761)

Someone with no team lands in General, and with `everyone` as the default
the whole of General got their thread names, old ones included. Agreed:

- A new card starts on `team`. People outside your team see your name, level
  and agent count, and your bio where a thread name was. Cards made before
  keep what they had.
- A group anyone can join (`listed`) shows one line the first time it is
  opened on a Mac: who can join and what they see, with Leave group and OK,
  and Hide my threads while names are on.
- In such a group your own row shows what strangers see.
- General is called Coworking (`20261026120000_general_is_coworking.sql`),
  picked from six names drawn in the app. Same id, so nobody moves.
- `20261022000100` reached the hosted cloud two days late and moved every card
  to `everyone`. `20261027000000_thread_names_stay_with_the_team.sql` moves
  them back to `team`, makes `team` the cloud's default, and clears the thread
  names their Macs last published. Turning names on is each person's to do.
