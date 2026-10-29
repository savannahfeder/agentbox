---
name: handoff
description: Hand a finished change to the best Codex model at the time (GPT-6.1-Sol in 2026-10) to test and review, then fix only what it finds that is both likely and bad. Every finding is scored 1 to 10 for how often it would happen and how bad it would be; a product of 5 or more gets fixed, anything lower is filed and the code is left alone. Stops after two rounds so the review cannot loop. Use when asked to hand off, hand a change to Sol or Codex for testing, or get it tested by another model before shipping.
---

# Handoff

You wrote the change. The best Codex model tests and reviews it. You decide
what to fix. A second model catches what you cannot see in your own work, but
left alone it flags cases that are possible and almost never happen, you fix
each one, it finds the next, and the loop never ends. The score below ends it.

## 1. Commit first

Commit your work on your branch before the handoff. The reviewer runs tests
and may write files, and a clean tree lets you see and undo exactly what it
touched.

## 2. Write the brief

The reviewer knows only what the brief says. Write it to
`scripts/scratch/handoff-brief.md` (gitignored):

> You are testing and reviewing a change in this repository. Read CLAUDE.md
> first. Do not commit, and do not change any tracked file: put any harness
> you write in `scripts/scratch/`.
>
> What it is for: {one paragraph from the request and the commits}
>
> What changed: {`git diff main...HEAD --stat`, and the files that matter}
>
> What I already checked: {tests you ran and what they showed}
>
> What I did not check: {what you could not run or were unsure of}
>
> Run the tests for this change (`npx vitest run <files>`), and try to break
> it the way a person using the app would. For each problem you find give:
> `file:line`, what goes wrong, the steps or input that cause it, and two
> scores from 1 to 10: how often it would happen in real use, and how bad it
> would be when it does. Show a failing test or a trace, not a guess. If you
> find nothing, say "no findings".

## 3. Run it on the best model now

Pick the model when you hand off, not from memory: the best one changes when
OpenAI ships a new one. The script prints the first model Codex's own list
offers this login, which Codex orders newest frontier model first. If the
person named a model for this handoff, use theirs instead.

```
MODEL=$(node scripts/codex-best-model.mjs)
codex exec -m "$MODEL" -s workspace-write -C "$PWD" --ephemeral -o scripts/scratch/handoff-review.md "$(cat scripts/scratch/handoff-brief.md)"
```

Run it in the background and wait for it. Codex runs on the person's own
ChatGPT sign-in; never set an API key for it. If the script prints nothing, or
`codex` is missing, signed out or out of usage, stop and say so. Do not stand
in a Claude subagent: the point is a different model.

Then `git status`. Anything the reviewer changed outside `scripts/scratch/`
is not yours: read it, then `git restore .` to put the tree back to your
commit.

## 4. Score and sort

Check each finding against the code before you trust it, and re-score it if
the reviewer's numbers do not match what you see. Multiply the two scores:

- **5 or more: fix it.** Test first, watch it fail, then fix, as CLAUDE.md
  says.
- **Below 5: leave the code alone.** File it instead (step 6).
- **Not real** (no failing test, the trace does not hold, or it misreads the
  code): dismiss it with one line of why.

Do not design for rare or future cases nobody asked about. A fix for one
finding should not grow into a guard for its neighbours.

## 5. Second round, and the last

If you fixed anything, commit, and hand the fixes back once to the same model
with a brief that lists what you changed. Score the new findings the
same way. Stop after two rounds whatever round two says; anything left over
scoring 5 or more goes in your answer for the person to decide.

## 6. File what you left

Put every finding below 5 in one child thread under the one you are on
(`create_work_item` with `parent`), one line each: what it is, `file:line`,
and the two scores. One thread for all of them, not one each.

## Report

- Which model ran, and how many findings it raised each round.
- Fixed: each with its scores and the test that now covers it.
- Left alone: the count and the child thread they went to.
- Dismissed: each with its reason.
- Anything still 5 or more after round two.
