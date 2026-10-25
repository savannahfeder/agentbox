# Cloud runs: the build

Status: revised 2026-10-13 after Codex's review of the first draft (its 14
findings are answered inline below, as R1..R14). This file is the handoff
between sessions building it. Keep it current: tick what landed, say what is
next.

## What it is

A thread can run in a cloud sandbox instead of on this Mac. Two reasons, in the
order they matter:

1. **Overflow.** A 16 GB Mac runs two or three agents at once. Every thread
   past that waits. With cloud runs on, a Claude Code thread that would wait
   runs in the cloud instead, so how many run at once stops being the limit.
2. **The lid closes.** A run that is already in the cloud keeps going while the
   Mac sleeps. Its result lands when the Mac wakes. (Starting NEW runs while
   the Mac sleeps needs a scheduler in the cloud; that is phase 2, below.)

## Settled decisions (do not reopen)

- AWS Bedrock AgentCore Runtime, us-east-1, in the user's own AWS account, paid
  by AWS credits. One microVM per run (2 vCPU / 8 GB ceiling, 8 h max).
- The agents run on the user's own Claude and ChatGPT plans, never an API key
  and never Bedrock pay-per-token ("We simply cannot use an API key").
- **Every sign-in happens in the cloud and stays there** (2026-10-14, below).
  The Mac never copies, holds or sends a Claude or Codex login.
- The cloud side is a plain remote computer: it starts a command, keeps what
  it prints, and carries the app's tools through as raw lines. It never learns
  what a harness or a tool is.
- A budget alarm that counts spend before credits exists (`agentcore-sandboxes`,
  made by the spike, w-bad6fbae78).

## Sign-ins live in the cloud (2026-10-14)

Why. Anthropic's terms (code.claude.com/docs/en/legal-and-compliance) let a
platform host the unmodified Claude Code binary with each person signing in
with their own subscription, and forbid a developer to "collect, store, or
intermediate Claude.ai credentials or session tokens — sign-in to a Claude
account must complete through Anthropic's own flow". Copying the Mac's
login into the cloud, which the first build did, is the forbidden half.
OpenAI's partner program for hosted ChatGPT logins is Sign in with ChatGPT
(applied for 2026-10-14; "early Q4"). It is NOT a gate: cloud Codex is open
to everyone now (the owner's call, 2026-10-22: approval may take a long time,
and tools like Conductor already host Codex on people's own ChatGPT logins).
The founder chose: one sign-in per account, done inside the cloud through
each vendor's own sign-in, kept between runs.

- **Signing in.** From the cloud menu, per account. The Mac starts a sign-in
  session in a sandbox (`{action:'signin', engine, saveUrl}`); the sandbox
  runs the vendor's own command as the agent user:
  - Claude: `claude setup-token`, Anthropic's documented sign-in for machines
    with no browser. Its token lasts a year and only makes model requests, so
    nothing ever renews it and parallel runs share it safely. It draws on a
    terminal only, so it runs under util-linux
    `script -qe --echo=never -c '...' /dev/null` (no typescript file, no echo
    of the code), 4000 columns wide. The sandbox sends the Mac the sign-in
    link only, once a whitespace ends it (never a half-read link); the person
    pastes Claude's code into the menu; it goes to the command
    (`signin-code`). The token is read by the sandbox server, checked with one
    word from Claude, and PUT to the login's object. It is never an event,
    never in the log, never sent to the Mac.
  - Codex: `codex login`, its ordinary browser sign-in (`flow: 'browser'`).
    The first build used `codex login --device-auth`, but ChatGPT refuses a
    device code unless the account turned "device code sign-in" on in its
    Security settings (2026-10-21), and a workspace admin can keep it off.
    `codex login` sends the browser back to http://127.0.0.1:1455/auth/callback
    on the machine it runs on. The sandbox sends the Mac the link; the Mac
    listens on that address while the person signs in
    (`main/cloud/browser-return.mjs`) and passes the query, a one-time code
    only the sandbox's Codex can spend (PKCE), to the sandbox
    (`signin-callback`), which hands it to Codex and follows its redirect to
    `/success` itself, because that link carries the id token. This is
    OpenAI's documented SSH port-forward for remote machines, done by the
    app. A sandbox image older than this ignores `flow` and runs the device
    code sign-in, and the Mac shows the code as before. Either way Codex
    writes `auth.json` in a scratch `CODEX_HOME`, which the sandbox PUTs.
    The sandbox also reports the
    account's email from the id token, which the Mac checks against the
    account it is signing in (a different ChatGPT account is refused).
  The sandbox tells the Mac only `saved` (with the expiry, for Codex) or
  `failed` and why. The session is busy for AgentCore only while it waits,
  20 minutes at most, and the Mac stops it as soon as it ends.
- **Where a login lives.** `logins/<engine>/<id>.json`, where the id is a
  fresh random one per sign-in, kept in `~/.agentbox/cloud-logins.json` with
  when it was saved, its expiry, and whether it stopped working; no secret is
  in that file. A new sign-in is a new object, so nothing old can overwrite
  it, and the old one is deleted. The bucket's expiry rules cover `runs/` and
  `build/` only. The app's IAM user may get, put and delete `logins/*`
  (presigned links carry the signer's rights); links to a login last 30
  minutes. The Mac's code only ever presigns them; nothing on the Mac GETs a
  login (tested). On her own AWS account the Mac's IAM user could still read
  one; the managed version keeps logins behind a server.
- **A run.** The start carries `login: {engine, id, url}`. The sandbox fetches
  it before the command starts:
  - Claude: `CLAUDE_CODE_OAUTH_TOKEN` in the command's environment only.
  - Codex: `CODEX_HOME/auth.json` with the refresh token replaced by a
    placeholder and `last_refresh` set to now, so Codex runs on the access
    token and does not try to renew on age (a renewal would rotate the login
    under every other run). A copy whose access token has under 30 minutes
    left is refused before anything starts.
  - A Claude run also carries the person's Codex login when one is ready
    (`also: [{engine: 'codex', id, url}]`, 2026-10-23), written the same way
    into the agent's `~/.codex`, so the agent can call `codex` there as it can
    on the Mac. It never stops a run: a missing or nearly spent one leaves
    Codex signed out. A Codex run carries nothing more, because Claude's token
    lasts a year and Codex's cannot renew itself here.
  A run never writes its login back. Whatever the run prints, on stdout,
  stderr, the tool bridge, or in the transcripts that come home, has the
  login's text replaced by `[cloud sign-in]`, a tail that could be the start
  of one held back until the next bytes say. That is a guard, not a promise:
  an agent can read its own login and could encode it.
- **Codex renewal.** A ChatGPT access token lasts 240 h. A login with under 3
  days left is renewed by the supervisor on its own clock, whether or not a
  run is waiting, one renewal per account at a time, fenced across an app
  restart by a `renewing` mark with its start time in cloud-logins.json. The
  renewal session takes the real `auth.json` with `last_refresh` set far in
  the past, so Codex renews on its first request, runs one tiny `codex exec`,
  and PUTs the renewed file whatever that request answered. A renewal that
  cannot renew marks the login as needing a new sign-in.
- **A login that stops working.** Never read from what an agent prints. A run
  that fails makes the sandbox ask the login itself: for Claude one word on
  that token; for Codex whether its access token has run out. A refused or
  missing login becomes a `login` event naming its id; the proxy brings the
  work home and exits 77, which the supervisor takes as a transport fault
  that strikes no account (the Mac's own login is not the cloud's). The
  Mac marks that login id broken only if it is still the current one, so an
  old run cannot undo a new sign-in; an expired Codex login is renewed
  rather than marked.
- **Codex's command.** The cloud keeps `codex app-server`. Moving to
  `codex exec` would not change what OpenAI's terms say about hosted
  ChatGPT logins (Codex's review, finding 2: Sign in with ChatGPT supports
  app-server itself), and it would cost live approvals and mid-turn replies.
  Cloud Codex is for everyone, with or without the partnership (2026-10-22).
- **What goes.** The keychain token (`readClaudeToken`/`saveClaudeToken`),
  the Mac-side `setup-token` driver (main/cloud/signin-flow.mjs),
  scripts/cloud-signin.mjs, and the Mac's `auth.json` copy
  (`codexCloudAuth`). On start the app deletes its own old cloud tokens from
  the keychain and `~/.agentbox/cloud-tokens.json`; the Mac's ordinary Claude
  and Codex logins are never touched.
- **Still a judgement call.** The sandbox reads the token `setup-token`
  prints and keeps it for the person's later runs. That is the hosted
  environment keeping the vendor's own sign-in, which the hosting clause
  covers in spirit; the page does not say so outright. Anthropic's page
  offers a sales contact for exactly this question.

## Codex in the cloud (added 2026-10-13: "a fundamental requirement")

On the Mac, every Codex thread of one login runs inside one shared
`codex app-server`, spoken to over JSON-RPC (main/codex-app-server.mjs). A
cloud Codex thread gets an app-server of its OWN, in its sandbox:

- **The connection.** `createCodexAppServer` already takes any process that
  speaks the protocol on stdin/stdout. For a cloud thread that process is
  `main/cloud/run-cli.mjs --agentbox-codex app-server`, the same proxy, whose
  remote command is `codex app-server`. Approvals are server requests on the
  same stream, so they reach the existing cards untouched; steering and
  interrupts are client requests on it.
- **The app's tools.** Codex is told its MCP servers inside `thread/start`
  and `thread/resume` (`config.mcp_servers`), not on a command line. The
  proxy reads those two messages on their way in, swaps each server's command
  for the sandbox's stub, and keeps the original to run here, exactly as for
  Claude Code. Entries with `enabled: false` (her own servers, switched off)
  pass untouched.
- **The sign-in, with nothing for her to do.** Measured 2026-10-13 on this
  Mac: a ChatGPT-plan Codex access token lasts 240 h and Codex renews it on its
  own about every eight days. The sandbox gets a copy of `auth.json` whose
  refresh token is a placeholder: Codex runs on the access token (a real
  `codex exec` answered from such a copy, no 401s) and can never renew, so it
  can never rotate the login and sign the Mac out; the placeholder was
  untouched after the run, and both real logins still read signed in. A login
  whose access token has under 9 h left stays on the Mac until Codex renews it
  there. Codex access tokens (`codex login --with-access-token`) are Business
  and Enterprise only, and the app-server's `chatgptAuthTokens` mode is marked
  "for OpenAI internal use only", so neither is used.
- **The transcript.** Codex finds a thread by scanning `CODEX_HOME/sessions`.
  The sandbox's `CODEX_HOME` is the Mac's path, holding only the sign-in and,
  for `thread/resume`, that thread's rollout (sent when the proxy sees the
  resume go by); its `sessions/` comes home after the run.
- **The end.** A Codex worker ends when its turn ends, before the proxy has
  brought the work home. So a cloud Codex worker's `exit` is held until the
  proxy has exited: the worker's end closes the connection, which stops the
  remote app-server; the sandbox uploads, the proxy imports, and only then
  does the supervisor see the run end. Exit 75 from the proxy arrives as a
  transport fault, as for Claude Code.

- **The sandbox is the machine** (her decision, 2026-10-13). Codex's own
  command sandbox (bubblewrap) cannot nest inside an AgentCore microVM:
  measured, every write and command was refused. A `workspace-write` thread
  therefore runs with full access inside the throwaway VM, as OpenAI's docs
  advise for containers; read-only stays read-only, approvals are untouched.
- **Fresh threads only.** A Codex resume runs on the Mac, whose shared
  app-server may hold the thread loaded. A thread that started in the cloud
  resumes on the Mac from the rollout that came home (measured: it did, and
  remembered what it had done).
- **Measured end to end against real AWS**, with the app's own thread settings
  (`workerThreadParams`): Codex ran commands, wrote and committed a file,
  called the store tool on the Mac, and the commit and rollout came home in
  16 s; only the store tool was connected, her ChatGPT apps and plugins off.

## v1 scope, and what is deliberately left out

- **Claude Code and Codex.** Other harnesses later, each a small adapter.
- **A quit leaves a Claude run going (2026-10-15).** Stop, archive and
  preemption cancel a cloud run and bring its work home, as before. Quitting
  the app sends the proxy SIGHUP instead: the agent's input is closed, so it
  ends after the turn it is in; a store call the app can no longer answer is
  answered with an error saying so; and the marker keeps the proxy's place in
  the event log. When the app opens, the process that brings cloud work home
  joins the run: it starts the store servers again, says each connection's
  handshake to them again, serves the calls the agent made meanwhile, and
  brings the work home when the run ends. The folder's marker holds every new
  run back until then, so there is never a second run on the row, and the
  joiner saves its place as it goes so no call is served twice. A Codex run is
  still cancelled on quit: its app-server ends at once when its input closes.
- **The project's documents folder travels (2026-10-15).** Its small files and
  the thread's own `designs/<id>`, newest first within 50 MB (2026-10-17: a
  thread whose designs did not all fit used to stay on the Mac, and those were
  the busy ones), go up at the same path (main/cloud/docs.mjs); what the agent
  writes there comes back every 10 s and at the end, never over a file changed
  on the Mac meanwhile, and never over one the run did not take (`docs.sent` in
  the marker): those keep their place and the run's copy goes beside them.
- **A project with no repository runs in the cloud too (2026-10-20).** Its
  agent works in the documents folder, so the run sends no bundle (`plain` in
  the start) and its documents are its folder; what comes home is the
  documents and the conversation. Every thread of such a project shares that
  folder, so each keeps its marker in the app's own data
  (`cloud-runs/<project>--<thread>.json`, Supervisor#_plainMarker), not in a
  git directory. Only once the image says `plain` in its caps; until then those
  threads run on the Mac as before. Before this, Personal, My Workspace and
  Direct were 17 of the founder's 31 open threads, all on the Mac with
  Everything on.
- **The Mac sleeping is not a restart.** The app, the proxy, the store server
  and the approvals server all freeze together and thaw together; their memory
  is intact. The sandbox keeps going. A store call it makes while the Mac
  sleeps waits (the remote command gets `MCP_TOOL_TIMEOUT` of 8 h). An approval
  asked while the Mac sleeps is refused 15 minutes after it was asked, by wall
  clock, exactly as a local one would be (R7); the agent carries on with what
  it may do.
- **No `look_at_page`** in the cloud: it would open Chrome on the Mac against
  the Mac's localhost, not the sandbox's (R10). The proxy refuses a call to
  it. It stays in the tool list: when it was dropped, a thread that moved from
  the Mac to the cloud was told its store server had disconnected, and
  believed it (2026-10-16).

## How it works

### The proxy: one local process per cloud run

For a cloud run the supervisor spawns `main/cloud/run.mjs` in place of
`claude`, with the same argv, env and cwd, through Electron's node
(`ELECTRON_RUN_AS_NODE`), the way the approvals server already runs. It is a
duplex pipe (R8): stdin bytes go to the remote command in order, EOF included,
so the prompt the supervisor writes after spawn, live replies, interrupts and
the close at the end all reach Claude Code exactly as they do locally. Remote
stdout and stderr come back byte for byte. Its life:

1. **Launch manifest (R9).** From the argv and env it builds an explicit list,
   never the host environment wholesale:
   - the `--settings` file, rewritten without the memory-gate hooks (R12);
   - the `--mcp-config` file, rewritten so each server is
     `cloud/sandbox/mcp-stub.mjs <name>`;
   - for `--resume <id>`, the transcript file at the same path under the same
     account folder;
   - every file under the product's folder named in the prompt or the
     appended system text (attachments), up to 25 MB each;
   - env: `ZERO_PRODUCT`, `ZERO_ITEM`, `CLAUDE_CONFIG_DIR` (always set, to the
     account folder's Mac path), git's author name and email, `MCP_TOOL_TIMEOUT`,
     `CLAUDE_CODE_OAUTH_TOKEN` for that account. Nothing from `memoryGateEnv`.
2. **Pack.** `git bundle` of the task branch, `main` and `origin/main` to S3.
   Sent whole, that was 61.9 MB for this repo on every reply (2026-10-20). An
   image that says `base` in its caps takes a base instead: where the branch
   meets main, bundled once and shared by every thread of the repo for six
   days (`runs/cache/<period>/`, inside the bucket's seven-day expiry), plus
   a bundle of only the commits past it (0.4 MB a day after the base, 3.3 MB
   six days after) and each ref's commit, since a thin bundle leaves out the
   refs the base already holds. The Mac remembers the caps from the last start
   (`~/.agentbox/cloud-image.json`). Skills, commands, agents and saved
   memories go to the same cache, named by what they hold, and go up again
   only when that changes. Everything is sent side by side, not in turn
   (main/cloud/reuse.mjs). A pending-import marker goes into the task
   folder's git dir (`<git dir>/agentbox-cloud.json`), naming the run id and the
   start commit.
3. **Start.** `InvokeAgentRuntime {action:"start"}` with presigned URLs: a GET
   for the bundle and each file, and PUTs for every result (R11). The sandbox
   checks the bundle out at the SAME absolute path as the task folder, so the
   brief's paths, `--resume` and the transcript's folder name are identical.
4. **Run.** Long-polls `{action:"events", since}`; writes stdout and stderr out;
   feeds `mcp` lines to the REAL local servers (started from the original
   `--mcp-config` with the worker's own env, exactly as Claude Code would start
   them) and returns their lines with `{action:"mcp"}`. MCP traffic is never
   resent: the cursor lives in memory and only moves forward (R5).
5. **Finish.** When the command exits, the sandbox itself uploads the new
   commits, the uncommitted work (one commit on its own ref) and the account's
   `projects/<folder>` transcripts to the PUT URLs, plus the full event log,
   whether or not the Mac is awake (R11). Then it lets the session go idle.
6. **Import.** The proxy downloads them (from S3, not from the sandbox, so a
   reaped session loses nothing), fetches the commits into a staging ref,
   fast-forwards the task branch only if its tip is still the start commit (if
   not, the cloud commits stay on `refs/agentbox/cloud/<run>` and the run
   reports it), applies the uncommitted work, unpacks the transcripts, removes
   the marker, and exits with the remote exit code.
7. **Cancel.** On SIGTERM (Stop, archive, preemption) the proxy signals
   the remote command, waits up to 30 s for it to exit, and then does 5 and 6.
   If it cannot reach the sandbox it exits with a failure and leaves the
   marker.

### Guards in the supervisor

- **Shipping waits for the import (R3).** `nextToShip` skips a folder whose git
  dir holds a pending-import marker, so a `ship` label added by a cloud worker
  can never ship the stale local branch.
- **Folder cleanup waits too.** Release and park skip a folder with a marker.
- **Delivery (R4).** A proxy that ran the remote result to the end but could
  not import exits with a distinct code (`75`, EX_TEMPFAIL) and writes nothing
  to stdout after the result; the supervisor treats that code as a transport
  fault (redeliver, no attempt spent) rather than a finished run.
- **Slots (R13).** Local capacity counts local sessions only. A Claude thread
  may take a cloud slot when no local slot is free, cloud runs are on, fewer
  than `maxCloudSessions` cloud runs are live (default 50 through the shared
  host, 20 without it), and an account is healthy. With Everything
  (`cloudRuns: 'all'`) a thread that may go to the cloud waits for a cloud slot
  (cap, two starting, accounts at their limit or renewing) and never falls back
  to the Mac (2026-10-17, her Mac overloaded with Everything on). "Starting"
  is this Mac packing and sending a run; once the cloud takes its start, the
  next one begins (2026-10-20), and the run's log says how long each part of
  its start took. At most two
  runs bring their work home at once, through files, across every process. Account cooldowns and the fleet brake apply to cloud runs exactly as
  to local ones.
- **Hangs.** The reaper is unchanged: silence plus an expired claim. The store
  server runs on the Mac, so its heartbeat renews the claim for a cloud run
  exactly as for a local one.

### The sandbox

`cloud/sandbox/`: an arm64 image (Node 22, git, Claude Code) running
`server.mjs` on :8080 (`/ping`, `/invocations`). One run per microVM. It keeps
every event numbered for replay, answers `HealthyBusy` from start until its
results are uploaded, and holds the bridge socket that `mcp-stub.mjs` uses.
Built and tested (cloud/sandbox/*, tests/a-cloud-sandbox-*, tests/a-cloud-run-*).

### AWS setup, once

`scripts/cloud-setup.mjs`, run with an admin sign-in (`aws login`), creates or
updates, idempotently: the S3 bucket (block public access, objects expire after
7 days), the ECR repository, a CodeBuild project that builds the arm64 image
in AWS (no Docker on the Mac), the runtime's execution role (ECR pull and logs
only: the sandbox reaches S3 through presigned URLs and holds no AWS rights of
its own), the AgentCore runtime, and an IAM user for the app that may invoke
and stop sessions on that one runtime and read and write that one bucket. Its
key goes into `~/.aws/credentials` as the `agentbox-cloud` profile (0600), so
the app never runs on the 12-hour `aws login`. Names and ARNs go to
`<app data>/cloud.json`, never to git.

### Turning it on

On by itself once a Mac has run the setup script and an account has signed
in for the cloud from the cloud menu (see "Sign-ins live in the cloud"); a
Mac that has done neither is exactly today's app. Three settings, chosen
from the cloud button: `cloudRuns: false` is "This Mac only", null is "When
this Mac is full", `'all'` is "Everything" (the cloud first; this Mac for
what cannot go there or when the cloud is at its cap).

This Mac's memory gate (main/start-hold.mjs) holds only this Mac: a row it
holds goes to the cloud when a cloud slot is free (`_roomFor`).

### What the user sees

THE CLOUD'S ACCOUNTS ARE THE ONES SHE ADDS (2026-10-14, after her first real
try: "we shouldn't predefine which accounts to sign up with ... maybe I want
to sign in with my work account"). A cloud account is filed under its own key
(`acct-…`), named by its email when the vendor says it (Codex always; Claude
when Anthropic's profile answers), and a cloud run of an engine takes the one
of that engine's accounts used least recently (`pickCloudLogin`). The Mac's
own accounts only decide where a conversation is kept. Claude's code comes
back from the clipboard by itself the moment she returns to the app (only
while a Claude sign-in waits for one, and only text shaped like one), because
on that try she approved on Claude's page and waited, not seeing that the code
had to come back.

Setting up (approved 2026-10-14, then reworked the same day): until an account can run in the cloud, the
cloud button wears the accent dot and its menu is one invitation, "Set up the
cloud". That opens a full screen (renderer/src/components/CloudSetup.tsx): what
the cloud gives and which accounts will sign in, then one screen per account
(the vendor's page opens by itself; Claude's code is pasted, Codex's is typed
there), then where new threads should start. Once some accounts are signed in,
the menu's top line says how many are left. Picking a choice never opens the
setup by itself.


A square cloud button beside the filters button, drawn only on a Mac set up
for the cloud, wearing how many threads run there while any do. Its menu is
built like the filters menu: the three choices with the picked one in
orange, one line on what it does, and this month's agent-hours and
estimated cost. Approved 2026-10-13 after four rounds of screenshots
(designs/w-1dc7ee2408/).

### What each run used

The sandbox measures its whole machine, which is what AWS bills: CPU time
(cgroup v2 cpu.stat, else /proc/stat) and memory's high-water mark
(memory.peak, else sampled), plus wall time (cloud/sandbox/usage.mjs).
done.json carries it home and the Mac keeps one line per run in
~/.agentbox/cloud-usage.jsonl; `node scripts/cloud-usage.mjs` summarises it
at AgentCore's published rates. The plan limits are set from these.

## Plans (decided 2026-10-13, numbers to be set from measured use)

- Sold as "+N agent slots": agents running in the cloud at once, on top of
  this Mac's. A monthly agent-hour limit sits behind each plan, high enough
  that most people never reach it; past it, threads wait for the Mac.
- Pro $40 +10 slots and 400 hours a month, Plus $100 +25 and 1,200 hours,
  Max $200, unlimited at once, and 3,000 hours (the owner's hours,
  2026-10-20, against a measured $0.07 an agent-hour). Max's unlimited has
  a ceiling of 200 at once that is never shown, so one runaway loop cannot
  take the AWS session limit every customer shares. No top-ups for now.
- A cloud hour is one agent working for one hour; waiting for a reply is
  free (a run ends with its turn). Each agent is its own machine, billed on
  what it uses, so packing agents onto one machine would not save money.
- AWS lets this account run 5,000 sessions at once and start 25 a second
  (checked 2026-10-13; both can be raised).
- No free cloud (the owner's call, 2026-10-20, replacing "Free: 5 hours,
  no card"): five hours go in half an hour with ten agents, which sells the
  cloud short, and the moment someone reaches for it is the moment they will
  pay. The app itself is the free part. Sign-in is the app's own sign-in
  page.

## Phases

1. Spike: AgentCore measured for real. Running as w-bad6fbae78.
2. **Done.** The sandbox image and server (cloud/sandbox/), with the bridge.
3. **Done.** `scripts/cloud-setup.mjs`, run against the real account
   2026-10-13: bucket, ECR, CodeBuild ARM build, roles, runtime, app user.
4. **Done.** The proxy (main/cloud/run.mjs, run-cli.mjs, aws.mjs), tested end
   to end against the real sandbox server on one machine, and against real
   AWS with a shell command in place of Claude Code: packed, started,
   committed in the sandbox and brought home in 11 s. The microVM measured:
   aarch64, 2 vCPU, 8 GB, 8.8 GB disk.
5. **Done.** The supervisor's placement, slots, guards (ship, cleanup,
   restart) and exit-75 handling, with tests. The lid, measured against real
   AWS: the Mac-side process frozen (SIGSTOP, as in sleep) for 50 s while the
   sandbox ran a 25 s job; on waking it read the rest and brought the commit
   and the loose file home 2 s later.
6. **Sign-ins made in the cloud** (2026-10-14, above). Then a real Claude
   Code thread of this repo runs in the cloud, writes to the store, asks for
   an approval, commits, ships.
7. Phase 2, filed separately: Codex in the cloud, new runs while the Mac
   sleeps, replies from the phone, and a managed version for people with no
   AWS account.

## How it was checked

Codex reviewed the plan twice and the code twice (scripts/scratch/cloud, not
committed); every finding is either fixed or written down above as a limit.
Tests: tests/a-cloud-sandbox-runs-one-command-and-replays-what-it-printed,
a-cloud-run-reaches-the-apps-tools-through-the-sandbox,
a-cloud-run-brings-the-agents-work-home, a-cloud-run-sends-only-what-it-may,
a-thread-runs-in-the-cloud-only-when-this-mac-is-full,
a-thread-running-in-the-cloud-says-so.

## Turning it on, for whoever runs this Mac

1. `aws login --region us-east-1` (an admin), then
   `node scripts/cloud-setup.mjs`.
2. In the app, the cloud button: Sign in. It walks each account through its
   one sign-in, made in the cloud. An account without one keeps its threads
   here.

That is all: cloud runs are on for a Mac that has been set up, and nowhere
else. `"cloudRuns": false` in zero.config.json turns them off.

## Next: the Mac shut, and fewer Mac resources per run (reviewed by Codex 2026-10-17)

Each cloud run is still one relay process on the Mac (~75 MB) with its own
tool servers (approvals ~46 MB, the store), and every store call or approval
waits for the Mac; the end of a turn waits for the Mac to close the agent's
input. In order:

1. **Done (2026-10-17): a run keeps going and ends while the Mac sleeps.**
   The start asks for it (`offline`), the image says it can (`caps`). Away
   (no word from the Mac for 90 s), a tool call is answered in the sandbox
   "not made" (the handshake and tool list from the app's own earlier
   answers), a call the Mac had not taken up is answered "maybe" and is
   refused when the waking Mac asks to make it (`mcp-claim`), and a Claude
   Code turn that has ended, with every message taken up and nothing in the
   background, has its input closed there; the Mac reads that as the end of
   the run, and a reply that arrived too late is kept for the next one.
   Codex turns still end only with the Mac. Needs the image rebuilt.
2. **Done (2026-10-17): one process for every cloud run.** Every run's relay
   lives in one host (main/cloud/host.mjs), started detached by the supervisor
   and ending a minute after its last run; the supervisor holds, per run, a
   Perl stand-in (scripts/cloud-shim.pl) that carries input, output, signals
   and the exit code, so a cloud run is still one process to it. The relay
   serves the approvals and store servers in-process, one channel per
   connection. Measured on a Linux box with 50 idle runs, each with both
   servers open: about 11 MB a run (host 99 MB in all, stand-ins 9 MB each),
   against about 110 MB a run with a relay and servers of their own. A machine
   without /usr/bin/perl runs each relay on its own, as before. The pack, the
   import and the documents' tars run as child processes awaited one by one
   (main/cloud/exec.mjs), so one run's git never holds the others (2026-10-19).
3. **Done (2026-10-19): what an agent writes on its thread while the Mac
   sleeps is made when it wakes.** The Mac names at start the store calls safe
   to make late (`KEPT_WHILE_AWAY`: update_work_item, create_work_item,
   write_document); while it is away the sandbox answers those "kept, and made
   when your computer is back" (not "made", and with no id) and records each
   in the run's events; the relay makes them through its own store server on
   reading them, before the run comes home, and says when one is turned down.
   Reads and claims are still "not made". Needs the cloud image rebuilt (the
   `kept` cap); an older image behaves as before.
4. **A scheduler in the cloud, so new runs and phone replies start with the
   Mac shut.** Built for replies on the managed cloud 2026-10-24
   (docs/cloud/PHONE-PLAN.md, step 2); new threads still wait. The design as first written: it needs AWS rights of its own and a deploy from a
   machine signed in to her account. The shape: a small always-on service
   (Lambda on a schedule, or a long-poll worker) that reads `phone_commands`
   for devices whose Mac has not written for 15 minutes (the projects'
   heartbeat), and for each reply or new thread starts a cloud run itself
   from the last branch bundle the Mac uploaded for that thread, with the
   thread's brief and transcript; it marks the command taken with the run id,
   and the Mac, waking, joins that run as it joins one left going on a quit
   (main/cloud/run.mjs `joining`). It needs, per thread, a durable checkpoint
   (bundle, uncommitted work, transcript) kept for the thread's life, which
   the Mac writes after every turn, and a lease so one executor at a time owns
   a thread.

## Releasing the cloud to everyone (w-6633e825a7, 2026-10-19)

Everything above runs in the owner's own AWS account, set up by a script with
an admin sign-in. Nobody else has that. What a release needs, in the order
approved:

1. **The cloud server** (below). Built first; deployed with no way in for
   strangers until step 3 is done.
2. **Terms, before anyone can sign up** (Codex's review, 2026-10-20). The
   privacy and terms pages rewritten (they say nothing is hosted), with
   refunds and acceptable use, and an accept step a person passes before
   their first cloud key. Anthropic's Commercial Terms accepted, and their
   sales asked about keeping each person's `setup-token` between runs.
   Codex is open to everyone from the release; OpenAI's Sign in with ChatGPT
   approval is not waited for (the owner's call, 2026-10-22).
3. **Accounts.** The app's own sign-in page (Google, or an email and a
   password), not new screens (the owner's call, 2026-10-20). The Google
   consent screen published (name and email only, so no Google review),
   brand verification on our domain, the database's public address and key
   carried by public builds, signing in for the cloud kept apart from the
   team version, and the database's access rules reviewed before strangers
   can sign up to it. Since 2026-10-23: Sign in and Create account are tabs,
   Create account asks a name and alone carries the terms line, a sign-in
   sends no agreement (the server keys someone who never agreed only after
   "Agree and continue"), and the order is plan in the invitation, account,
   Stripe, then the Claude or Codex account.
4. **Plans** enforced by the server (below), with the hour limits set from
   `node scripts/cloud-usage.mjs`.
5. **Stripe**: checkout, the page where people manage their plan, and its
   notices writing the plan into the server's ledger. A Stripe account of
   its own (Agentbox) in the company's organization. `scripts/stripe-setup.mjs`
   makes the products, prices, billing page and webhook from `plans.mjs`
   and stores the key and webhook secret in Secrets Manager; the server's
   `/v1/checkout`, `/v1/billing` and `/v1/stripe` do the rest. A webhook is
   read against Stripe, never believed. Before real money: activate the
   account, choose Managed Payments or Stripe Tax, run it with `--live`.
6. **Upgrade prompts in the app.** Before drawing any, tell the person: they
   will ask the cloud buildout thread (w-1dc7ee2408) for the "you could run
   more agents" designs it made.

### The cloud server

A Lambda behind a function URL, in the same account and region as the
runtime (`cloud/gateway/`). The Mac's two interfaces (transport and storage,
`main/cloud/aws.mjs`) get a second implementation that talks to it
(`main/cloud/managed.mjs`); `run.mjs` and `logins.mjs` do not change.

- **Who is asking.** A Mac trades the person's signed-in session for a cloud
  key once (`POST /v1/devices`, checked against the database's own
  `/auth/v1/user`). The key is random, kept on the Mac at
  `~/.agentbox/cloud-key` (0600), stored by the server only as a hash, and
  revocable. Every other call carries it. A key, not the session, because the
  relay runs for hours, through sleep, in a process that cannot read the
  app's encrypted session.
- **Each person's things are theirs.** The Mac names keys and sessions as it
  does today; the server puts the person in them: `runs/<x>` is stored at
  `runs/u-<person>/<x>`, `logins/<x>` at `logins/u-<person>/<x>`, a session
  `<s>` is `u-<person>-<s>` in AgentCore. Nobody can name another person's.
  The lifecycle rules on `runs/` still apply.
- **A sign-in is never handed to a Mac.** The managed storage names a
  sign-in, `agentbox-login:<key>`, for reading and for saving alike, and the
  server swaps the name for a real link only inside a call to the sandbox.
  A real link in a sign-in field is refused, and so is a Mac's own link to
  read or write one. An agent running with a sign-in can still read it
  from its own environment: a stolen cloud key is a stolen sign-in.
- **A confirmed sign-in.** Google, or an email address its owner confirmed.
- **Links outlive the run.** A link signed with the Lambda's own role ends
  when that role's session does, so the server signs with a separate user's
  key (`agentbox-gateway-signer`, S3 rights on `runs/` and `logins/` only),
  kept in Secrets Manager. The role itself cannot read a sign-in or a run's
  files.
- **Plans.** The ledger (`ledger/` in the same bucket, written with S3's
  conditional writes, no database) holds each person's plan, their live
  sessions, the seconds used per month, and one record per run (`ledger/runs/`,
  how long and how it ended). A start is refused when there is no plan, the
  plan's agents are all running, its hours are spent, or the cloud is paused. A live session
  takes only the same start again, never a run on a sign-in's session.
- **Whatever stops being counted is stopped.** A run ends when its
  `done.json` lands, when the Mac stops it, when the sandbox says it failed,
  when the month's hours run out (checked on every call and by the sweep),
  or at AgentCore's 8-hour ceiling, and its session is stopped then. The
  Mac holds the link that writes its own `done.json`, so a run cannot end its
  counting and keep its machine. A stop that lands while a start is on its
  way is stopped again once the start returns. A run's stop and its record
  are written as owed in the same write that ends it, so a function that
  dies next leaves them for the sweep; a stop AWS did not take is retried
  for an hour, then given up in the log; a session AWS says is not there
  counts as stopped. A run's time is charged to each month it ran in. A call to a session that is not live is answered
  `no-run` without asking AgentCore, which would make a machine for it. The
  Mac stops its session when a run fails or its work is home.
- **The sweep**, every 5 minutes: ceilings, spent hours, a `done.json` whose
  notice was missed, and stops to retry.
- **The owner's hand** (`scripts/cloud-gateway-admin.mjs`, a direct call,
  never the public address): set a plan, turn a person off (their runs stop,
  every key of theirs is refused), pause or resume new runs. The budget the
  spike made pauses new runs when the month's spend passes it.
- **Big calls.** Lambda takes and gives at most 6 MB; a call or an answer
  over 4 MB goes through the person's own `runs/calls/`. A refusal reaches
  the Mac as an answer, never a throw, so nothing retries it for ever; a
  throttle (429) is retried.
- **The Mac.** `cloud.json` holding `gateway` (an address) instead of a
  bucket and runtime makes this Mac a managed one. Her own setup is
  unchanged.
- **Closed before strangers (2026-10-22).** A link that writes needs a plan,
  and only a sign-in or a renewal may save a sign-in. While someone holds such
  a link the sweep weighs their `runs/`: at 200 GiB no new one, past 400 GiB
  the newest objects go. A cloud key unused for 30 days is refused; a person
  can end their other Macs' keys, and the owner every key of a person
  (`cloud-gateway-admin.mjs sign-out`). The signer's key works only inside a
  link, cannot list sign-ins, and is replaced every 90 days; a trail emails an
  alarm on any other use of it, or when someone reaches the storage cap.
  Still open: no button to sign out other Macs yet, and a reused link's
  request and download costs are bounded only by a plan and the budget.

## Known limits

- With the lid shut a cloud run keeps working; its writes to its thread are
  kept and made on wake (step 3), but a read or an approval is not made: it is
  told so and says it in its last message. A kept write turned down on wake
  (another session holds the row) is said on the run's log, not retried.
  Starting new runs with the Mac shut is step 4 of "Next" above.
- A run whose folder changed on this Mac while it was away, that ended on
  another branch, or that would not lay in three times, goes on a branch
  `cloud/<item>`; the row gets a note, moves to Needs you and loses `ship`
  (2026-10-19). Amending or rebasing a commit that existed at the start comes
  home as it is, the old tip kept on `refs/agentbox/before-cloud/<run>`.
- After three cloud runs in a row fail before their agent starts, no new rows
  go to the cloud for ten minutes and the cloud menu says why; the count is
  kept in memory, so a restart forgets it.
- A thread the cloud hands back (its request needs something only the Mac
  has), or whose cloud starts die three times running, runs that one request
  on the Mac. Once a run there answers it, the next reply goes to the cloud
  first again. Only "Keep on this Mac" in the thread's menu keeps a thread on
  the Mac for good (2026-10-20).
- The cloud menu says when the image's Claude Code or Codex is a different
  minor version from this Mac's; across a major version that engine's threads
  stay on the Mac until the image is rebuilt.
- The budget the spike made (`agentcore-sandboxes`) counts all of the
  account's spend, not only cloud runs.
- The sandbox is Linux: a project that builds with Xcode cannot run there,
  and nothing yet keeps such a project on the Mac.
- Each run starts on a fresh machine. The agent installs what it needs
  (`sudo` is cloud/sandbox/sudo.mjs, handing the command to the root server,
  since AgentCore's no_new_privs stops a real sudo), and a project's
  `.agentbox/cloud-setup.sh` runs before every run (2026-10-17, checked on the
  real runtime: apt, pip, the setup script). A saved copy of what a setup
  installed is not built, so a long setup is paid on every run.
- Open files are capped at 1024 by AgentCore, even for root; the agent is told
  to run test files by name.

## The privacy and terms pages

They say Agentbox sends nothing and hosts nothing. A cloud run sends the task's
code, prompt and transcript to the user's own AWS account, by their choice, so
both pages are edited in the change that turns cloud runs on.
