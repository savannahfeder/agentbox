---
name: verify-agentbox
description: Prove an Agentbox change works the way a person meets it, before it ships. Runs the app's own tool-finding and worker setup on fake Macs unlike this one, reads this Mac for real, drives throwaway copies of the app by keyboard (agents on Claude Code and Codex, several at once, logins out of usage, restarts, replies landing on the right thread) on stand-ins, on the real tools, and through the installed app, then sets an agent loose to break it. Use before shipping anything under main/, shared/, renderer/ or bin/, when a bug might depend on someone's machine, or when asked to verify, QA, or "check it really works".
---

# Verify Agentbox

The unit tests run on the Mac the code was written on, so they cannot see the
bugs that only exist on somebody else's: Codex installed with npm under a
lazy nvm, a bash user, a home folder with a space, `CODEX_HOME` set only in
`.zshrc`, an app opened from the Dock with launchd's four-folder PATH. Most of
what reached people was that kind. The rest were the agents themselves: a
task that never runs (Codex most of all), an answer on the wrong thread or in
the wrong inbox, several at once, a login out of usage. This skill drives
those for real.

Seven layers, one command:

```sh
node .claude/skills/verify-agentbox/scripts/verify.mjs          # the layers this branch needs, in full
node .claude/skills/verify-agentbox/scripts/verify.mjs --all    # every layer, whatever changed
node .claude/skills/verify-agentbox/scripts/verify.mjs --quick  # stand-in drives only, for iterating
# drop one slow layer: --no-setups --no-real --no-installed --no-breaker; --breaker-minutes 20
```

| layer | what it proves | time |
|---|---|---|
| `this-machine` | what the app finds on THIS Mac, opened from the Dock, and that a worker can start it | ~2 s |
| `machines` | the same, through the app's own modules, on 17 fake Macs (`scripts/machines.mjs`) | ~35 s |
| `live` | the browser copy on stand-ins, every drive in `DRIVE_ORDER`: Codex, six at once, replies landing where shown, logins out of usage, quit and Control-C mid-run | ~10 min |
| `setups` | the REAL Claude Code and the REAL codex on homes set up the way other people set theirs up (`scripts/setups.mjs`), against a stand-in model: a task and a reply each. Nothing billed | ~40 s a setup |
| `real` | `REAL_ORDER` again on the Claude Code and Codex this Mac has, signed in as they are, one-word tasks (billed to that subscription, a few cents) | ~5–10 min |
| `installed` | the packaged `.app`, opened with a Dock launch's environment on a throwaway home, `INSTALLED_ORDER` through its own window | ~5 min with the build |
| `breaker` | a locked-down Claude Code session told to break the app through the screen (`breaker.mjs`). Findings are printed for a person, not counted as failures | 15 min |

The owner's call (2026-10-12): every deploy that changes what a person runs
gets all six, real Claude Code and Codex included. Feature-by-feature drives
(⌘K, approvals, options) are not the priority; the agents are.

`verify.mjs` reads `git diff origin/main...HEAD` plus uncommitted files and
skips a layer a change cannot affect (docs, tests and scripts get only
`this-machine`). It prints what it ran and why, and exits 0 only when every
layer that ran held. Known gaps (below) print `KNOWN` and do not fail it.

Unit tests are not repeated here: `npm run test:changed`, `npm run ship`, the
push hook and CI already run them.

## Launch

The live layer runs `bin/agentbox.mjs`, the browser copy of the app: the same
store, supervisor, IPC handlers and renderer as the desktop, no Electron. It is
the only way to run a second Agentbox on a Mac without touching the one being
used.

```sh
L=.claude/skills/verify-agentbox/scripts/live.mjs
node $L up                 # stand-in worker, nothing billed
node $L up --real-claude   # the Claude Code this Mac has, on its subscription
```

`up` builds the screen if `renderer/dist` is older than `renderer/src`, makes
`/tmp/agentbox-verify/instances/<checkout hash>/` with its own store, a
`Sandbox` project backed by a real git repo, and a `zero.config.json`, then
starts the copy detached and waits for it to print its address. Ready means it
printed `up: http://127.0.0.1:<port>/?token=…`.

What makes it safe to run beside a real Agentbox, and why each is there:

- **Its own store, port and account** (`verify-account`), all under the
  instance folder.
- **The fresh-user flag** (`AGENTBOX_FRESH_USER=1`): no team cloud even on a
  Mac that has a team key, so no sign-in wall and nothing written to the shared
  project, and analytics go under the one id that names itself as not a person.
- **A clean environment.** Run from inside an Agentbox worker, this script
  inherits `ZERO_ITEM`, `STORE_*` and friends; passed through, the copy's own
  workers would write to the real thread. `cleanEnv` strips every `ZERO_`,
  `STORE_`, `AGENTBOX_`, `ASTRAL_`, `ANTHROPIC_`, `CLAUDE_CODE_`, `OPENAI_` and
  `CODEX_` variable.
- **One instance per checkout**, so two agents verifying two branches on one
  Mac never drive each other's copy. `VERIFY_INSTANCE=<name>` before any verb
  makes another copy from the same checkout (the power test runs one per
  tester), and stand-in copies take `--logins 1-4`, `--no-codex` and
  `--projects "A,B"`.

For hours of use by testers who play the people Agentbox is for, with
logins running out and restarts on a clock, use `../power-test/` instead of
the breaker.

The default worker is `scripts/lib/stub-claude-worker.mjs`: everything on
Agentbox's side of the spawn is real (argv, environment, worktree, store
writes, approvals channel) and the model is not. `--real-claude` lets the app
find Claude Code the way a new user's copy would and runs it for real; it
writes a session under the Claude config folder like any run, so use it for
the final pre-deploy proof, not every iteration.

## Doctor

```sh
node $L doctor
```

Read-only. Checks the process is up and is OUR copy (its command line names
our data folder), the address answers with the screen, the built screen is not
older than its source, the stand-in is executable, and the copy's log has no
errors. Run it before the first drive, and again after any drive that failed
or surprised you. `drive` refuses to start when doctor finds anything.

## Drive

```sh
node $L drives                 # list them
node $L drive inbox-opens
node $L drive new-thread
node $L drive reply            # needs an answered thread: run new-thread first
```

Each drive is in `scripts/drives.mjs` and maps to a file in `features/`. A
drive presses what a person presses, using the app's own shortcuts as handles
(N new thread, ⌘↵ send, R reply), because they survive a redesign that moves
every button. Then it checks two things: what is on screen, and what the app
wrote to disk (the ledger at
`<store>/projects/<project folder, non-alphanumerics as ->/work-items.jsonl`,
session logs beside it, and the stand-in's receipt of the exact argv and
environment it was handed).

To add a drive: add an entry to `DRIVES` in `scripts/drives.mjs` with `what`
and `run({ tab, state, claim, capture })`, add its feature file, and add it to
`DRIVE_ORDER` in `verify.mjs` if it belongs in the pre-deploy run (and to
`REAL_ORDER` or `INSTALLED_ORDER` if it means something on the real tools or
the packaged app). Nothing can follow `every-login-runs-out` on one copy: it
leaves every login resting. `tab` is
`scripts/cdp.mjs`: `press(key, mods)`, `type(text)`, `until(expr)`,
`evaluate(expr)`, `capture(file)`, `text()`.

## Machines

```sh
node .claude/skills/verify-agentbox/scripts/check-machines.mjs [shape ...] [--keep]
node .claude/skills/verify-agentbox/scripts/check-this-machine.mjs [--json]
```

`check-machines` lays each shape in `scripts/machines.mjs` out under a fake
HOME and a fake `/` (so this Mac's own `/opt/homebrew` cannot answer for a Mac
that has none), then runs the app's real `recoverShellPath`,
`readShellDataDirs`, `findClaudeBin`, `findCodexBin` and each harness's
`workerEnv`/`launchEnv`, and really spawns what it found with `--version`
under the worker's environment. A native install is a `/bin/sh` stub and an
npm install a `#!/usr/bin/env node` stub, which is the difference several
shapes exist to test.

To add a shape, add an entry to `SHAPES` with `why` (the bug class) and
`expect` (what a person on that Mac needs, not what the code happens to do).
A bug report that turns out to be about someone's machine should become a
shape before it is fixed.

`check-this-machine` is the one to ask teammates to run. It reads their real
Mac the same way, prints paths with `~`, writes nothing but its report, sends
nothing anywhere, and its output is safe to paste into a thread. It shows when
the app and their terminal disagree about which `claude` or `codex` they have.

## Setups

```sh
node .claude/skills/verify-agentbox/scripts/check-setups.mjs [setup ...]
node $L up --setup own-hooks      # one by hand, then drive setup-task and reply
```

The machine shapes stop at "found, and `--version` runs". Most bugs that
reached people were past that point: how their Claude Code was set up. A
setup is a home laid out like one kind of person's: the real Claude Code on
this Mac linked in where its installer puts it, their settings, hooks,
connected tools, logins, and the project's committed `.claude` files. The
copy runs on that home with nothing of this Mac's `~/.claude`.

The model is the only stand-in (`scripts/lib/claude-stub-model.mjs`, served
by `stub-claude-server.mjs`). Its address and a token that is not a key ride
in the home's own `settings.json`, which Claude Code reads for itself, so the
app's rule that a worker is never handed a key is untouched. Measured on
Claude Code 2.1.301: signed out, it runs the task, writes its session and
exits 0. On each task turn the stand-in calls the app's `update_work_item`
once, then answers, so a setup that keeps the store tools from a worker fails
on the ledger. It logs how each request was signed (never the key), so a key
left in somebody's settings shows as `api-key`.

`setup-task` checks: the answer lands, Claude Code offered the app's store
tools, the worker's note reached the thread, and no key in a settings file
was used. Then `reply` checks the reply is answered and remembers the first
turn. To add a setup, add an entry to `SETUPS` with `why` and `expect` (what a
person on it needs, not what the code does). A bug report that turns out to be
about someone's Claude Code setup should become a setup before it is fixed.

**Codex setups** (`engine: 'codex'`, `check-setups.mjs --engine codex`) send
the task to Codex from the composer and run the real `codex` on the person's
own Codex home: their `auth.json` (a ChatGPT login with tokens that open
nothing, or an API key that is not one), their `config.toml`, their
`AGENTS.md`. The copy's config names neither `codexBin` nor `codexHome`, so it
finds both as a person's copy does; a `codexHome` there is what hid the
`.zshrc` bug. The stand-in (`stub-codex-server.mjs --setup`) is layered into
their `config.toml` as a provider with `requires_openai_auth = true`, so Codex
signs its requests with their login: a JWT is a ChatGPT plan, `sk-...` is a
key. It is also the copy's HTTPS proxy, so anything Codex tries to send off
the Mac (chatgpt.com, github.com) is logged and refused. What was measured on
codex-cli 0.160.0 and the stand-in now does: MCP tools sit behind a client
`tool_search`, so it searches before it calls `update_work_item`; and in the
app's Auto mode every MCP call, the store's included, goes to an approval
reviewer model (`codex-auto-review`) that must answer JSON, which the stand-in
answers by allowing the store write only. A setup that must not run
(`expect.answers: false`) is checked for the opposite: nothing went to the
model on that login, and the thread says why in a sentence matching
`expect.says`.

## Evidence

Everything lands in `/tmp/agentbox-verify/runs/<timestamp>-<what>/`:
`machines.json`, `this-machine.json`, and per drive numbered screenshots
(1440×900 at 2×, dark) plus `report.json` with every claim, its evidence and
any page errors. `verify.mjs` puts all of a run's layers in one folder and
prints it. Cleanup never touches this folder.

Proof standards:

- Drive the real path (keys and clicks into the real bridge), never an
  internal setter or a test-only endpoint.
- Capture the action and the state it produced, not just the final screen.
- Check the side effect on disk next to what is visible.
- The stand-in is a stand-in. A claim about Claude Code's own behaviour (for
  example that a reply resumes the same session) needs `--real-claude`; the
  `reply` drive only checks memory in that mode.
- To show a picture to the person you work for, copy it into the product's
  docs folder under `designs/<task id>/`, not from `/tmp`.

## Cleanup

```sh
node $L down
```

Stops the process group `up` started, then kills anything still running out
of the instance folder (a worker the group missed), and deletes the instance
folder. It never kills by process name and never touches `runs/`. Headless
Chromes go through `scripts/lib/chrome-guard.mjs`, which cleans them on every
exit and reaps orphans from earlier runs. `verify.mjs` always runs `down`,
even when a drive fails.

## Known gaps

A claim or shape with `known` set is a product bug filed on its own thread.
It still runs; it prints `KNOWN`, does not fail the run, and prints a reminder
when it starts holding so the marker can come off.

None today. The setups layer's first run (2026-10-15) found three, all fixed
in the same task: a key in `~/.claude/settings.json` or a project's
`.claude/settings.json` billed past the env scrub (every worker's `--settings`
now blanks it, `NO_METERED_KEY`), and a login moved by `CLAUDE_CONFIG_DIR` in
`.zshrc` was never used by workers (`effectiveProfiles` reads the shell's
folder now).

The whole map of setup differences, what covers each and what is still open,
is `RISKS.md` beside this file. Read it before adding a shape.

The Codex setups' first run (2026-10-15) found two more, both fixed in that
task: a Codex signed in with an API key ran every task on the key (refused
now, `codexKeyRefusal`, saying to run `codex login`), and a `config.toml`
codex will not read, a TOML mistake or an old `profile = "..."` line that
0.160 refuses outright, said only "Codex stopped before it did anything"
(now it names config.toml and how to find the line).

Before those, everything the check found was fixed in the task that
built it: a thread you typed reading "An agent opened this" with nobody
signed in; an old npm Claude Code that could not start as a worker from the
Dock; a task whose login ran out sleeping for hours while another login was
free; Control-C on the browser copy charging its own stop to running tasks;
and (the breaker's) an out-of-usage thread repeating "It handed this back".

## Not covered yet

Listed so nobody reads a green run as proof of these:

- The installed app's menus, notifications and auto-update. The `installed`
  layer drives its window, not the shell around it.
- The team version signed in. Not needed while one person ships it (the
  owner's call, 2026-10-12); test accounts on the team server are allowed
  when it is.
- Shipping (`ship` label to `npm run ship`), approvals cards, scheduling.
- Linux machines (`check-machines` is Mac shapes only; the app supports Linux).
  The live copy and its drives do run on Linux, on Playwright's Chromium or
  the one `VERIFY_CHROME` names.
- Other Claude Code and Codex versions and install methods. Setups link the
  one Claude Code this Mac has into the installer's layout, and run the one
  codex on its PATH.
- A person's own Codex `model_provider` (Azure, a local server). The setups
  layer leaves one alone if the config names it, so its workers would use it;
  none of the setups does, because there is no stand-in for it.
- Other people's Macs, beyond the fake ones. Not needed while one person
  ships it.

## Keeping it honest

`.claude/skills/maintain-verify-agentbox/` is the upkeep pass: it re-reads
each feature from source, drives every feature live, and fixes the map and
harness when the app has moved. Run it after a change that moves a user path
(a shortcut, a screen, how a worker is spawned), and otherwise about weekly.

Adapted from Cursor's `create-verification-skill`
(https://github.com/cursor/plugins/tree/main/pstack/skills/create-verification-skill).
