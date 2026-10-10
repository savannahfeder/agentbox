# System architecture

Agentbox coordinates coding agents through an inbox and a local store.

## Runtime boundaries

- `main/main.mjs` starts Electron and connects windows, services, and lifecycle hooks.
- `preload.cjs` exposes the renderer bridge; `main/ipc.mjs` handles desktop requests.
- `renderer/` contains the React interface, built by Vite.
- `bin/agentbox.mjs` and `main/serve.mjs` provide the local browser entry point.
- `main/store.mjs` and `main/store/` implement persisted state and derived views.
- `main/supervisor.mjs` schedules sessions; the registry in `main/harnesses.mjs`
  and adapters in `main/harnesses/` launch Claude Code, Codex, and OpenCode,
  handle approvals, and observe progress. See [harnesses](harnesses.md).
- `shared/harness-definitions.mjs` defines provider identities and capabilities;
  `main/opencode-server.mjs` manages the OpenCode server lifecycle.
- `mcp/` exposes store operations to worker agents.
- `main/team/` contains optional team integration, separate from local-only use.

A user action reaches the main process through IPC (desktop) or the local HTTP
service (browser). Services update persisted work and session state. Observers
refresh the renderer, while the supervisor starts or resumes eligible sessions.
Workers report through provider output and store tools. Persistence and UI
projections must be considered together when changing event or sync behavior.

## Trust and testing

The renderer, main process, worker processes, filesystem, local HTTP clients,
and optional remote team service are separate boundaries. Authentication to a
local API does not itself establish permission to access every local file.
Worker permission policy comes from configuration and provider launch arguments;
verify actual arguments when documenting defaults. Agentbox is an orchestration
application and should not be treated as a general-purpose process sandbox.

Tests in `tests/` exercise these boundaries and frequently read source files as
text. Use the repository's changed-test runner so those readers are included.
Use fixtures for presentation work and isolated stores for persistence tests.
See the [development guide](development.md) for commands and limitations.
