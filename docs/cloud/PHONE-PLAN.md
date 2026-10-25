# The phone with the Mac closed: the plan

Status: step 1 built 2026-10-14 (commits on w-1dc7ee2408), reviewed by Codex twice. Step 2 (replies) built 2026-10-24 on w-9f9c2570e2, below. Step 3 (alerts) built 2026-10-23, sent by the computer, and by the cloud server for a turn it ran.

2026-10-24, step 2 for replies. The founder, reading the phone's first screen:
"you have your computer in your backpack and you're riding the bus.
Everything should work from your mobile app with your computer completely
closed." So:
- After each turn of a Claude Code thread on the phone, a computer on the
  managed cloud leaves a KIT in the person's storage (shared/cloud-kit.mjs,
  main/cloud/kit.mjs): the reply run's own arguments with the reply's place
  marked, the folder's bundle, the files a run takes, the sign-in by name.
- The cloud server (cloud/gateway/phone.mjs), every minute, starts a reply
  the computer has not claimed within a minute from that kit, claims the
  command `cloud:<run id>`, and gives the claim back if the run cannot start.
  When the run ends it writes the agent's answer into the phone's copy of
  the thread and sends the alert.
- The computer, waking, joins the run or brings it home
  (main/cloud/run.mjs `joining`), with her reply on the row.
- New threads, files from the phone, Codex threads and permission cards also
  carry on with the computer shut. A Claude Code run's approvals server is
  held by the cloud machine; a Codex run asks on its output, so the server
  cards each approval and refuses the rest in the computer's own words.
- Not yet: a Mac on its owner's own AWS rather than the managed cloud. It
  needs a cloud plan: setup and payment happen on the computer, never in the
  phone app (the founder, 2026-10-24).

2026-10-19, step 1 filled out (an audit of the phone against the desktop): every
file a thread names opens on the phone and any file goes from it; what she
picks with a reply or a new thread (start later, a time, engine, model, effort,
priority, mode) reaches the Mac; Undo takes back what the Mac has not claimed;
Stop, Run now, Send now, Reopen, a schedule and permission cards go to the Mac
as commands (migration 20261019000000, which also lets the phone name a command
so a resend is one); the phone says when it cannot reach the cloud and when the
Mac was last online; it fetches only the threads that changed, 400 lines deep.
Still not on the phone: repeating tasks, pins and dragging a row to a place,
team pages and teammates' names on their lines, and anything with the Mac shut
beyond queueing (step 2, the scheduler in docs/cloud/PLAN.md "Next" step 4).
2026-10-17: a thread's copy also carries whether an agent is running on it (`live`)
and the files it names, uploaded to a private bucket (main/phone-uploads.mjs,
renderer/src/cloud-files.ts, migration 20261017000000_phone_files.sql).

## What she asked for

"The feature we really, really want is to have your computer closed while you
access everything on mobile." And on 2026-10-14: "this doesn't need to apply
to everyone, you don't need to sign in or use cloud to use agentbox. in fact
cloud is the premium version (you have to pay). not sure if mobile use
requires payment tho."

So: opt-in. Agentbox with no account stays exactly what it is. Someone who
turns the cloud on gets an account, their inbox online, and a phone that works
with the Mac shut.

## What exists to build on (mapped 2026-10-14)

- **Accounts and a hosted database**, from the team version: Supabase (Postgres,
  Auth, Realtime), Google or email sign-in (main/team/sign-in.mjs, session.mjs),
  row-level security on every table, and a two-way sync of a project's ledger
  lines (`lines`, main/team/sync.mjs: push by byte offset, pull by `seq`, every
  5 s and on Realtime). A work item online is exactly its ledger lines, and the
  browser-safe `foldWorkItems` rebuilds rows from them anywhere.
- **The phone screen**: the app's own renderer with a phone layout
  (renderer/src/phone.css, browser-bridge.ts), served BY the Mac over Wi-Fi,
  Tailscale or the Cloudflare relay (main/phone-link.mjs, relay/). Dead when
  the Mac sleeps.
- **Cloud runs** (docs/cloud/PLAN.md): every run is proxied by a process on the
  Mac, which also serves the agent's store tools and approvals.

What is missing: a per-person (not per-team) online inbox; a phone that talks
to it instead of to the Mac; something in the cloud that acts on a reply while
the Mac is shut; the agent's own tools and approvals reachable from the cloud;
billing.

## The shape

The online inbox becomes the meeting point. The Mac, the cloud runs and the
phone all read and write the same ledger lines; none needs the others awake.

```
 phone  ─┐                       ┌─ the Mac (syncs, runs threads locally)
         ├──  online inbox  ─────┤
 cloud ──┘    (Supabase lines)   └─ the dispatcher (starts cloud runs)
```

## Phases, each one shippable (revised after Codex's review)

The team sync cannot simply be pointed at one person: it throws away your own
lines coming back from another device (finding 1), its `seq` cursor can skip a
line two writers commit out of order (2), the fold settles equal-time edits by
arrival order (3), and its security is built around teams (4). Phase 1
therefore does not sync ledgers both ways at all.

**1. Read and reply from the phone, Mac shut (the first slice).**
- One project at a time, chosen by her, and one Mac that runs it.
- The Mac PUBLISHES each thread's readable state (title, status, result,
  the conversation so far, attachments it names) to an owner-only table: a
  snapshot, written only by that Mac. The phone reads snapshots; it never
  folds raw ledger lines (finding 5).
- The phone WRITES only to a small command inbox: reply, start a thread,
  snooze, close, each with its own id. The Mac takes each command through the
  existing reply path, writes it into the ledger itself, and marks it taken.
  Until then the phone shows "Waiting for your Mac" on it (findings 6, 7).
- Separate personal tables with owner-only security, tested for owner,
  stranger, teammate and removed member (finding 4).
- Sign-in on the phone: the same Supabase account, through a browser sign-in
  of its own (not the desktop's loopback), and the app's sign-in is never a
  gate: "cloud available" and "signed in" are separate (finding 12).
- The phone screen is the renderer's components with a phone bridge that does
  only what is listed here (finding 13). No push yet (finding 14).
- What she gets: every result and conversation readable anywhere, and replies
  queued from bed. Work continues when the Mac wakes.

**2. Work continues with the Mac shut.**
- A cloud controller: an always-on service that owns a cloud run end to end
  (inputs, acknowledgements, the agent's tools, results), takes commands from
  the inbox, and survives its own restart (finding 8).
- Per-owner mapping to her runtime, her cloud accounts and her storage, with
  quotas; no AWS or vendor credential ever readable by a browser (finding 9).
- A durable checkpoint per thread (code, uncommitted work, transcript) kept
  as long as the thread lives, and the Mac importing it in order when it
  wakes (finding 10).
- Approvals as signed requests the phone answers, or only threads that need
  none run this way (finding 11).
- One executor per thread, then a server-side lease (finding 6).

**3. Push alerts and live progress.**
- Notify on a thread newly needing her, deduplicated, never for backfill
  (finding 14). Live progress lines like today's thread cards.

## How a phone gets in (decided 2026-10-14)

A website we host. "Maybe, if we store everything ourselves, we don't need
that. Maybe we could just have a web application that we host." Settings ›
Phone shows the site's address as a QR code, which carries no key; she signs
in there with the same account.

THE SITE IS THE ONLY WAY IN (2026-10-16). "Should only ever be one way to
access mobile: through the Cloud ... the cloudflare relay was temporary to test
the idea." The app no longer opens its own phone door (same Wi-Fi, Tailscale or
the relay) and Settings › Phone draws only the site's code. An installed copy,
which has no cloud sign-in (`loadCloudConfig` answers null when packaged), has
no phone until it can sign in.

Putting it up: `npm run phone:deploy` (Cloudflare Pages; `npx wrangler login`
once), then the address goes in `~/.agentbox/team.config.json` as `phoneSite` and in
the database's allowed sign-in return addresses, and the migration
`20261014000200_phone_inbox.sql` is applied.

## Step 1 as built, and what Codex's review of it changed

- A copy is built from named fields only, with keys hidden and the home folder
  written `~`, and kept under the size limit in UTF-8 bytes
  (shared/phone-snapshot.mjs).
- Each computer has its own id; its projects online carry it, and it takes only
  the commands left on them, so two computers on one account never take each
  other's commands or overwrite a project of the same name.
- A command is done once: the computer writes down that it is doing one before
  it does it, and after a crash looks for the reply or thread it made before
  doing it again. The database lets a command be marked taken once and never
  changed, whatever Supabase's default grants are (a trigger, tested in
  PGlite with the old defaults switched on).
- Which projects are on the phone is kept under the signed-in person's id, so a
  second person signing in on the same computer starts with none.
- The phone's sign-in throws away any answer for a sign-in that has ended, so a
  renewal in flight cannot undo a sign-out; a refused renewal signs her out.
- Every door the phone does not have says so; Stop says to stop it on the
  computer.
- A reply to a thread started on the phone reaches the row it became; replies
  still waiting are shown however old they are.

Codex's second review (10 more findings) changed:

- Everything the computer sends names the person signed in, and a pass still
  running when she signs out stops; the database refuses a write for anybody
  else.
- A value given a secret's name (`PASSWORD=...`, `"api_key": ...`), Basic
  credentials and long key-shaped strings are hidden too.
- The migration has its own version and replaces the tables of the first
  draft, so a database that ran the draft ends up right.
- Crash recovery looks only for what appeared after the moment written down
  before the command, so an earlier "yes" is never taken for a second one.
- A copy the cloud did not take is tried again, later each time.
- The computer's id is this installation and this store together, kept outside
  the store, so a copied store is another computer.
- The same thread id on two computers is two rows on the phone.
- Refusals show for a day from when they were refused, for all four kinds.
- Starting an agent update, and resuming agents, are the computer's.

Codex's third review (6 findings) changed:

- What a phone command writes carries the command's id (`fromPhone` on the
  ledger line), and crash recovery goes by that id alone.
- The computer claims a command in the database before doing it; Undo on the
  phone only takes back one nobody has claimed, so exactly one of them wins.
- Under a new computer id everything is sent again.
- The migration also replaces the second draft's tables, and adds the tables
  to the live-updates publication only if they are not there.
- Credentials named in the text are hidden whole, short, numeric or quoted;
  "token" alone counts only in an ENV_STYLE name or before a key-like value.
- A stand-in id for a thread shared by two computers never equals a real one.

Codex's fourth review (5 narrow findings) changed: a new thread's command id
is on the line that makes the row; a password value is hidden whatever it
starts with and however long; settings like `MAX_TOKENS=128000` stay; a new
computer id keeps which rows the phone's new threads became; the migration
has a version newer than every draft.

(The relay was briefly deleted in this work and is back: it is deployed and in
use, see "How a phone gets in".)

Still to decide: the installed app has no team cloud at all
(`loadCloudConfig` answers null when packaged), so until that changes only a
copy run from source can put projects on the phone.

## Payment (decided 2026-10-14)

"I feel like phone access should be free for everyone. What we charge for is
using your agents in the cloud (ie., more slots or with computer closed)."
So step 1 and step 3 are free with a signed-in account; step 2's cloud work is
the paid cloud. All three steps are to be built.

## Risks

- Private projects' text moves to our database for those who opt in: the
  privacy and terms pages change in the same release; per-person encryption at
  rest is worth weighing (it would stop the dispatcher reading briefs).
- Two writers (Mac and phone) on one thread: the ledger is append-only and the
  fold already merges lines by time and source, as the team version does.
- The dispatcher and the Mac must not both start the same reply: a claim line,
  taken first-writer-wins in Postgres, decides.
- Supabase cost at scale; Realtime connection limits for many phones.
