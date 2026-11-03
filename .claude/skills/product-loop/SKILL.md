---
name: product-loop
description: Run Agentbox's own product loop. Synthetic power users test the phone app for a workday on the person's Codex plan, paced to use about 90% of the Codex week by its reset, and the run fixes and ships what they find under the project's own instructions. Use when asked for the product loop, the self-improving loop, a workday of testers, testing the phone or iOS app with synthetic users, or spending the Codex week on testing.
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
| `--out` | the run folder; on the cloud, the thread's designs folder, which outlives the machine | a folder under `/tmp` |
| `--detach` | start in the background, in a session of its own, logging to `workday.log` in the run folder | off |

In the Agentbox cloud nothing a session starts can sign in: use
`--engine external`, read each `stretch-N.prompt.md` the runner writes, run
it as a subagent allowed only its `phone` and `diary`, and write
`stretch-N.done` when it returns.

## Then fix what they found

Read `report.md` and open the pictures. Reproduce each broken or wrong issue
with `phone` yourself before calling it a bug: the threads are made up, and a
tester can be wrong. Testers do not know the preview's own limits and will log
them; they are not the app's:

- No computer is behind it, so nothing sent ever runs, new threads stay
  Queued or In progress, and the banner says the computer is offline.
- What the phone sends is kept in memory and gone on reload.
- Testers working at the same time cannot see each other's diaries, so one
  bug can appear under two titles in the report.

Fix the real ones in one branch, test first as CLAUDE.md says, and ship by the
rules in the project's own instructions: fixes nobody sees ship, wide ones get
`handoff` first, and anything on screen goes to the person with screenshots
taken with `phone shot`. The next workday's testers are told what
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

A repeating task on this project, daily. The run itself is on the default
engine; only the testers spend the Codex week. A run never sits through a
workday: it fixes yesterday's and starts today's, and today's testers are
told what was logged, so they check the fixes.

The workday runs from the folder the app runs from, which follows public
main, not from the run's task folder: the testers' `phone` and `diary` load
files from the repository all day, and a task folder is deleted when its run
ends. `--detach` puts it in a session of its own, so the run ending does not
end the day.

> Run the product loop on the phone app (.claude/skills/product-loop).
> Testers spend the Codex login at HOME.
>
> 1. Fix yesterday's. Take the newest folder under ~/.agentbox/product-loop/
>    with no `handled` file. If it has a report.md, fix and ship what its
>    testers found by this project's instructions, then write `handled` in
>    it. If it has none and no workday is running, that day failed: read its
>    workday.log and fix the cause. Bring me only the changes those
>    instructions send to me, with pictures.
> 2. Start today's, unless `pgrep -f product-loop/scripts/workday.mjs` finds
>    one running or `pace.mjs --home HOME` says stop. Fast-forward the app
>    folder to public main if it has no tracked changes, then from there run
>    `workday.mjs --detach --pace --hours 10 --codex-home HOME --out
>    ~/.agentbox/product-loop/<today> --who` with three people from
>    .claude/skills/power-test/people chosen for what changed this week, or
>    two if the Mac has under 3 GB free.
> 3. Delete folders there older than two weeks.
>
> If nothing in step 1 needs me, finish clean.

`--pace` waits out a hold or a full 5-hour window inside its hours, so a
day that starts ahead of the line still tests once the line passes it.
