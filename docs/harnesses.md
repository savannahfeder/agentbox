# Harness boundary

Agentbox owns task scheduling, isolated folders, delivery, and the approval UI.
A harness owns its native protocol, account home, models, commands, and session
state. The shared definitions contain names, flags, and capabilities; the main
process registry contains executable adapters. The renderer never imports it.

`main/harnesses.mjs` lists the operations and validates registrations. Reads
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

`main/acp.mjs` is one transport for every agent that speaks ACP: JSON-RPC 2.0
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

## Standing instructions, on an engine with no system prompt

Claude Code takes them on `--append-system-prompt`; Codex takes them as a
thread's `developerInstructions`. ACP has no system prompt in the protocol and
OpenCode's server takes none, so for anything else they go into the file the
tool itself reads, named in the definition — `instructions: { file, in }`,
AGENTS.md for most and GEMINI.md for Gemini CLI. `instructions()` answers how
this engine carries them and throws for an engine that carries them neither
way, because that engine would answer against rules it was never given and
nothing on screen would say so. It is on the required list for offering a tool.

The file goes in the tool's own config directory, which is per task and ours.
A definition may ask for the working folder instead, but a path the person's
repository tracks is refused rather than written: a task folder is a worktree
of their repo, AGENTS.md is often committed in one, and this codebase has
already paid once for writing a tracked file. What is in the file stays; only
the block between our two markers is rewritten, however many times a thread
resumes.

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

Measured against a real OpenCode 1.18.35 on 2026-10-07. The code is
`main/harnesses/opencode.mjs`, `main/opencode.mjs` and
`main/opencode-server.mjs`; it is registered and **not admitted**, so no row
can choose it and no picker draws it (`admitted: false`,
shared/harness-definitions.mjs, filtered in shared/engines.mjs).

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

**The CLI cannot carry an approval, so the harness drives the server.**
`opencode run` with `permission: { bash: "ask" }` printed
`! permission requested: bash (echo probe-run-mode); auto-rejecting` and handed
the model "The user rejected permission to use this specific tool call."; with
no permission config it ran the command with no card. `--auto` approves
everything not explicitly denied. Approve-everything or refuse-everything are
the only two CLI settings, and neither is a card, so `--auto` must never appear
in anything here — a test checks for it.

The HTTP server does carry one. `opencode serve` raises `permission.asked` on
`/event` with `metadata.command` for a shell call and `metadata.filepath` plus
a whole unified `metadata.diff` for a write. `POST
/session/:id/permissions/:id` with `{ response: "once" }` returned 200 and the
tool then ran; `{ response: "reject" }` returned 200 and the tool came back
refused. Both verified end to end. An `edit` approval therefore arrives with
more than a Codex patch approval does, and the card can show the change itself.

**What makes it ask** is a permission config, which Agentbox writes per task
folder and points `OPENCODE_CONFIG` at. The server reports back what it loaded
at `GET /config`. A per-session `permission` ruleset also exists on
`POST /session` and would be cleaner, but in testing it did not produce an ask
and the tool ran instead — **not a verified path**, and worth revisiting.

**The rest of the checklist, verified:** session resume keeps context across
turns on the same session id; `POST /session/:id/fork` works;
`POST /session/:id/summarize` is compaction and returned true; `GET /command`
lists slash commands and `POST /session/:id/command` runs one;
`GET /config/providers` is the model list, provider-qualified as
`provider/model`; `opencode upgrade` is its own updater;
`OPENCODE_SERVER_PASSWORD` really protects the port (401 without, 200 with),
and it is a loopback basic-auth secret, not a provider credential.

**Declared missing rather than faked:** plan and usage limits — there is no
endpoint and no command that reports what is left, because OpenCode bills
through whichever provider the user connected and does not know. Per-run tokens
and cost do arrive on `step-finish` and are read. Input streaming into a live
run is also missing: `/tui/append-prompt` drives the terminal UI, not a
headless run, so `remoteControl` is false.

**Still ahead before admission:** MCP isolation for an OpenCode worker has not
been worked through, the approval handler is not yet joined to the inbox's own
card spool (`sup._openCodeApprovals`), and the QA campaign that the Codex
harness got (w-36c51443df) has not been run against this one.

Sources: [OpenCode providers](https://opencode.ai/docs/providers/),
[OpenCode CLI](https://opencode.ai/docs/cli/),
[OpenCode server](https://opencode.ai/docs/server/),
[Conductor's OpenCode harness](https://www.conductor.build/docs/reference/harnesses/opencode),
[Conductor providers](https://www.conductor.build/docs/guides/providers).

## Grok Build and pi: what was measured

Both are registered and **not admitted**, the same as OpenCode
(`admitted: false`, shared/harness-definitions.mjs), so no row can choose them
and no picker draws them. Each is one adapter (`main/harnesses/grok.mjs`,
`main/harnesses/pi.mjs`) over the module that holds what was measured
(`main/grok.mjs`, `main/pi.mjs`), plus one data row each. No existing file grew
an engine branch; the one shared change is a capability,
`forwardsUnknownCommands`, read by `main/task-commands.mjs`.

**Grok Build's headless stream is Claude Code's.** `grok -p --output-format
streaming-messages-json` prints the same system/assistant/user/result lines as
Claude Code's stream-json, so the adapter uses Claude Code's readers and only
translates the command line. Which flags Grok takes, refuses and renames was
measured one flag at a time against grok 1.0.46 and is written at the top of
`main/grok.mjs`.

**pi prints its own events** (`pi -p --mode json`). Each line is rewritten as
it arrives into the Claude Code line that means the same (`piToClaude`), so the
readers are Claude Code's here too. pi is a Node script, and an app opened from
the Dock has no shell PATH, so the folder its node lives in goes first on the
worker's PATH (without it the run dies with "env: node: No such file or
directory").

**Neither has `--permission-prompt-tool`, so the cards come another way.**
Grok gets a PreToolUse hook in `~/.grok/hooks` that does nothing unless
Agentbox started the run; pi gets an extension loaded for each run with `-e`.
Both call one helper, `main/agent-approval-cli.mjs`, which writes the card into
the same spool and waits for the same signed answer Claude Code's approval
server does (the shared part moved into `main/approval-ask.mjs`). `<engine>Ask`
in the config decides when: before risky actions (default), before every
action, or never.

**Live, through the adapters, on 2026-10-10** (grok 1.0.50, pi 1.0.4), with a
temporary store:

- **pi:** start, then resume on the same session with its context kept. A shell
  call raised one card; denied, the tool returned the denial note and nothing
  ran; allowed, it ran and printed its output.
- **Grok Build:** start, then resume on the same session with its context kept.
  Under "every action", each tool call raised a card. Denied, Grok received
  "Hook denied: <note>" and kept trying other tools, raising 22 cards before it
  stopped. Allowed, one card and the command ran. One of three resumes printed
  nothing for three minutes and was stopped; the other two resumed normally.

**Declared missing rather than faked:** input into a live run (neither takes
stream-json input, so a reply waits for the run to end and resumes it), fork,
usage and plan limits, and a sign-in command (both sign in from their own
terminal UI). **Still ahead before admission:** discovery and enrollment in
`main/config.mjs` (each adapter's `discover` already finds the binary), the
Settings pages, picker entries and per-engine model menus that the earlier
version of these engines had, and the product review this file asks for.

The useful precedent from T3 Code is an adapter between provider behavior and
orchestration. Herdr keeps agents in normal terminals and uses detection
manifests or reported states; Agentbox continues to use structured protocols.

Sources: [T3 Code architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
[Herdr agents](https://herdr.dev/docs/agents/),
[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md).
