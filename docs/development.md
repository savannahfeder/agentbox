# Development and validation

## Requirements and first run

Use Node 22, npm, Git, and a desktop session for Electron. Run `npm ci` from
the checkout, then `ZERO_FIXTURES=1 ZERO_NO_SUPERVISOR=1 npm run dev`.
The fixture window is the recommended starting point for UI work. Both flags
matter: fixtures select sample content and the supervisor flag disables automatic
agent scheduling. No provider login is needed for that workflow.

`npm ci` runs installation hooks and may download platform binaries. Native
node-pty compilation may require Xcode command-line tools on macOS, or Python,
make, and a C++ compiler on Linux. See install output for the failing component.

## Real sessions

Install and authenticate the selected provider separately for actual agents.
Claude Code, Codex, and OpenCode have distinct harnesses; see
[harnesses.md](harnesses.md) for configuration and provider lifecycle.
Use an ignored `zero.config.json` with a dedicated `storeRoot` for experiments.
Review `main/config.mjs` and `main/supervisor.mjs` before changing session
permissions. A development window on a real store requires explicit
`ZERO_DEV_ON_REAL_STORE=1`; hot reload can discard UI state.

## Build and run

`npm run build` produces `renderer/dist`; `npm start` builds and opens Electron.
`npm run serve -- --help` describes browser mode. Desktop and browser modes
have different platform capabilities; test the mode affected by your change.
The build probes an installed Claude CLI for command/model metadata. If that
CLI lacks a command the probe expects, update the CLI or use a clean environment
without it, which uses committed snapshots. Do not commit machine-generated
`*.local.json` metadata. `npm run read:claude` deliberately updates snapshots.

`npm run pack` invokes the unsigned packaging workflow. Packaging is distinct
from a renderer build and depends on platform tools. Contributors do not need
release signing credentials or access to upstream update infrastructure.

## Checks

Run `npm run check:contribution` for local Markdown file targets and issue form
structure. It does not validate remote URLs or heading fragments. Run
`npm run test:changed` while iterating, `npm run typecheck` for renderer types,
and `npx vitest run --maxWorkers=4 --minWorkers=1` before completing a code change.
Bounded workers avoid overwhelming shared development machines. CI also tests
Linux and macOS. The full Linux suite also requires zsh for the shell-profile
integration test; CI installs it explicitly. For visible changes, manually exercise the affected workflow
and include results in the pull request. Record failures and limitations rather
than calling an unrun check successful.
