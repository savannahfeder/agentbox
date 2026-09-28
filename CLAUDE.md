# agentbox: agent working notes

This is the founder-facing agent inbox over a store on disk: work items in,
headless `claude -p` workers out, one per item. This file is durable law for any
agent working in this repo; no status claims (read the code and git for state).

## EVERY CHANGE LANDS WITH TESTS, AND YOU RUN ALL OF THEM (the founder, 2026-08-27)

This is not only for bug fixes and it is not satisfied by one happy path. Six
things, and none of them is optional:

- **Write the test first and watch it fail.** A test written after the fix
  proves the fix compiles, not that it works: it has never once been red, so
  nothing tells you it would go red again. Run it, see the failure, then fix.
- **Cover the cases, not the case.** At minimum: the one she reported, the
  boundary either side of it, and the case that must NOT match. That last one
  is the one that gets skipped and the one that catches the next regression. A
  search fix that proves "how to work" is found and never proves "to" is not
  found inside "into" has tested half of the bug.
- **Name the file after the behaviour, in her words.** This repo's tests are
  sentences (`a-reply-moves-the-agent-row.test.mjs`), because the name is what
  a future session reads when the test goes red at 2am. Not
  `search2.test.mjs`.
- **Say why the test exists, at the top, with the measurement.** Every test
  file here opens with what broke, when, and the number that proved it. A test
  whose reason is not written down is deleted by the next person who finds it
  inconvenient.
- **Run the WHOLE suite before you report anything: `npx vitest run`.** Not
  your file. Not breaking things later is the entire point, and it is the only
  part of the ask that your own file cannot answer. It takes about 25 seconds
  for all ~250 files.
- **Report the real result.** A test you did not run is not passing, and a
  suite you ran with one file selected is not the suite. If something is red
  and you are leaving it red, say so and say why.

Where the behaviour is about her real store rather than about a fixture,
measure it against her real store as well, and put the number in the commit
and in the card. A number like "316 results, 5 of them real, at ranks 1, 11,
16, 28 and 236" is a fact somebody can act on. "Search is better now" is not.

## THE USER STAYS IN FLOW (the founder, 2026-08-13)

The product's design law, and it outranks any drawing, including one an agent
is proud of. The app should feel like a game you always intuitively know the
next step in: never cognitively overloaded, and in a state of deep focus.

Four tests. A screen passes all four or it is not built:

- It is very intuitive.
- You are never cognitively overloaded.
- You are often in flow.
- It is very clear what happens next.

What that has already rejected, so nobody re-derives it:

- A DENSE SCREEN IS A FAILED SCREEN. Seven artboards of a rich panel came back
  as "a ton of things happening on the screen. I can't really process what it
  is and it's very unclear" (2026-08-13). More on one surface is not more
  power; it is the cost she is refusing to pay. When a drawing needs a legend,
  start over rather than annotate it.
- NO RED, AND NOTHING RED-LIKE, IN THE SIDEBAR. Alarm colour belongs where the
  eye is meant to be, which in the rail is never. Same instinct killed the
  unsaved-edit red in the footer; it is one rule, not two.
- THE SIDEBAR CARRIES THE LAST FEW THINGS, NOT A LEDGER. No counts, no
  bookkeeping on a glance surface.
- TODAY'S MESS IS A BUG, NOT A SPEC. Do not design structure around how untidy
  her store happens to be this week.
- ONE DRAWING IS NOT A CHOICE. Anything visual reaches her as several
  DIVERGENT options, never one plus a flag.
- COPY IS PART OF THE DESIGN. "What it has made" is not approved wording; she
  asked to see many variations of it before any of it settles.

## Billing: workers run on the founder's Claude subscription, NEVER an API key

The supervisor scrubs `ANTHROPIC_*`, `CLAUDE_CODE_*`, `CLAUDECODE`, `CLAUDE_PID`
and `CLAUDE_EFFORT` from the env before every spawn (supervisor.mjs), because an
inherited `ANTHROPIC_API_KEY` silently redirects billing. Never weaken the
scrub, never pass an API key into a worker's env, never add auth flags to
`sessionArgs`.

## The arcade's saving is the thing that CANNOT EVER FAIL (the founder, 2026-08-04)

The game is the reward for inbox zero, and its save vault holds real hours of
her life. Losing progress is the one unforgivable failure; every other arcade
behavior bends to it. The rules, all pinned by tests
(tests/save-vault.test.mjs, tests/arcade-leave.test.mjs):

- Capture first, hide second, never the other way round. The screen is only
  handed back once durability is PROVEN.
- A capture result has three honest shapes: `published` (new checkpoint on
  disk, verified before it becomes the head), `skipped` (head already IS this
  exact state, proven by hash — a paused game after laptop sleep produces this
  forever), and a failure with a reason. `published` and `skipped` are BOTH
  durable successes. Treating `skipped` as failure held the whole app hostage
  behind a paused game, twice.
- Only a real failure may pause the game or hold the screen, and every halt is
  protective custody, not a verdict: a recovery capture runs on an interval,
  and one landed (or skipped-identical) capture releases the pause and
  finishes any interrupted leave. A halt with no recovery path is a bug.
- Waking from laptop sleep looks exactly like a dead save path (all timers
  slept, the last verified write looks ancient). The difference is provable
  with ONE capture: probe before halting, never halt on a stale clock alone.
- Never weaken the vault's validation (garbage rejection, verify-before-head,
  the pre-restore checkpoint). When saving genuinely cannot work, the honest
  behavior is a paused game that says so, quietly retrying — never a hidden
  one silently losing progress, and never a blocked app.

The arcade's VOLUME is hers, and visibility is only a gate over it. A hidden
arcade is silenced and the emulator is still born muted (the ghost-audio rule
above), but an arcade coming back on screen plays at whatever she last set in
the emulator's own mute button and slider, never at a level the app picked. Her
setting lives in EmulatorJS's `ejs-settings` and rides the save vault between
sessions, so the gate must also put the emulator's own `volume`/`muted` fields
back after moving them: EmulatorJS derives `muted` from whatever level it is
handed and saves it, so an ungated hide is written to disk as HER having muted
the game. `renderer/emulator-host/audio-rules.mjs` is the only copy of that
rule, imported by the host page and by the tests. A hardcoded level anywhere in
this path is the 2026-08-11 bug: she muted the game to hear her music and it
came back at 50% on the next reload.

## Standing instructions: her rules, on every session

`briefs/founder.md` holds rules she writes once that every session is briefed
with, ahead of its own brief and outranking it. Three things make it work and
are worth not undoing:

- It is injected in `spawnPlan`, the ONE place a session's arguments are built,
  so product workers, the dispatcher, digests, her personal tasks and every
  resumed reply get it without anyone remembering to add it to a new path.
- It rides in `--append-system-prompt`, never in the prompt text, because a
  personal session's prompt must stay exactly her message and nothing else,
  and because a rule pasted above a 200-line brief is a rule that gets buried.
- It is read fresh at every spawn, out of the app's own data folder
  (`app.getPath('userData')/briefs/founder.md`) rather than out of this
  checkout.
- IT IS NOT IN GIT, since 2026-09-23. It used to be, so that a worker quietly
  rewriting it would show up in a diff, and that reason was a real one. It
  stopped being worth its cost when this repository went public, because the
  file is one person's notes about their own work. It is gitignored now,
  `carryHerBriefsAcross` only seeds the data folder from here when the data
  folder has none, and a missing file reads as no instructions rather than as
  an error. What replaces the diff is that the file is no longer anywhere a
  worker in this checkout can reach.

An empty file adds no flag at all. Do not add scoping, per-product rules or
enable toggles to this: it is her words, handed to capable readers.

## The privacy policy and the terms move WITH the app (the founder, 2026-08-19)

The two pages are `legal/privacy.html` and `legal/terms.html` IN THE AGENTBOX
STORE (`~/Zero/accounts/<account>/agentbox/legal/`), not in this repo, because
they are published with the landing page. They are written as legal documents,
numbered sections, and they are specific about this codebase, so a change here
falsifies them quietly.

IF YOUR CHANGE TOUCHES ANY OF THESE, YOU EDIT BOTH PAGES IN THE SAME SESSION
and you say in your result that you did.

- Anything that leaves the machine. A new event or count, a field added to one,
  anything added to a crash report, a new network call of any kind.
- Where it goes. A new third party, a change of vendor, a change of region.
- The diagnostics switch, its default, or what turning it off stops.
- Anything that makes Agentbox hold a user's work, or that adds an account, a
  sign in, a sync or a hosted anything. The pages say there is none.
- Money. A price, a paid tier, a charge of any kind.
- What an agent may do on the user's machine without an approval, which is
  section 7 of the terms and is the clause that protects her if an agent
  deletes somebody's work.

Section 4 of the privacy page is the never list, the promise that your files,
your prompts, your keys and your paths are never sent. A change that would
break it is not a page edit. It is a decision for her.

After any edit run `scripts/shot-legal-pages.mjs` IN THE AGENTBOX STORE. It fails
the run on her punctuation rule, on a clause that has gone missing, on a stray
contact address and on a blank that is not marked.

## The store

All work-item writes go through `main/store/` in this repo
(`main/store-modules.mjs` wires them up) — never reimplement the fold
or write jsonl directly; there must never be a second write path. The store
root and the account id are both in `zero.config.json`, which is gitignored
and belongs to whoever is running this:
do not point `storeRoot` elsewhere and do not add a `products` filter —
an agent doing both made every product but its own vanish from her inbox
(2026-08-04, the "lost account" incident). New products join by living in the
account root (a symlink is fine), not by filtering.

## Time is a predicate, never a timer (the founder, 2026-08-06)

An item may carry `runAt`, the moment before which nothing happens to it: it
cannot be claimed, it does not spawn, it is not in the inbox. It lives in the
LEDGER, which is why a schedule survives an app restart, a reboot, and a store
restored onto another machine, and why two Zeros on one account cannot
disagree about it. `isDue` in `shared/work-items.mjs` is the only copy of the
rule; the app reaches it through `store.isDue` and never reimplements it. A
SCHEDULED ITEM RUNS AT ITS TIME; it is not a reminder, so nothing in the UI
may call it one. A MISSED MOMENT RUNS LATE rather than being lost, and that
costs no code: once the moment passes the predicate is true forever, so the
first look after a machine wakes is as good as the one that would have
happened at 6am. Anything that replaces this with a timer or a queue of
pending firings reintroduces catch-up, and catch-up is what produces six of
something on a Monday.

A REPEATING TASK is that idea applied to work she sets once (`main/repeats.mjs`,
`shared/repeats.mjs`, spec `docs/superpowers/specs/2026-08-12-repeating-tasks-design.md`).
It is a RULE, in its own per-product `repeats.jsonl`, and deliberately NOT a work
item: a template inside the work-item ledger gets spawned and finished by the
fleet on day one, and that ledger is read from a trailing 8 MiB window, so a
long-lived one eventually loses the rule itself and stops repeating with no
symptom at all. A period is a local CALENDAR DATE, never arithmetic, which is
what makes DST, travel and a clock correction boring instead of a source of
double runs; the owed test is `periodKey > served`, so a rule change takes effect
at its next period and never backwards, and a `served` in the future is refused
by the fold rather than silencing the task until the calendar catches up. Every
tick asks whether today has been served. Nothing books tomorrow, so a run that
dies costs one day rather than the task; an unfinished run is SUPERSEDED by the
next period rather than vetoing it, and three in a row file one item saying so.
A run is an ordinary work item labelled `repeat:<ruleId>`, and it reaches her
inbox UNLESS a worker explicitly marked it `clean`. That marker is required to
hide and never to show, because ancestry is not proof that a run was quiet: a
run that died saying nothing is news, not silence.

The DIGEST is the same idea applied to news: an INVARIANT, not a schedule.
There is at most one open digest per product, it covers everything since the
last closed one, and it is refreshed no more often than every twelve hours.
Nothing fires; every supervisor tick asks whether that holds and makes it
hold, which is why three days away yields one digest rather than six. An open
digest is REWRITTEN, never joined by a second row. Workers do not write
digests at all; a digest session is spawned when one is owed and reads
finished items. Never give the digest a repeat rule: a chain where each run
books the next stops forever the first time a run dies, and the thing that
would have noticed is the run that died.

Both rules exist because of one incident. Five digest rows reached her inbox on
2026-08-06, because workers maintained the digest by appending to one row's
`note`, the store capped a note at 8,192 characters and truncated in silence,
and a worker with news and a full note correctly opened a new row rather than
lose what she had not read. Nobody misbehaved; the mechanism was wrong. Over-long
text is now cut WITH A MARK saying how much went, so a writer can summarise
instead of guess.

`sessionArgs` must always carry `"--allowedTools", "mcp__agentbox"` (the store
server is named from `shared/product-name.mjs`, and it ships in `mcp/`): headless
workers have no permission prompt, so without the grant every store tool call
is silently refused and workers run whole sessions unable to claim, update,
or file anything (2026-08-05: five sessions of analysis written to nowhere,
while Cascade alone kept working off its repo's own trusted allowlist).
`acceptEdits` covers file edits in the cwd; it does not grant MCP tools.
Capability grants for workers (git fetch/push/branch/merge and the like) also
belong in `sessionArgs`, scoped to the app's sessions only. Never write them
into the founder's global `~/.claude/settings.json`: an agent did, which
granted every Claude session on the machine push/merge everywhere, and she
called it out as too broad the same day (2026-08-05).

Broad permission POLICY lives in `worker-permissions.json`, passed per spawn
via `--settings` (the second and only other sanctioned place for grants).
It is evaluated by Claude Code's own permission engine, not hand-rolled
matching: deny > ask > allow, and only ask-matches reach the founder as
approval cards. Keep it a broad Bash allow plus a short ask-list of dangerous
shapes; when it drifted from that, every routine command became a card and
the founder was approving blind at one per second, which is no gate at all
(2026-08-05). `additionalDirectories` must include the store root: workers
cwd in their product repo, and without it every Read/Edit of a store doc
becomes a card (that was most of the flood, 2026-08-06). If a class of card
keeps recurring, the fix is moving that class to allow, not asking her
faster. When cards flood, diagnose empirically: one headless session
attempting the exact carded shapes against the rules file settles in two
minutes what theory about the permission engine will get wrong.

## An answer to her own ask is DELIVERED, not filed (2026-08-06)

Every one of them had been done, within twenty minutes, with a real answer.
She had asked the same metrics question three times in six and a half hours
because an item SHE composed appeared in no list she reads: In Progress while
it waits and while it runs, then `done`, and `done` was the first line of the
inbox filter. Her own asks went from In Progress to the archive without ever
passing her.

So an agent's `done` on an item she composed is news she has not received, and
it sits in her inbox until she archives it; her own `done` IS the archive. Same
word, opposite events, and the ledger has always known which was which (`wrote`
per field, from the fold in `shared/work-items.mjs`). `belongsInInbox` in
`renderer/src/list-rules.ts` is the only copy of that rule, and the reason it
is out of App.tsx is that what is MISSING from a list has no symptom: every
inbox it drew looked plausible, and the cost came back as her losing faith that
the fleet ran her work at all.

Three more silent drops in the same seam, worth not reintroducing. A reply
typed on a finished thread never reached a worker (the supervisor only carries
an answer while the item is open, so `statusForReply` hands the thread back).
Two identical nudges counted as one delivery (the dedup key now carries WHEN
she wrote, not only what). And the big one:

A WORKER THAT DID NOT FINISH DELIVERED NOTHING, HOWEVER LONG IT TOOK. The
delivery mark is written at SPAWN, so a dead session leaves it lying, and the
release used to be wired to sessions dying inside 45 seconds. Three of her
items sat stranded for two, two and six hours against that, having died at two
to four minutes with `error_during_execution`: past the window, so the mark
stood, so no tick would ever look at them again. `settleDelivery` asks the only
question that matters as each session exits — did it finish, meaning a result
that is not an error. A session WE killed does not spend an attempt, because
every restart kills the fleet and charging that to the item is how restarts
strand work. Retries cap at three so an impossible task cannot respawn forever;
past the cap the row reads stopped, which is then a report of three real
failures rather than of one death nobody noticed.

The rule under all of them: WHEN THE SYSTEM SWALLOWS SOMETHING SHE SAID, SHE
CANNOT TELL IT FROM THE WORK NOT HAPPENING. Anything her words pass through
either reaches a worker or says out loud that it did not. "Stopped" is the
loudest word this app has, and it must never mean "and nothing will retry".

## What the fleet works on next is ONE rule, in one file

Priority is two facts that must never look or read alike: a PROJECT's place in
the founder's running order (standing, set by dragging the chips in the
composer, `productOrder` in the supervisor's state) and a MESSAGE's own
priority (Urgent/High/Medium/Low, this message only). Project order dominates:
a place in it is worth `RANK_STEP` (100) against an item priority of 0..9, so a
higher project's Low beats a lower project's Urgent. That is the point of it.

Projects are an ORDER, not buckets (the founder, 2026-08-06). Buckets left every
tie inside a bucket unanswered, and "which of these two comes first" is the
question the fleet needs settled. A product she has never placed scores zero,
below everything placed, so an empty order behaves exactly like the flat inbox
that existed before ranking did.

`shared/rank.mjs` is the ONLY copy of that scoring rule, imported by both the
supervisor (which decides what to spawn) and the renderer (which decides what
the inbox shows first). It lives there because it was written twice and the two
copies are one edit away from disagreeing, at which point the top of the inbox
stops being what the agents are actually working on. Do not re-derive it.

Likewise `renderer/src/components/Priority.tsx` is the only priority
vocabulary. Two lists of the same four words is how "Medium" and "medium"
ended up on adjacent screens. The control OPENS (a drawer, every level
visible, one press to any of them); it does not cycle.

## NO WORKER EVER DRIVES THE USER'S OWN BROWSER (2026-09-23)

Her decision on w-5ebf7bf7bb, and it is a standing one rather than a preference
for that item: an agent must never be given control of the browser she actually
uses. Claude Code can do it, with `--chrome`, and that flag must not appear in
anything this app spawns. `tests/no-worker-drives-her-own-browser.test.mjs` fails
if it ever does.

Her reason is the one that makes it a rule and not a setting. The browser she
uses is signed into everything she has, so handing an agent the keyboard there is
handing it every account she holds, and no per-run approval makes that legible in
the moment. A browser an agent may drive has to be one that carries nothing: the
app already ships one, the pane on the `persist:junk` partition, which is a
separate store with no logins in it. That is the only door this may ever come
through, and even that needs its own permission design before it is built.

The same reasoning covers `--ide`, which attaches a session to the editor she has
open and reads what she has selected. It is not banned here, but it is hers to
switch on, not ours.

## Process etiquette

- A ONE-OFF HARNESS GOES IN `scripts/scratch/`, WHICH IS GITIGNORED. Proving a
  change here means booting the app against a throwaway store, driving it and
  photographing the window, so you will write a script to do that. That script
  is scaffolding. The picture is the deliverable and it goes to the product's
  documents where she reads it. Nothing decides whether the script is worth
  keeping, so it rides into `scripts/` with your branch and stays forever: 226
  of them had been committed by 2026-09-23, 2.3 MB, and not one was referenced
  by any test, any npm script or any other file. One of them was where a real
  account id came back into the tree the day after it had been cleaned out. Her
  words, 2026-09-23: she does not expect them to be pushed. If a harness turns
  out to be worth keeping, move it up into `scripts/` deliberately and say why
  in the commit; that is the only way one should ever get there.
- NEVER BRANCH OR BUILD IN `~/Desktop/dev/zero`, AND DELETE THE WORKTREE YOU
  BUILD IN. **THIS IS NOW ENFORCED, NOT ASKED. `scripts/hooks/post-checkout`
  puts that one checkout straight back on `main` if anything moves it off, and
  `scripts/hooks/pre-commit` plus `pre-merge-commit` refuse to commit there at
  all, on any branch. Every linked worktree is left completely alone: it may
  sit on any branch and commit freely, which is the whole point.** It is there
  because the branch that checkout stands on is the code SHE IS RUNNING and
  the brief every worker is handed: her app runs `npm start` from it, so
  `appDir` in `main/main.mjs` is that working tree and `supervisor.mjs`
  `buildBrief` reads `briefs/worker.md` out of it at every spawn. Measured off
  its HEAD reflog 2026-09-01: **57 branch switches in seven days and 79.4 of
  168 hours NOT on main, 47% of the week.** The guard bounces you back with your
  uncommitted work intact, so **if you find yourself on `main` there
  unexpectedly, that was the hook, and the next thing you do is make a
  worktree. Your edits come with you when you `cd` into it.** Both halves are
  escapable with `core.hooksPath` or `--no-verify`, on purpose: they are a
  guard rail and not a lock, and 10 tests in
  `tests/her-checkout-stays-on-main.test.mjs` pin every edge of them. It is a
  shared checkout that several sessions switch branches in; a `reset` there on
  2026-08-23 wiped about 250 uncommitted lines of another session's work. So
  `git worktree add -b <branch> /private/tmp/<your item id> main`, build
  there, and `git worktree remove <path>` as the last thing you do. Nobody did
  that second half for a month and it cost her the machine: **131 abandoned
  worktrees, 101 GB, 93% disk on 2026-08-31**, with parallel test runs failing
  because `mkdtemp` had nowhere to go under a full `/tmp`. Removing a worktree
  does not delete its branch, so this loses nothing and is one command. Leave
  yours only when the work in it is uncommitted or she still has to look at
  it, and then say the path in your last message. To sweep the ones already
  abandoned, run the Agentbox product folder's
  `scripts/prune-agent-worktrees.sh`: it prints what it would do and needs
  `--apply` to act, and it only ever touches a worktree that is clean, already
  merged into `main`, and untouched for 24 hours.
- NEVER `git stash` IN THIS REPO. The stash stack is shared by every worktree
  and several sessions are always live, so `stash` then `stash pop` is a race
  you will lose: on 2026-09-01 a pop landed another session's parked work in a
  worktree it did not belong to, with conflicts, and dropped the changes it
  was supposed to be protecting. Park work on a branch with a commit instead.
- Restarting the app kills every running worker mid-flight. Coordinate
  restarts with the founder or the session driving Zero. A kill of ours now
  releases its own delivery mark (`_kill` stamps the session, because the CLI
  traps SIGTERM and exits 143 itself, so Node reports no signal and every kill
  looked like a worker failing), so continuations respawn without help. Cmd-K
  "Resume interrupted agents" (supervisor.resumeStopped()) is still the repair
  for marks stranded by anything else.
- Renderer-only changes need `cd renderer && npm run build` plus ⌘R in the app
  — but the game emulator swallows the keyboard when focused, so a "dead" ⌘R
  usually means click outside the game first. Main-process changes need a real
  restart. `npm run --silent build --prefix renderer` silently builds nothing;
  don't use it.

## THE AGENTBOX SHE RUNS IS `~/Astral`, AND THIS REPO IS NOT IT (2026-09-01)

THIS CHECKOUT IS SCRATCH. Every session switches it to whatever branch it is
showing her, so what it holds at any moment is one row's work in progress and
never the app she is using. Measured twice on 2026-08-31: a session pointed it at
main so a merge she had approved would load, and another session moved it back
inside ten minutes, leaving `main/supervisor.mjs` importing an
`account-discovery.mjs` that no longer existed on disk. Her app would not have
started. Before that, the two fixes she approved on w-3c5b95c7e2 sat merged and
pushed on main for an hour while her screen ran a different branch entirely, and
she restarted, correctly, and saw no change.

So the app she uses lives at `~/Astral`: a worktree of this repository on branch
`agentbox-app`, which nothing else ever checks out. It was `astral-app` until
2026-09-20, and the last bullet in this section says why that branch was
abandoned rather than reused. Her `zero.config.json` is
copied into it (the file is gitignored, so a checkout does not carry it, and
without it the app opens as a fresh install), Electron's binary is copied into
its `node_modules`, and the store it reads is the same `~/Zero`. She launches it
from `~/Applications/Astral.app`.

What this asks of you:

- **To put a merge in front of her, run `~/update-agentbox.sh`.** It fast-forwards
  `agentbox-app` to main, rebuilds the renderer, and prints the commit. It
  fast-forwards only, so it refuses rather than forces if the two have diverged.
  Then say on the row that she needs to restart. A merge to main alone does not
  reach her.
- **Never point her app at this checkout again**, and never leave a file you
  removed from it unrestored.
- **NEVER START OR QUIT AGENTBOX FOR HER.** Launching it from an agent moves the
  Mac permission identity to the harness and revokes what she granted. Ask on
  the row instead.
- **A red suite inside this checkout usually means the checkout, not the code.**
  56 files failed here on 08-31 purely because one untracked file was missing.
  Test main in a worktree of your own.
- **NEVER COMMIT IN `~/Astral`, AND NEVER ANSWER A REFUSED FAST-FORWARD WITH A
  PLAIN MERGE.** Both put a commit on the app's branch that main does not have,
  and a branch that is ahead of main can never fast-forward again, so the next
  session hits the same refusal and does the same thing. Measured 2026-09-20 on
  w-1825982d24: one commit on 09-19 at 12:05 was followed by seven merge commits
  over the next ten hours, eight in all, and the folder's files were identical to
  main's the whole time. Nothing was ever at risk and nothing was ever fixed.
  The way out is a fresh branch at main, not a merge:
  `git -C ~/Astral switch -c <name> refs/heads/main`. That is what
  `agentbox-app` is, and the dead `agentbox-app` is still there with a tag,
  `agentbox-app-tip-2026-09-20`, if anyone needs the old history.

## A FIX THAT IS NOT RUNNING IS NOT A FIX (2026-08-11)

Electron reads `main/*.mjs`, `shared/*.mjs` and `preload.cjs` ONCE, at boot.
Everything below them is therefore invisible until a restart, and three times in
two days a fix was written, tested, green, pushed, and not running: the app was
up for 2d22h while four main-process fixes landed beneath it, the last of them a
correction to a bug that was actively stopping her agents, live for eighteen
hours after it was fixed. Each time the report read as "still broken" and the
code was already right.

⌘R does not rescue this and can make it worse. It reloads the RENDERER against
the old main process, so new UI calls IPC handlers the running process has never
heard of and fails in silence. That mismatch was one keystroke away on 08-10
(the palette's resume-any-row against a main process with no `zero:resume-items`).

The app still checks itself: `main/staleness.mjs` compares those files' mtimes
against the moment the process read them and rides `zero:snapshot` (which the
renderer already polls, because the staleness DEVELOPS while the app runs and
a boot-time check cannot see it). It no longer draws a banner. That bar was
right about the mechanism and wrong about the audience: it fires on any
main-process file whose mtime moved, several sessions edit this repo at once,
so most of what it announced was somebody else's work in progress rather than
a fix of hers waiting to run. A permanent warning that is usually noise trains
the reaction it was meant to prevent. The fact is now a ⌘K entry that appears
only when it is true.

THE CHECK THAT MATTERS WAS NEVER THE BANNER. It is the paragraph below, and it
is yours to run, not the app's.

What this asks of you: before concluding that anything in the app is broken, check
the app's start time against the mtimes of the files that would fix it
(`ps -eo lstart,command | grep Electron` vs `ls -l main/`). Never answer "is this
in the app I'm using?" from the repo alone. And when you do restart, coordinate
it (the bullet above) and rebuild the renderer first, so the two halves match.
- Tests are not optional and they are not just for bug fixes: the rules are at
  the top of this file, under EVERY CHANGE LANDS WITH TESTS. Read them there
  rather than from this line, which used to be the whole of it and was too
  small to be followed.
- Node is nvm-only on this machine:
  `export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"`.
