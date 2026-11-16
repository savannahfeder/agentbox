# Agents running

Where most real bugs have been: a task is sent and an agent has to start,
finish, and bring its answer back to the right thread, in the right project,
in the tab the person reads, on Claude Code or on Codex, several at a time,
across a restart, and when a login runs out of usage.

## Sub-features

- `codex-runs` a task sent to Codex from the composer runs on the real `codex` binary and its answer lands on that thread.
- `right-inbox` an answered thread shows under Needs you; a thread sent to a project is filed under that project.
- `many` six tasks sent back to back, mixed engines and projects: every answer lands on its own thread, none is duplicated, no worker is left running.
- `one-login-out` with two Claude logins and one out of usage, every task is still answered, the one that hit the limit moved to the free login within a minute.
- `all-out` every login out: the thread says so plainly with the reset time, it is under Needs you, and it is tried at most once per login, never in a loop.
- `restart` quitting and reopening the app mid-run: each interrupted task is answered exactly once afterwards.

## How to get to it (user POV)

- N, type, ⌘↵. The Model word under the box opens the menu; All models shows a Codex column.
- The project chip at the foot of the composer.
- Quitting and reopening the app (⌘Q, or a restart for an update).

## Driving it with live.mjs

Preconditions: `live.mjs up` (stand-in mode) and a clean `live.mjs doctor`. Stand-in mode gives the copy two fake Claude logins (`.claude` and `.claude-second` in its own home) and points the real `codex` at a scripted model. The task's own words steer the stand-ins: `[[tok:abc]]`, `[[stub:slow:ms]]`, `[[stub:hang]]`, `[[stub:limit]]`, `[[stub:limit-first]]`, `[[stub:limit-on:.claude-second]]`.

- **Codex.** `live.mjs drive codex-thread`. The row's engine is `codex`, the scripted model's log has the task's token, the answer carries it, and the thread is under Needs you.
- **Several at once.** `live.mjs drive many-at-once`. Six rows, each in the project and on the engine it was sent to, each answer carrying its own token, every title once, all six under Needs you, no `stub-claude-worker` or `codex exec` process left for the instance.
- **One login out.** `live.mjs drive one-login-runs-out`. `<receipts>/<id>.spawns.jsonl` shows the limited task's attempts as `.claude-second → default`, and both answers land within a minute.
- **Restart.** `live.mjs drive restart-mid-run` calls `live.mjs restart` while both workers are mid-run, reopens the tab on the new address, and expects both answers within two minutes, once each.
- **Home after a restart.** `live.mjs drive home-agrees-after-restart` files a Codex task from Home's box, restarts 30 s in, then reads Home's In progress card and the Inbox's In progress tab about every 2 s until the answer lands. A reading taken across the moment the answer lands can disagree; the next one must not. On a cloud machine whose process 1 never reaps (zombies hold a thread's folder after a restart), run `up` and the drive under a subreaper.
- **All out.** `live.mjs drive every-login-runs-out`. Run it last: it leaves every login resting until 11:59pm on that copy.
- **Real tools.** With `up --real`, `codex-thread` and `many-at-once` run on the Claude Code and Codex this Mac has (tiny one-word tasks); the stand-in-only drives skip themselves.
- **Proof.** Each drive's pictures and `report.json`; `codex-model.log` and `receipts/` in the instance folder while it is up.

## Gotchas

- Composing writes two lines; the engine and model are on the second. Read the row after the person's line is there, not after the title first appears.
- A closing composer keeps the cursor for a moment; wait for it to go before pressing N again.
- The Codex app-server is one long-lived process by design and is not a leaked worker.
- With the stand-in, a reply cannot resume a session (it leaves no Claude Code transcript), so the app re-briefs; resuming is proved with `--real`.
