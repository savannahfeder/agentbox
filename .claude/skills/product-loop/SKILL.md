---
name: product-loop
description: Run Agentbox's own product loop. Synthetic power users test the phone app for a workday on the person's Codex plan (never Claude Code), paced to use about 90% of that plan's week by its reset, and the run fixes and ships what they find under the project's own instructions. Use when asked for the product loop, the self-improving loop, a workday of testers, testing the phone or iOS app with synthetic users, or spending the Codex week on testing.
---

# The product loop

Thread w-e5f506ccb3 is the model: a synthetic team used the multiplayer
build for whole workdays, logged what broke, agents fixed it, and the same
team tested the fixes the next day. The person only chose between finished
screens. This skill runs that loop on its own, one workday per day, on the
Codex plan the person keeps for testing, starting with the phone app.

Testers run on Codex, never Claude Code (2026-11-08): every one is `codex
exec` on the Codex login with the best plan, unless `--codex-home` names one.
Never run a tester as a subagent. `../power-test/scripts/codex-tester.mjs`
starts them for both skills.

## One workday

```sh
L=.claude/skills/product-loop/scripts
node $L/pace.mjs                    # run, hold, wait or stop, and why
node $L/workday.mjs --who founder,startup-engineer,new-user --minutes 30 --pace --hours 10
```

`workday.mjs` builds the phone app's browser preview (`EXPO_PUBLIC_PREVIEW=1`,
made-up threads, nothing signed in), serves it, and gives each person from
`../power-test/people` a folder with two commands: `phone` (the app at an
iPhone's size, touch on: look, tap, type, swipe, shot, away) and `diary`. A
tester is `codex exec` with every API key stripped, in Codex's sandbox with
the local network open, or without the sandbox on a machine that refuses it
(the Agentbox cloud). Each stretch after the first is told what was already
logged. `--pace` keeps starting stretches while that login's week is behind
its line, waits out a full 5-hour window, and stops at the target or at
`--hours`. `report.md` in the run folder ranks every issue, worst first, with
pictures.

| flag | what | default |
|---|---|---|
| `--who` | names from `../power-test/people`, `random:N` or `all` | `random:2` |
| `--minutes` | one stretch | 30 |
| `--stretches` / `--pace` | how many, or as many as the week allows | 1 |
| `--engine` | `codex`, or `external` (it only writes each stretch's prompt, for a Codex you start by hand) | `codex` |
| `--codex-home` | the Codex login the week is read from and spent on | `$CODEX_HOME`, else the Codex login on the best plan |
| `--target` | how much of the week to have used at its reset | 90 |
| `--focus` | what shipped and wants leaning on | none |
| `--out` | the run folder; on the cloud, the thread's designs folder, which outlives the machine | a folder under `/tmp` |
| `--detach` | start in the background, in a session of its own, logging to `workday.log` in the run folder | off |

In the Agentbox cloud Codex signs in with the login the cloud carries and
runs without its sandbox, so the workday runs there as it does on a Mac.

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

## Then close one gap with the desktop

The phone is meant to do everything the desktop does. `mobile/parity.mjs`
names every desktop feature and says whether the phone has it, why it should
not, or what it would take; `tests/the-phone-app-has-every-desktop-feature-or-says-why-not`
fails when the desktop gains one the file does not place.

`node scripts/phone-parity.mjs` prints the count and every feature still to
do. Each day, after the fixes, build the first one on that list that needs
no decision from the person, on its own branch: test first, mark it
`{ phone, find }` in the ledger, and lower `STILL_TO_DO`. It ships by the
project's instructions like any other change, which for a feature on screen
means pictures to the person first. A gap whose entry says it needs a
decision (instruction text on the phone, for one) waits for the person.

The workday tells its testers what reached the phone in the last seven days
(`node scripts/phone-parity.mjs --since 7`), so a new feature gets a day of
real use before it is called done.

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
engine; only the testers spend the plan the instruction names. A run never sits through a
workday: it fixes yesterday's and starts today's, and today's testers are
told what was logged, so they check the fixes.

The workday runs from the folder the app runs from, which follows public
main, not from the run's task folder: the testers' `phone` and `diary` load
files from the repository all day, and a task folder is deleted when its run
ends. `--detach` puts it in a session of its own, so the run ending does not
end the day.

> Run the product loop on the phone app (.claude/skills/product-loop).
> Testers run on Codex only, on the Codex login with the best plan.
>
> 1. Fix yesterday's. Take the newest folder under ~/.agentbox/product-loop/
>    with no `handled` file. If it has a report.md, fix and ship what its
>    testers found by this project's instructions, then write `handled` in
>    it. If it has none and no workday is running, that day failed: read its
>    workday.log and fix the cause. Bring me only the changes those
>    instructions send to me, with pictures.
> 2. Start today's, unless `pgrep -f product-loop/scripts/workday.mjs` finds
>    one running or `pace.mjs` says stop. Fast-forward the app
>    folder to public main if it has no tracked changes, then from there run
>    `workday.mjs --detach --pace --hours 10 --out
>    ~/.agentbox/product-loop/<today> --who` with three people from
>    .claude/skills/power-test/people chosen for what changed this week, or
>    two if the Mac has under 3 GB free.
> 3. Build the first feature `node scripts/phone-parity.mjs` lists that
>    needs no decision from me, as the skill's "close one gap" says.
> 4. Delete folders there older than two weeks.
>
> If nothing in step 1 needs me, finish clean.

`--pace` waits out a hold or a full 5-hour window inside its hours, so a
day that starts ahead of the line still tests once the line passes it.
