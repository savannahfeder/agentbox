---
name: app-review-board
description: Judge whether the phone app's App Store submission will be accepted first time, and refuse to submit under 90%. Runs independent mock Apple reviewers (Codex and Claude) on the store build's source and checks live what a reviewer meets (privacy, terms and Help pages, the demo account). Use before any App Store submission or resubmission of the phone app, after a rejection, or when asked for the odds of approval.
---

# App review board

`scripts/app-review-board.mjs` gives the odds that the phone app's next App
Store submission is accepted first time, and says **Submit** only when all
of these hold:

- the odds are 90% or more,
- at least two reviewers answered,
- every live check passed. A check that could not run counts as failed.

The odds are the reviewers' judgement, anchored to Apple's published
rejection rate. They are not a measurement, so say so when you report them.

## Run it

```sh
REVIEW_EMAIL=… REVIEW_PASSWORD=… node scripts/app-review-board.mjs --codex 2 --claude 2 --out <dir>
```

- On the founder's Mac, Codex runs on the second login: set
  `CODEX_HOME=~/.codex-2`.
- Never print the demo password or write it to a file in the repository.
- Where `claude -p` is not signed in (a cloud run), pass `--claude 0`. Then
  give `<dir>/prompt.txt` (made by `--prompt-only`) to two Claude helpers. Have
  each write its answer to a file, and add each file with `--with <file>`.
- `<dir>/report.md` is the verdict: the risks, highest first, each with its
  fix. The exit code is 0 only for Submit.

## Use it as a loop

1. Run the board.
2. Fix every risk at 5% or more that code, the listing or the review notes
   can fix.
3. Run the board again with fresh reviewers. Do not re-ask the same ones.
4. Repeat until it says Submit or what is left is only the person's to do.
5. The synthetic reviewer on the iOS simulator is one more reviewer. What it
   hits counts as a risk of at least 30% until fixed.
