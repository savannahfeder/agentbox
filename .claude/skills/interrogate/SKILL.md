---
name: interrogate
description: Have two different models, Claude and Codex, try to break a change independently, then sort what they found into act on, consider, noted and dismissed. Findings both models raise on their own are the strongest signal. Reports only and changes no code. Use when asked to interrogate, stress test, tear apart or get a second opinion on a diff, or before shipping a change the blast-radius skill calls wide.
disable-model-invocation: true
---

# Interrogate

Two reviewers attack the same change. The disagreement comes from using two
different models, not from giving one model two personas. You are the lead:
you merge what they find and judge it. You do not change code.

## 1. Scope

Use the files or diff the person points at. Otherwise use the branch:
`git diff main...HEAD` plus the working tree.

## 2. Intent

Write one paragraph saying what the change is for, from the request, the
commit messages and the code. If you cannot tell, ask before going on. The
reviewers challenge how well the code does this, not whether it should.

## 3. Write the reviewer prompt

Write one prompt to `scripts/scratch/interrogate-prompt.md` (gitignored) and
give the same text to both reviewers:

> You are an adversarial code reviewer for this repository. Read CLAUDE.md
> first. Find real problems in the change below: bugs, design flaws, security
> problems, and maintenance traps. Do not praise it. Do not change any file.
>
> Intent: {the paragraph from step 2}
>
> Change: {the diff, or the list of files to read}
>
> Look at whichever of these apply, and skip the rest:
> - Correctness: empty and boundary inputs, errors swallowed, races, stale
>   state, what happens if it runs twice or dies halfway.
> - Root cause: does it fix the cause, or guard against a symptom? Could a
>   "do not do X" comment be a check instead?
> - Fit: one copy of each rule, validation where data enters, no old path
>   left alive beside the new one.
> - This app: main and renderer out of step, old store rows, other machines,
>   anything that changes what every worker can do or who pays for it.
> - Tests: do they test behaviour, cover the boundary either side, and the
>   case that must not match? Would they go red if the bug came back?
> - Complexity: could it be simpler without losing anything?
>
> For each finding give: severity (critical, warning or nit), `file:line`,
> what is wrong, the evidence (trace the call path, do not just assert), two
> scores from 1 to 10 for how often it would happen in real use and how bad
> it would be, and a concrete fix if you have one. If you find nothing, say
> "no findings".

## 4. Run both at once

**Reviewer A, Claude.** Start a subagent with the Agent tool
(`general-purpose`), in the background, with the prompt.

**Reviewer B, Codex.** In the same turn, run in the background:

```
codex exec -s read-only -C "$PWD" --ephemeral -o scripts/scratch/interrogate-codex.md "$(cat scripts/scratch/interrogate-prompt.md)"
```

Codex runs on the person's own ChatGPT sign-in. Never set an API key for it.
Run one Codex review at a time on this machine. If `codex` is missing, signed
out or out of usage, run a second Claude subagent instead, told to look hardest
at whatever reviewer A's lenses skipped, and say in your report that the second
model was unavailable.

## 5. Merge

Merge findings that describe the same problem in different words, and note
which reviewer raised each. A finding both raised independently is the
strongest signal. A finding only one raised still gets read on its merits.
Where one reviewer flags something and the other says the opposite, note it.

## 6. Judge

You are a pragmatic senior engineer, not a vote counter. Check each finding
against the code before you trust it. Put each in one bucket, with who raised
it and one line of reasoning:

- **Act on**: real problems with correctness, security or maintenance that
  would block a pull request, and whose two scores multiply to 5 or more.
  Below 5 goes in Consider or Noted, however sure the reviewer is.
- **Consider**: legitimate, but not clearly worth fixing now.
- **Noted**: true but not worth acting on at this stage.
- **Dismissed**: wrong, nitpicking, or missing context, with the reason.

## Report

- Intent, in one paragraph.
- Reviewers: which models ran, and how many findings each.
- Act on, Consider, Noted, Dismissed.
- Where the two agreed and where they split.

Adapted from pstack's `interrogate` skill,
https://github.com/cursor/plugins/tree/main/pstack (MIT).
