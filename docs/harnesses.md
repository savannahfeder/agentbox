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
Codex keep their existing subscription environment scrubs. Hermes and OpenCode
admission remains off until native credential loading, configured MCP isolation,
and real approval/denial are verified. A new provider's networking or permission
scope requires the corresponding product policy review before admission.

The useful precedent from T3 Code is an adapter between provider behavior and
orchestration. Herdr keeps agents in normal terminals and uses detection
manifests or reported states; Agentbox continues to use structured protocols.

Sources: [T3 Code architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
[Herdr agents](https://herdr.dev/docs/agents/),
[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md).
