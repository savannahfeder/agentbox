---
name: product-loop
description: Run Agentbox's own product loop. Synthetic power users test the phone app for a workday on the person's Codex plan, paced to use about 90% of the Codex week by its reset, and the run fixes and ships what they find under the project's ship rules. Use when asked for the product loop, the self-improving loop, a workday of testers, testing the phone or iOS app with synthetic users, or spending the Codex week on testing.
---

# The product loop

Thread w-e5f506ccb3 is the model: a synthetic team used the multiplayer
build for whole workdays, logged what broke, agents fixed it, and the same
team tested the fixes the next day. The person only chose between finished
screens. This skill runs that loop on its own, one workday per day, on the
Codex plan, starting with the phone app.

## One workday

```sh
L=.claude/skills/product-loop/scripts
node $L/pace.mjs                         # run, hold, wait or stop, and why
node $L/workday.mjs --who founder,startup-engineer,new-user --minutes 30 --pace --hours 10
```

`workday.mjs` builds the phone app's browser preview (`EXPO_PUBLIC_PREVIEW=1`,
made-up threads, nothing signed in), serves it, and gives each person from
`../power-test/people` a folder with two commands: `phone` (the app at an
iPhone's size, touch on: look, tap, type, swipe, shot, away) and `diary`. The
testers run as `codex exec` sessions in a sandbox with the local network open.
Each stretch after the first is told what was already logged. `--pace` keeps
starting stretches while the Codex week is behind its line, waits out a full
5-hour window, and stops at the target or at `--hours`. `report.md` in the run
folder ranks every issue, worst first, with pictures.

| flag | what | default |
|---|---|---|
| `--who` | names from `../power-test/people`, `random:N` or `all` | `random:2` |
| `--minutes` | one stretch | 30 |
| `--stretches` / `--pace` | how many, or as many as the week allows | 1 |
| `--engine` | `codex`, `claude`, or `external` (you run each stretch as a subagent) | `codex` |
| `--codex-home` | the Codex login the week is read from and spent on | `$CODEX_HOME` or `~/.codex` |
| `--target` | how much of the week to have used at its reset | 90 |
| `--focus` | what shipped and wants leaning on | none |

In the Agentbox cloud nothing a session starts can sign in: use
`--engine external`, read each `stretch-N.prompt.md` the runner writes, run
it as a subagent allowed only its `phone` and `diary`, and write
`stretch-N.done` when it returns.

## Then fix what they found

Read `report.md` and open the pictures. Reproduce each broken or wrong issue
with `phone` yourself before calling it a bug: the threads are made up, and a
tester can be wrong. Fix the real ones in one branch, test first as CLAUDE.md
says, and ship by the project's ship rules: fixes nobody sees ship, wide ones
get `handoff` first, and anything on screen goes to the person with
screenshots taken with `phone shot`. The next workday's testers are told what
was logged, so they check the fixes.

## The phone, three ways

1. **The browser preview** (this skill). Runs anywhere, the cloud included.
   It covers every screen, word and flow at an iPhone's size. It does not
   cover the iOS keyboard, safe areas as iOS draws them, native modules
   (speech, the keychain, Sign in with Apple) or alerts.
2. **The iOS simulator, on the Mac.** Needs Xcode and a development build
   (`npx expo run:ios` in `mobile/`, because of expo-dev-client and the
   native modules). XcodeBuildMCP gives an agent the simulator's hands:
   build and run, describe the screen, tap by label, type, swipe,
   screenshot. Add it to Codex as an MCP server
   (`[mcp_servers.XcodeBuildMCP]`, `command = "npx"`,
   `args = ["-y", "xcodebuildmcp@latest"]`) and give the tester those tools
   in place of `phone`. Mac only; not built into `workday.mjs` yet.
3. **A real phone, through TestFlight.** Only for alerts reaching the lock
   screen and Sign in with Apple. A person or the outside QA tester does it.

## Every day, on its own

A repeating task on this project, daily, on Codex, with this instruction:

> Run one product-loop workday on the phone app (.claude/skills/product-loop).
> If `node .claude/skills/product-loop/scripts/pace.mjs` says stop, finish
> clean. Otherwise start workday.mjs with --pace --hours 10 and three people
> chosen for what changed this week, detached, and wait for its report.md.
> Then fix and ship what they found by the ship rules. Bring me only what the
> rules say I see, with pictures.

`--pace` waits out a hold or a full 5-hour window inside its hours, so a
morning run that starts ahead of the line still tests once the line passes
it. A run the pacer stops finishes clean and never reaches the inbox.
