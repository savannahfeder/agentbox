# Harness boundary

Agentbox owns task scheduling, isolated folders, delivery, and the approval UI.
A harness owns its native protocol, account home, models, commands, and session
state. The shared definitions contain names, flags, and capabilities; the main
process registry contains executable adapters. The renderer never imports it.

`main/harnesses.mts` lists the operations and validates registrations. Reads
such as usage can report `{ supported: false }`. Unsupported actions throw
before doing anything. Unknown explicit engines are refused at this boundary;
legacy recovery records retain the supervisor's existing Claude normalization.
No directory scan, third-party plugin loader, new dependency, or background
service is involved.

Claude's JSON lines and Codex's notifications remain native to their adapters.
They expose the same capture, live text, activity, summary, and trace operations
without converting Codex notifications to pretend Claude output. Session
transcripts, account keys, credential-file watching, setup, model commands,
updates, and worker environments are also selected through the adapter.

Native Codex RPC lifecycle helpers and Claude Remote Control still live in
their existing modules. Their security, locking, and scheduling rules are not
interchangeable. Existing settings snapshots and the two-engine admission gate
remain compatible. A registry test proves dispatch with an offline third
adapter; it does not claim a third provider is integrated or runnable.

## The command line is data

A definition's `run` block holds the flags that start a worker: the print flag,
the output format, the streaming flags, and the effort, system, resume, fork and
streaming-input flags. `workerArgsFrom` builds the line from it in a fixed
order, and a key left out means the engine does not take that flag rather than
that a default applies. An engine driven over RPC has no `run` and is handed no
command line. So an engine that speaks a command line we already parse — Grok
Build emits Claude Code's stream-json — is a definition entry, not an edit to
the supervisor.

## Adding a harness

Add a definition and an adapter, then explicitly wire discovery and enrollment.
Keep the default and existing accounts unchanged. Declare missing capabilities,
and test actual start, resume, correction, cancellation, approval, denial, and
delivery against the provider's native transport. A provider is not offered
until that path works. Never infer permission from terminal text or mark missing
usage as zero. Capability declarations must describe what the adapter can do.

## What a harness can do is what it says

`createHarnessRegistry` used to answer `supports()` by asking whether the
adapter had a function of that name. That was the whole truth while every
adapter was written by hand for one tool. One adapter serving several tools
over a shared protocol breaks it, because it implements every operation for all
of them. So an adapter may also declare availability: `available(name)` returns
false for an operation this tool did not negotiate, `supports()` believes it,
and a declined operation is refused exactly as a missing one is — before it
does anything, and reported as absent rather than as zero.

## The Agent Client Protocol, and what it settles

`main/acp.mts` is one transport for every agent that speaks ACP: JSON-RPC 2.0
over stdio, one object per line. It holds the wire and no opinion about which
tool is on the other end. Decided while building it, with Codex reviewing:

- ONE ADAPTER, BUT NOT EVERYTHING AS DATA. Binary arguments, install and login
  commands, profile paths and supported version ranges are data. Authentication
  parsing, session lifecycle, permission handling, cancellation and replay stay
  code. Speaking ACP does not make a tool resumable: `session/load` is optional,
  so resume is read off what the agent advertised, never assumed.
- ONE PROCESS PER ACTIVE ITEM to begin with, so a crash, a leak or a forced
  cancellation is contained to one item. Codex's shared app-server per profile
  is proven and stays as it is. Pooling ACP is a later change and needs a
  measurement of the whole process tree first, not an estimate.
- EVENTS STAY NATIVE, presentation is normalised. `session/update` is kept as
  the tool sent it and read through the same capture, stream, summarize, trace
  and activity readers as every other engine, so no protocol knowledge reaches
  the renderer and nothing is translated into pretend Claude stream-json.
  Replaying a loaded session must not re-deliver an answer, and a prompt's
  `stopReason` decides delivery: cancellation, a limit or a dead transport is
  not a success because text happened to arrive.
- APPROVALS REUSE THE SPOOL, not a third approval system. ACP returns the exact
  `optionId` the agent offered, so Allow can never land as `allow_always`. A
  denial picks an offered rejection option; if the agent offered none, the turn
  is cancelled rather than an id invented. A cancelled turn answers `cancelled`,
  every question is answered exactly once, and reading continues while one
  waits. The failure to design against first is a denial that is not enforced:
  a well-formed refusal on the wire proves nothing about what the tool then did.

### What is built on it

Three files make any ACP agent a harness, and none of them names a tool:

- `main/acp-worker.mts` runs one turn of one thread: start the agent, open or
  load the conversation, send the prompt, pass the agent's notifications on,
  and exit once. A tool call's command arrives on a later update than the call
  and its completion carries neither, so the worker joins them and sends one
  event per finished tool call, finished message and finished turn. A start
  that cannot happen (signed out, another protocol version, a model the agent
  does not offer, a conversation it cannot load) says why on stderr and exits 1
  with no result, so it counts as a run that never began.
- `main/acp-readers.mts` is the capture, live text, summary and trace readers
  over those events; the activity reader is beside the others in
  `main/agent-activity.mts`.
- `main/harnesses/acp.mts` is the adapter: it hands the worker the store's
  tools and the person's connections as MCP servers, puts each permission
  request to the person as one of the app's own cards (`approvalCardsFor`, the
  same in-process cards Codex's are, with no clock on them), and keeps a record
  of each conversation under the app's own folder. That record is what lets a
  reply carry a conversation on: the supervisor resumes only a session whose
  transcript is on disk, and ACP keeps none.

A tool is then a definition with `acp: { bin, args }` and one hook, `prepare`,
for the two things no protocol carries: how this tool is made to ask before it
acts, and where it reads standing instructions. Both have to be read off the
running tool. Speaking ACP does not answer either: OpenCode and Codex each ran
a command the check had refused, because by default neither asked.

A PROMPT HAS NO DEADLINE. Every other request ends after two minutes; a prompt
stays open for the whole turn, and what ends it is the connection closing or
the supervisor's own check for a run gone quiet.

## Standing instructions, on an engine with no system prompt

Claude Code takes them on `--append-system-prompt`; Codex takes them as a
thread's `developerInstructions`. ACP has no system prompt in the protocol, so
for anything else they go into a file the tool itself reads. An ACP harness's
`prepare` hook writes that file into the thread's own folder under the app's
folder and points the tool at it: for OpenCode, a per-thread config whose
`instructions` list names it (measured on 2.3.2: a rule in that file was
followed). A tool with no such hook gets them at the top of the first prompt
of a conversation instead. `instructions()` answers how an engine carries them
and throws for one that carries them neither way, because that engine would
answer against rules it was never given and nothing on screen would say so. It
is on the required list for offering a tool.

Nothing is written into the working folder: a task folder is a worktree of the
person's repository, AGENTS.md is often committed in one, and this codebase has
already paid once for writing a tracked file. `main/harnesses/instructions-file.mts`
is the older route, a block between two markers in a file the definition names,
for a tool that can only be reached that way.

## Credentials: the line, decided

A worker never receives a provider API key in its environment, and moving one
to disk is the same violation by another route. The line is a subscription-
backed authentication mode, managed by the tool itself, with no API-key
fallback. A bring-your-own-key tool is not supported as an engine; it is not
half-supported.

So an ACP worker gets a minimal environment with every vendor's provider keys
removed, not only its own engine's prefix, and the same constraint applies to
any MCP server or child process it is configured to start. Before a tool is
offered at all, a readiness check runs in that exact worker environment and
profile: resolve a supported binary and version, read the tool's own
authentication status, negotiate ACP, confirm the required capabilities, and
open a session without submitting work. It answers with one of "Ready", "Sign
in", "Subscription authentication unsupported" or "Installed version
unsupported". A credential file existing is not readiness, and authentication
that expires later is surfaced on the item rather than spent on retries.

## Offering an engine: two levels

Required before a tool is offered to anyone: subscription authentication, our
standing instructions actually reaching it, store access, start, durable resume
across a real process death, cancel, an enforced approval and denial,
transcript capture, and delivery. Optional, and drawn as unavailable when
missing: usage meters, model choice beyond a verified default, compaction,
command menus and automatic updates. Unknown usage is never zero usage, and a
tool without compaction is acceptable only if running out of context is a
recoverable outcome someone can understand.

## The real check: `npm run check:harnesses`

The unit tests drive stand-ins of each tool, and a stand-in keeps passing after
the tool or a sign-in has moved. So one list runs against the real tool of
every harness on offer, through a copy of the app on a store of its own, driven
by the calls the screen makes:

- a new thread gets its answer, on the harness it named;
- a reply carries on the same conversation;
- a reply after the app restarts still carries it on;
- a running thread stops when told to, and still answers afterwards;
- a command that needs a yes waits for the card, then runs;
- a command that was refused did not run.

`npm run check:harnesses` checks them all, `npm run check:harnesses -- codex`
one, and `--json` prints the verdicts. It exits 0 only when every scenario of
every harness passed, 1 when one failed, and 2 when one could not be checked:
not installed, not signed in, or out of usage. A plan at its limit is "could not
check", never a pass, and no run is started on it: Codex carries on past a spent
week on paid credits. Each run spends a few one-word turns of each plan.

The list is in `scripts/lib/harness-check.mts`. A harness on offer is in it by
being on offer, and its two command scenarios fail until `ASKS_FIRST` names the
permission mode that makes it ask, because no protocol carries that. This is
the "Required before a tool is offered" list above as something that runs: a
harness is offered only while it passes.

A harness nobody is offered yet is checked as a candidate:
`npm run check:harnesses -- --candidate opencode`. The check starts its copy of
the app with that harness named in `AGENTBOX_HARNESSES_IN_TESTING`, which puts
a registered harness on offer in that one process and nowhere else. The screens
never read it, so nothing new is drawn for anybody.

## Hermes integration direction

The proposed first integration is an optional local task session over Hermes'
first-party ACP interface. A task has its own conversation and working folder;
Hermes keeps its own persistent memory and skills in its configured home. No
gateway, cron, messaging connector, or daemon is started by Agentbox. Users who
want Hermes' always-on gateway continue to run it separately. Connecting that
gateway to the inbox would be a distinct integration with explicit ownership
of scheduling, approvals, and messages, rather than a requirement for support.

Provider credentials stay in the harness' own authentication/configuration
store. Agentbox does not ask for, copy, or inject provider API keys. Claude and
Codex keep their existing subscription environment scrubs. Hermes admission
remains off until native credential loading, configured MCP isolation, and real
approval/denial are verified. A new provider's networking or permission scope
requires the corresponding product policy review before admission.

## OpenCode: what was measured, and what billing turned out to be

Measured against a real OpenCode 1.18.35 on 2026-10-07 and again against 2.3.2
on 2026-11-22. It runs over ACP (`opencode acp`) through the shared adapter;
`main/harnesses/opencode.mts` is only its permission policy and its
instructions file. It is registered and **not admitted**, so no row can choose
it and no picker draws it (`admitted: false`, shared/harness-definitions.mts,
filtered in shared/engines.mts).

**Why it moved to ACP.** The first connection drove `opencode serve` over HTTP.
Six weeks later OpenCode 2.3.2 answered 405 to its first call, `POST /session`:
the server's addresses had moved under `/api` and wanted a password. Its 37
tests were green throughout, because they drove a stand-in of 1.18.35. The
same 2.3.2 over ACP passed every scenario of the real check through the app.

**Billing needs no key from us, and needs no sign-in at all.** Credentials live
in OpenCode's own `~/.local/share/opencode/auth.json`, written by
`opencode auth login`. With that file holding zero credentials, `opencode
models` still listed ten models and a run on one finished reporting
`"cost": 0` — the OpenCode Zen free tier. So OpenCode is the first harness
whose first run costs nothing and asks for nothing, and the CLAUDE.md rule
holds as written with no exception needed. The scrub list for this harness is
wider than the other two because OpenCode will read a provider key out of its
environment if it finds one; it is the one tool here that must not be given the
chance.

**Anthropic subscriptions are not a road here.** OpenCode's own provider page
says of the plugins that use Claude Pro/Max with it: "Anthropic explicitly
prohibits this", and that they were unbundled as of 1.3.0. So the harness must
never be presented as a way to run a Claude subscription, whatever the
`/connect` menu offers. ChatGPT Plus/Pro, GitHub Copilot and GitLab Duo are
listed by OpenCode as permitted subscription logins.

**How comparable tools approach it.** Conductor, which is the closest shape to
us (worktree per task, several harnesses), bundles a managed OpenCode
executable, takes provider keys in its own settings or reads OpenCode's config
and the shell environment, and states "Conductor is free to use. We do not bill
or resell model usage. Harness usage is billed through the provider account or
API key." Vibe Kanban passes through whatever the user configured and needs no
separate setup for OpenCode because of its built-in auth. Omnara is the only
one with a hosted option: bring your own keys at no charge, or pay its credits
at provider token rates. Herdr and OpenScout do not touch billing. Nobody
resells, and nobody injects a key the user did not place themselves. Our
position is the strictest of these and costs us nothing.

**The one-shot CLI cannot carry an approval.** `opencode run` with
`permission: { bash: "ask" }` printed
`! permission requested: bash (echo probe-run-mode); auto-rejecting` and handed
the model "The user rejected permission to use this specific tool call."; with
no permission config it ran the command with no card. `--auto` approves
everything not explicitly denied. Approve-everything or refuse-everything are
its only two settings, and neither is a card, so `--auto` must never appear in
anything here; a test checks for it. `opencode run --format json` is used only
for small one-off questions, which run no tools, and always with
`--standalone`: without it, `run` and `models` start OpenCode's background
service and leave it running (277 MB, measured after the command had ended).
`opencode acp` and `run --standalone` leave nothing behind.

**ACP does carry one**, read off 2.3.2. `session/request_permission` arrives
with the tool call (`rawInput.command` and `cwd` for a shell call; a `diff`
with the old and new text for an edit; `rawInput.path` and `content` for a new
file) and three options, `once`, `always` and `reject`. The answer is always
`once` or `reject`, never `always`. A refusal ends the turn with
`stopReason: "cancelled"`, so the thread says what was refused.

**What makes it ask** is a permission config, written per thread into the
app's own folder, which `OPENCODE_CONFIG` points at. With none, it runs shell
commands and writes files without asking: over ACP the command the check had
refused ran. OpenCode has no sandbox and no reviewer of its own, so a shell
command, a page fetch and a search always ask, unless the person chose a mode
that asks for nothing. Edits inside the thread's folder go ahead, as on the
other two harnesses' default modes, and `external_directory: "ask"` still asks
for a file outside it (measured: the inside file was written unasked, the
outside one raised a request and was not written when refused). The modes that
ask before any change (`default`, `plan`, `read-only`) ask for edits too.

**The rest of the list, measured on 2.3.2 over ACP:** a conversation is carried
on by `session/load` in a new process after the first was killed, and its
replayed history is not passed off as the new turn; `session/cancel` ends a
running turn; the model is one of the session's config options and
`session/set_config_option` sets it; MCP servers handed to `session/new` are
started with the variables they were given, and their tools are called. After a
turn was stopped, OpenCode picked the stopped command back up on the next
reply, which is its own behaviour and why the check tells it not to.

**Declared missing rather than faked:** plan and usage limits, because OpenCode
bills through whichever provider the user connected and does not know. ACP's
usage update carries the context used and a cost per run, and those are kept.
Its slash commands and its fork are advertised over ACP and not wired, so both
say no. Typing into a live run is not wired either, so `remoteControl` is false.

**Still ahead before it is offered:** the screens. The new-thread composer, the
model menu and the logos know two harnesses, so OpenCode has nowhere to be
picked. Its model list has to reach the model menu, and its sign-in has no
row in Settings.

Sources: [OpenCode providers](https://opencode.ai/docs/providers/),
[OpenCode CLI](https://opencode.ai/docs/cli/),
[OpenCode ACP](https://opencode.ai/docs/acp/),
[Conductor's OpenCode harness](https://www.conductor.build/docs/reference/harnesses/opencode),
[Conductor providers](https://www.conductor.build/docs/guides/providers).

The useful precedent from T3 Code is an adapter between provider behavior and
orchestration. Herdr keeps agents in normal terminals and uses detection
manifests or reported states; Agentbox continues to use structured protocols.

Sources: [T3 Code architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
[Herdr agents](https://herdr.dev/docs/agents/),
[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md).
