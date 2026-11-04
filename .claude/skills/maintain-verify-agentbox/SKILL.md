---
name: maintain-verify-agentbox
description: The upkeep pass for .claude/skills/verify-agentbox. Re-reads every feature in its map from source, drives every feature live, and fixes the map, drives, stand-in or machine shapes where the app has moved, as one commit of proven corrections. Use when asked to maintain or audit the verify skill, after a change that moves a user path (a shortcut, a screen, how a worker is spawned), or on its weekly repeat.
disable-model-invocation: true
---

# Maintain verify-agentbox

A verification map starts going stale the day the app changes under it. This
pass keeps `.claude/skills/verify-agentbox/` true. The unit of rigour is the
feature: every feature file is read from source and every feature is driven
live; not every sentence is re-proved.

## When to run it

- **After a change that moves a user path**: a renamed shortcut, a redrawn
  composer or thread, a change to how workers are spawned or what they are
  handed, a new install method in the wild. The verify run usually says so
  first, as a drive that fails on a healthy instance.
- **Weekly otherwise**, as a repeating task. Daily is more than the app
  moves; the pre-deploy run already catches breakage, and this pass is for
  drift the pre-deploy run cannot see (a feature the map does not know
  about, a stand-in that no longer behaves like Claude Code).

## Outcome

End with exactly one, and say which:

- **clean**: every feature got source and live coverage; nothing to change. No commit.
- **changed**: one commit on the task branch of proven corrections to the skill.
- **blocked**: coverage could not finish, or a fix could not be proven. Say exactly what blocked it.

## Edit scope

Only `.claude/skills/verify-agentbox/` and the harness it owns:
`scripts/lib/stub-claude-worker.mjs` and the two tests that pin the harness
(`tests/the-pre-deploy-check-runs-what-a-change-needs.test.mjs`,
`tests/the-stand-in-worker-speaks-claude-codes-input-protocol.test.mjs`).
Never product code. Behaviour the map describes that the app no longer has is
either drift (fix the map) or a regression (file it as its own thread, mark
the claim `known` with that thread's id, leave the product alone).

## The pass

0. **Baseline.** `node .claude/skills/verify-agentbox/scripts/verify.mjs --all`.
   A red layer is the first thing to triage, not a reason to stop.

1. **Index.** Read `features/README.md` and list `features/`. Fix missing,
   extra, duplicate or dead entries. Check every drive in `scripts/drives.mjs`
   has a feature file and every feature file names its drive.

2. **Source wave.** One read-only subagent per feature file, launched together.
   Each answers "how does this feature work today?" from the source, cites the
   files, flags likely drift with citations, and returns one live recipe.
   Subagents never drive the app and never edit. Return shape: summary / entry
   points with file:line / likely drift or none / one recipe.

3. **Reconcile.** Every feature file has a returned summary. Spot-check cited
   drift. Then sweep `git log --since=<last pass> --stat -- main shared renderer bin`
   for user-facing surfaces missing from the map; name a concrete source path
   before calling one missing. Also check the two things only this repo has:
   - **The stand-in still speaks Claude Code.** Compare the flags
     `main/harnesses/claude.mts` and `main/claude-input.mts` spawn with against
     what `scripts/lib/stub-claude-worker.mjs` honours. A new input or output
     contract the stand-in ignores makes every live drive prove the wrong thing
     (this happened once: the stand-in predated streamed input and no answer
     ever reached a row).
   - **The shapes still match the world.** Read the install docs for Claude
     Code and Codex for a new install method or location, and the bugs filed
     since the last pass for a machine-specific one. Each becomes a shape in
     `scripts/machines.mjs` with `why` and `expect`.

4. **Live pass.** Required even when source looks clean. One instance, driven
   serially: `live.mjs up`, `doctor`, then every drive, plus any recipe from
   step 2 the drives do not cover yet (add it as a drive if it will be needed
   again). Hold three rules the whole time: doctor before the first drive and
   after any drive that failed or surprised you; evidence in
   `/tmp/agentbox-verify/runs` survives every cleanup; `live.mjs down` after
   the last drive, including re-proofs of fixes. Finish with one
   `verify.mjs --all --real-claude` run, because the stand-in cannot prove
   what Claude Code does.
   A feature that cannot be reached is `unreachable` only with the concrete
   missing prerequisite (an account, an OS, external state) and the route
   tried; if the map omits that prerequisite, that is drift.

5. **Triage.** Wrong or missing description: drift, fix the map. Working
   behaviour the harness cannot drive: harness gap, fix it (scripts stay
   executable, every invocation shown in SKILL.md). Broken behaviour: product
   gap, file it as a thread with how it was measured, mark it `known`. A
   `known` claim that now holds: take the marker off.

6. **Ship or stop.** For changed: re-read every changed file, run
   `npm run test:changed`, commit on the task branch, and follow the task's
   shipping instructions. For clean or blocked: no commit; report the outcome
   and what was covered.

Keep run notes (features covered, unreachable prerequisites, drift found,
outcome) in `scripts/scratch/`, never committed.

Adapted from Cursor's `maintain-verification-skill`
(https://github.com/cursor/plugins/tree/main/pstack/skills/maintain-verification-skill).
