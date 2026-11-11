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

## The review computer

While Apple reviews the app, the demo account needs a computer signed in to it.
On the cloud alone, a thread goes quiet 20 minutes after an answer.

- `scripts/app-review-computer.mjs on` makes one small AWS server that does
  this. It reads the demo password from this Mac's Keychain.
- `login` signs Codex in on the server. It prints a code to type into a
  browser signed in to the Codex account the founder keeps for this. Never
  use the founder's own Claude or Codex account: "we're not giving other
  people access to my account".
- `status` shows the server and its end date. `off` deletes it at once.
- What the first one (2026-11-08) taught:
  - Only the desktop app sends threads to the phone. The headless
    `npx agentbox-app` copy never does. So the server runs the desktop app on
    a virtual screen (xvfb), built from the public repository.
  - It signs in to the demo account only when `~/.agentbox/team.config.json`
    holds the cloud's public address. The password comes from
    `AGENTBOX_TEAM_TEST_LOGIN`.
  - The desktop app has no screen to click, so make the project and its
    first thread in the headless app over an SSH tunnel to port 7777. Then set
    `accountId` in `~/app/zero.config.json` to the account that holds them.
  - Give git a demo identity on the server, or the agent's first answer asks
    the reviewer for a name and email.
  - The proof that it works: reply on the demo account from app.agentbox.ac,
    and an answer comes back.
- It always ends. The end date is 14 days unless `--days` says otherwise, and
  30 at most. The machine shuts itself down then, AWS deletes it on shutdown,
  and an AWS schedule deletes it too.
- The founder asked for it to be turned off for certain. So when you turn it
  on:
  1. File a thread with `runAt` at the end date plus an hour: "Check the App
     Review computer is gone". It runs `status`, and `off` if anything is
     left.
  2. Run `off` the day the app is approved or rejected for good, and say so on
     the App Store thread.
  3. Never run `on` again without saying so on that thread.

## Use it as a loop

1. Run the board.
2. Fix every risk at 5% or more that code, the listing or the review notes
   can fix.
3. Run the board again with fresh reviewers. Do not re-ask the same ones.
4. Repeat until it says Submit or what is left is only the person's to do.
5. The synthetic reviewer on the iOS simulator is one more reviewer. What it
   hits counts as a risk of at least 30% until fixed.
