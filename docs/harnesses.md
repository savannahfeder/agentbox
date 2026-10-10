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

## Adding a harness

Add a definition and an adapter, then explicitly wire discovery and enrollment.
Keep the default and existing accounts unchanged. Declare missing capabilities,
and test actual start, resume, correction, cancellation, approval, denial, and
delivery against the provider's native transport. A provider is not offered
until that path works. Never infer permission from terminal text or mark missing
usage as zero. Capability declarations must describe what the adapter can do.

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

The useful precedent from T3 Code is an adapter between provider behavior and
orchestration. Herdr keeps agents in normal terminals and uses detection
manifests or reported states; Agentbox continues to use structured protocols.

Sources: [T3 Code architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
[Herdr agents](https://herdr.dev/docs/agents/),
[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md).
