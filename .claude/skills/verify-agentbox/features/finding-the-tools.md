# Finding Claude Code and Codex

Opened from the Dock, Agentbox finds the Claude Code and Codex a person has,
however they installed them, starts them as workers without an API key, and
never says "not installed" unless it is sure.

## Sub-features

- `found-from-disk` installer, Homebrew (both chips), npm, nvm, the desktop app's own copy.
- `found-from-shell` a tool only the login shell's PATH knows about (zsh or bash).
- `starts-as-worker` the found binary starts under the environment a worker gets, including an npm script that needs node.
- `unsure-not-missing` a slow profile or a half-finished `brew upgrade` reads as unsure, never as missing.
- `shell-dirs` `CODEX_HOME` and `CLAUDE_CONFIG_DIR` set only in a profile are still honoured.
- `no-keys` API keys in the launch environment never reach a worker.

## How to get to it (user POV)

- Open Agentbox from the Dock or Finder on a Mac with the tools installed.
- First run: the setup walk says whether Claude Code was found.
- Settings shows which Claude Code and Codex the app is using.

## Driving it with live.mjs

Preconditions: macOS. No instance needed; these run the app's modules directly.

- **Every fake Mac.** Run `node .claude/skills/verify-agentbox/scripts/check-machines.mjs`. Each shape prints PASS, or KNOWN with its thread id; exit 0.
- **One shape, kept to inspect.** Run `check-machines.mjs codex-npm-under-nvm-lazy --keep`. The fake home and root stay on disk; `machines.json` has the root path.
- **This Mac.** Run `node .claude/skills/verify-agentbox/scripts/check-this-machine.mjs`. Both tools print `starts` with a version, or `not found`; no PROBLEMS section.
- **A teammate's Mac.** Ask them to run the same command from their checkout and paste the output. Compare install kind (native or script), where it was found from, and whether the terminal finds a different one.
- **Proof.** `machines.json` and `this-machine.json` in the run folder.

## Gotchas

- A shape passes against the fake root only. If a new finder reads an absolute path through plain `fs` instead of the injected `exists`/`readdir`, this Mac's own installs answer and the check proves nothing; the shape test in `tests/the-pre-deploy-check-runs-what-a-change-needs.test.mts` catches the common case.
- The `slow-shell-profile` shape sleeps 8 s by design. On a loaded Mac other shapes' shell probes can also time out; rerun the one shape alone before believing a failure.
- The stubs answer `--version` only. Anything beyond starting (auth, a real turn) is the live layer's job with `--real-claude`.
