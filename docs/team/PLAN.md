# Agentbox for teams: the build

Status: approved on 2026-09-30. This file is
the handoff between sessions building it. Keep it current: tick what landed,
say what is next.

## What it is

One inbox for agents and people. A teammate's message, a task someone hands
you and an agent's question are the same kind of row. Projects are private or
shared; there are no workspaces. A Team page shows every open task in the
company, filterable by person. Nothing in the sidebar shows who is busy.

## Settled decisions (do not reopen)

- A project is a shared record (id, name, who can see it, its rows) and each
  person keeps their own folders for it. A private project never leaves the Mac.
- No workspace switcher. Every project, shared or private, lands in one inbox.
- The sidebar gains only a Team tab. No people list, no activity counts there.
- "Who does it" is the composer's existing engine word: Claude Code, Codex,
  then people. Picking a person turns "Starts now" into a due day and drops
  the model clause.
- The Team page is one flat list of open tasks, newest movement first, never
  grouped, with state tabs (Open, Running, Waiting, Scheduled, Done today) and
  a row of faces as the person filter. Live work is fine there.
- A teammate's private task shows on the Team page as a blank "Private task"
  line: person and state, never title or project. Your own private task shows
  its title, a lock and "Hidden from the team".
- The line under an opened task's name uses the inbox row end's uppercase mono.
- Sign-in is Google, through Supabase Auth. The founder creates the Google
  client herself.
- Teammates run the team build from source for now.
- Cloud is Supabase (the team already runs it elsewhere). No local Docker
  Supabase, to keep the development machine light. Tests use an
  in-process stand-in, and two copies on one Mac talk through a small local
  stand-in server (`cloud/dev-server.mjs`).
- Superseded 2026-10-01: the team version now lives in the public repository,
  with its history. Until then: this repository never pushed to the public one, and nothing pulled the public
  one in automatically.

## How it works

- Every ledger line of a shared project is also a row in the cloud `lines`
  table, keyed by the project's id and a unique line id. Each Mac pushes the
  lines it wrote and pulls everyone else's, and the existing fold turns them
  into items. Lines carry who wrote them (`by`, a person id).
- Ownership decides which Mac runs an agent: a row's `runner` is the person
  whose Mac may run agents on it. Without that, every teammate's supervisor
  would run the same task.
- A row asks a person through `owner`: the person who has to act next. The
  inbox shows a shared project's rows to their owner, and a conversation's
  rows to its people when someone else spoke last.
- Private projects stay exactly as today, and publish only a title-free
  activity line per open task (person, state, when it moved) for the Team page.

## Phases

1. Cloud schema and a backend interface with two implementations: Supabase,
   and a stand-in for tests and local two-copy runs.
2. People and sign-in: Google through Supabase, a session kept in the app's
   data folder, the signed-in person on the snapshot.
3. Sharing: give a project an id, share it (everyone or specific people),
   join shared projects on the other Macs as local projects.
4. Sync: push and pull ledger lines for shared projects through the one store
   write path, with tests that two stores converge.
5. Ownership: `runner` and `owner`, the supervisor runs only rows whose runner
   is me, the inbox rule for shared rows.
6. The screens: people on rows and messages, who does it, given to you, the
   Team page, the share card, the Team settings section.
7. End to end: two copies of the app on one Mac against the stand-in server,
   photographed; then the same against Supabase once it exists.

### Where it stands, 2026-09-30 night

All seven are built, on `main` of this repo. Proven against the hosted
project, not a stand-in: `tests/team-live-two-macs-through-the-cloud.test.mjs`
(needs `TEAM_SERVICE_KEY`) and `scripts/scratch/team-two-real-copies.mjs`, which
runs two headless copies of the real app as two throwaway people, photographs
both windows, and deletes everything it made. A visible Electron window was
not launched, because it would share the running app's single-instance lock.
What is NOT proven: Google sign-in itself, which waits on the OAuth client (the tests sign in with
a password the admin key creates).

## Founder's steps outside the code

- A hosted Supabase project; its address and key live in
  cloud/team.config.json on each machine, which is never committed (steps
  written up on 2026-09-30).
- Google sign-in client, in the morning: steps go in the morning summary.
  The consent screen must be published, or every teammate added as a test
  user, or Google refuses everyone but the account that made it.
- Each teammate needs a copy of cloud/team.config.json.
