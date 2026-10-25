---
name: blast-radius
description: Before a change ships, find what it could break outside its own diff, and prove the one fact it is safe because of by running real code rather than writing an argument. Use when a small change touches main/, shared/, the store, worker spawning or anything another part of the app reads, when reviewing a diff you do not trust, or when asked what could this break or what is the blast radius.
---

# Blast radius

Listing the callers is not the job; grep does that in a second. The job is
the breakage grep will not show you.

## Do not trust your own write-up

A write-up that sounds right reads the same whether or not it is true. So
find the one or two facts the change's safety rests on, and push each as far
down this list as is cheap. Say where each one stopped.

1. You said so. Worth nothing on its own.
2. You pointed at the line: a real `file:line`, or the library's own source.
3. You walked the failure step by step and showed it cannot happen.
4. You ran it: a script or test that calls the real code and fails loudly if
   you are wrong.
5. You reproduced it in the running app, with the `verify-agentbox` skill.

Level 4 is usually one small script in `scripts/scratch/` (gitignored) that
imports the module the app ships and calls the exact function you are worried
about. If it should keep holding, make it a test instead.

## Where grep stops in this repository

- **`shared/` is imported by both the main process and the renderer.** A
  change there has two sets of callers, built two different ways.
- **Electron reads `main/`, `shared/` and `preload.cjs` once, at boot.** A
  new IPC call from the renderer against an old main process fails silently.
  Ask whether both halves change together.
- **Tests that read source as text.** Some tests grep a file for a string
  instead of importing it. `npm run test:changed` finds them;
  `vitest related` does not.
- **The store is a ledger written by older versions.** A renamed or reshaped
  field has to still read rows written before the change, on every machine
  that syncs this store, including teammates' through the team cloud.
- **How workers start.** `sessionArgs`, the env scrub, and
  `worker-permissions.json` decide what every worker can do and who pays for
  it. A change near them changes all workers at once.
- **Other machines.** Linux paths, Codex or Claude Code installed with npm
  under nvm, an app opened from the Dock with a short PATH, a home folder with
  a space. `verify-agentbox` drives these.
- **What the person sees.** A rule duplicated between main and renderer, like
  ranking or inbox membership, drifts. Check there is still one copy.

## Steps

1. Read the change: the diff, the symbols it adds, changes or deletes, and
   what it now does differently that the diff does not spell out.
2. Find the one fact it is safe because of. Most risky-looking changes are
   safe because of a single fact, like "this only drops cache entries that are
   already dead". If that fact holds, most of the risks clear at once. Spend
   your time here.
3. Look where grep stops, using the list above. Read the source of any library
   you depend on at its pinned version.
4. For each risk, give a real chance of it happening and a real cost if it
   does. Keep the confirmed ones. List the ones you checked and cleared
   separately. Cite real lines. A search that finds nothing is still an
   answer; never invent a caller.
5. Prove the one fact at level 4 or 5, and paste what happened.
6. For a wide change, get a second opinion with the `interrogate` skill.

## What to hand back

- **What it does**, including the part that is not obvious.
- **The one fact it is safe because of**, the level you got it to, and the
  proof. If you could not prove it, say unproven.
- **Risks**: how each breaks, `file:line`, how likely, how bad, how to check.
- **Cleared**: what you checked and why it is fine.
- **Before it ships**: the cheapest test that would catch the real bug.

Adapted from pstack's `blast-radius` skill,
https://github.com/cursor/plugins/tree/main/pstack (MIT).
