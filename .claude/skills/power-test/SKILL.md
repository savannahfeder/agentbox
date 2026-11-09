---
name: power-test
description: Power test Agentbox the way the people it is built for use it, for hours. Testers drawn from a pool of people Agentbox is for (startup engineer, big-company engineer, founder, CTO, AI-lab engineer, ops teammate, first-day user) each drive their own copy of the app with many threads at once, Claude Code and Codex, several logins, replies and long threads, while logins run out, agents hang or die, and the app restarts or freezes. A watcher reads what the screen cannot show and a ranked report comes out. Use when asked for a power tester, power-user testing, testing a feature thoroughly or "to the ends of the earth", a long or multi-hour test, many threads at once, or spending leftover subscription usage on testing.
---

# Power test

Agents asked to test the app used it for two minutes and said it was fine.
The bugs that cost days only show on a long, busy day: many threads at once,
replies while an agent works, switching engine or model, a second login, a
login running out, a restart. This skill runs that day, for as long as you
say, and the clock owns it, not the tester.

Each person in `people/` gets:

- **Their own copy of the app** (`live.mjs`, one per person), shaped like
  their setup: their number of Claude logins, Codex or not, their projects
  with real code in them (`fixtures/`), an inbox with weeks of old threads.
- **A tester playing them**: a Codex session given who they are, their
  day, their work, and two commands, `app` (the screen, through
  `browse.mjs`) and `diary` (notes and issues). It is stopped every
  `--round-minutes` and started again with its diary, the issues it logged,
  where it is in its day and **what it has not tried yet**, until the time
  is up. A tester that stops early just gets the next stretch.
- **Things going wrong on a clock** (`plan.mjs`, `chaosPlan`), never told to
  the tester, because a person learns of them from the app: a second login
  runs out, Codex runs out, every login runs out, the app restarts, the
  app's processes freeze for a while (its window does not); 2% of agents
  hang and 2% die. Stand-ins take 5 to 90
  seconds and offer options 30% of the time.
- **A watcher** (`watch.mjs`) every minute: threads with no answer and no
  word for 10 minutes (30 on real tools), a thread started six times in ten
  minutes, errors in the app's log, memory climbing, more agents than the
  app allows, a screen that stops answering.

At the end, `report.md` ranks every issue (broken, wrong, slow, confusing,
then how often seen), puts beside each what had just happened to the app,
adds the watcher's findings, and says what each tester did and never got to.

## Run it

```sh
P=.claude/skills/power-test/scripts/power-test.mjs
node $P --who startup-engineer,founder --hours 2 --focus "replies after switching to Codex"
```

| flag | what | default |
|---|---|---|
| `--who` | names from `people/`, `random:N` or `all` | `random:2` |
| `--hours` / `--minutes` | how long | 1 hour |
| `--focus` | what the team shipped and wants leaned on, in a sentence | none |
| `--alpha` | alpha features on in every copy, e.g. `teammates` or `teammates,rooms` | off, as for anyone new |
| `--real` | the Claude Code and Codex this computer has, on their plans | stand-ins |
| `--stand-in-cloud` | every thread runs in a stand-in Agentbox Cloud of the copy's own (the real cloud server and sandbox, here, with the stand-in agent); a task naming Supabase, Vercel, Stripe, Expo, AWS or Sentry asks for its key | no cloud |
| `--chaos` | `none`, `light`, `normal`, `heavy` | `normal` |
| `--stuck` | from a twentieth to six tenths of the way in, 7 in 10 stand-in agents get stuck on one cause outside their work (git on the Mac cannot sign in to GitHub) and wait on its row | off |
| `--round-minutes` | one tester session before it is restarted with its diary | 20 |
| `--model` | the testers' Codex model | Codex's default |
| `--codex-home` | the Codex login testers spend | the Codex login on the best plan |
| `--keep` | leave the copies up afterwards | taken down |
| `--files <dir>` | copied into every project's documents in every copy, so testers meet the thing under test (a table, a deck) as their own | none |
| `--team <file>` / `--room <name>` | one tester on a real team, talking in that room (below) | no team |

Evidence goes to `/tmp/agentbox-verify/runs/<time>-power/`, one folder per
person: `diary.jsonl`, `actions.jsonl` (every press, with how long the app
took), pictures, `watch.jsonl`, `machine.json`, `timeline.jsonl`, each
stretch's transcript or prompt, `copy/` (the copy's ledgers, session logs,
log and receipts, kept when it is taken down), and `report.md` at the top.
On the cloud `/tmp` goes with the machine: copy the report and the pictures
you cite into the product's docs before you finish.

## Choosing

- **Who.** Pick the people the feature is for, and one it is not for.
  Logins and usage: `startup-engineer` (two logins), `cto` (three, 300
  threads), `founder` (one plan for everything). Engines: `ai-lab-engineer`.
  Long threads and coming back after an hour: `big-company-engineer`. Plain
  words and the mouse: `ops-teammate`. First run: `new-user`. Say who and
  why when you start.
- **How long.** A feature check: 1 hour. Before a launch: 3 hours or more.
  The chaos is laid out as fractions of the length, so a short run is the
  same day squeezed.
- **Stand-ins or real.** Stand-ins cost nothing but the testers and test the
  app around the agents. `--real` puts real Claude Code and Codex behind the
  copies, in the fixture repositories, on this computer's subscriptions:
  this is the run for usage that would otherwise expire before a reset, and
  the only way to meet a real login running out. The copy's own agents then
  spend the Claude plan too, not only the testing plan, so ask before `--real`. Logins running out, hangs
  and deaths on a clock are stand-ins only; on real tools the clock only
  restarts and freezes the app.
- **Chaos.** `normal` unless asked. `none` to test a feature in calm,
  `heavy` before a launch (adds a Control-C crash and an hour of slow agents).

## Testers run on Codex, never Claude Code

The person keeps a Codex plan for testing only (2026-11-08). Every tester is
`codex exec`, started by the script, on the Codex login with the best plan
(`~/.codex` or any `~/.codex-*`, read from its own sign-in) unless
`--codex-home` names one. The script says which login and plan it chose when
it starts. Never run a tester as a subagent or as `claude -p`: that spends the
Claude plan the person keeps for real work. `scripts/codex-tester.mjs` is the
one place that starts a tester, for this skill and the product loop.

## Where it runs

- **On a Mac** each person needs about 1.2 GB free (2.5 GB with `--real`),
  and the script refuses to start more than fits. Check memory before more
  than two. Testers run inside Codex's own sandbox with the local network open.
- **In the Agentbox cloud** Codex signs in with the login the cloud carries,
  but its sandbox cannot start there, so testers run without it: the machine
  is the throwaway. This keeps a long run off the person's Mac.

## Waiting for it

Start it in the background and stay with it. The Bash tool's background
limit is 2 hours; for longer, start it detached with `AGENTBOX_KEEP=1 nohup
node $P … > run.log 2>&1 &` and wait on `report.md` appearing with an
until-loop. Read `progress.json` in the run folder and give the person a
one-line update every half hour or so: stretch, issues so far, anything the
watcher found. Ctrl-C (SIGTERM) still writes the report and takes the
copies down.

## After it

1. Read `report.md`, then open the pictures of the top issues.
2. Reproduce the broken and wrong ones yourself before calling them bugs
   (`live.mjs up`, the steps, `browse.mjs`). A tester can be wrong; the
   watcher's findings are facts but may have a dull cause.
   Testers do not know these stand-in quirks and will log them; they are not
   the app's:
   - answers are canned, named after the task and numbered by start, so the
     number skips after a start that failed;
   - a Claude login out says "resets 11:59pm" whatever its window, and comes
     back when the window ends;
   - Codex out is a 429 with no reset time;
   - seeded old threads have no session record of their own.
3. Answer with the ranked list in plain words, what you reproduced, and the
   report's path. If they want them fixed, that is one thread for the lot,
   not one per issue. Copy any picture you show into the product's docs
   folder under `designs/<task id>/`.

## What it does not cover yet

- **More than one person on a team**: `--team <file> --room <name>` signs
  ONE tester in to a real team cloud as its own account (live.mjs `--team`),
  with Rooms on, and tells it the person who asked is in that room reading it
  live. The file is `{ config, email, password }`, kept outside the repository
  with mode 600; the account must already exist, be confirmed and be in the
  room. Two testers on one team, and shared threads, are not covered yet.
- **The phone**: the phone app is a plan (`docs/mobile/PLAN.md`) and the
  phone site needs the team cloud. When the app's web build exists, a
  phone-sized surface for `browse.mjs` is the next step.
- **The installed app**: copies are the browser copy (`bin/agentbox.mjs`),
  the same store, supervisor and screen without Electron's shell.
- **A Codex login on real tools other than this computer's**, and accounts
  past four Claude logins.

## Adding to it

- A person: `people/README.md`.
- Something going wrong: an event in `chaosPlan` (`plan.mjs`). A window
  (with `until`) changes `world.json`, which both stand-ins read on every
  start (`scripts/lib/stand-in-world.mjs`); an instant one is handled in
  `power-test.mjs`'s `tick`.
- A watcher check: a pure function in `watch.mjs` with its test, called
  from `tick`.

Tests: `tests/a-power-test-keeps-testing-until-its-clock-runs-out`,
`a-power-tester-is-told-what-it-has-not-tried-yet`,
`what-goes-wrong-in-a-power-test-follows-its-clock`,
`the-power-test-watcher-catches-what-a-tester-walks-past`,
`a-power-test-report-puts-the-worst-first`,
`every-power-tester-is-someone-agentbox-is-for`,
`a-login-runs-out-mid-test-without-the-task-saying-so`.
