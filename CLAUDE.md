# agentbox: notes for agents working in this repo

agentbox is a macOS inbox over a store on disk: work items in, headless
`claude -p` and Codex workers out, one per item. Read the code and git for the
current state; this file only holds the rules that are not obvious from them.

## Every change lands with tests, and you run all of them

- Write the test first and watch it fail, then fix.
- Cover the cases, not the case: the reported one, the boundary either side of
  it, and the case that must NOT match.
- Name the test file after the behaviour, as a sentence
  (`a-reply-moves-the-agent-row.test.mjs`), and open it with a comment saying
  what broke and how you measured it.
- Before you report, run the tests for what you changed:
  `npx vitest related --run <the files you changed>`. That is your own tests
  plus every test that imports those files. Do not run the whole suite by
  hand: several agents share one Mac, and the push hook and GitHub already do
  it (GitHub runs the whole suite on every push; the hook runs it when a change
  touches what every test depends on).

## NO WORKER EVER DRIVES THE USER'S OWN BROWSER

Claude Code can attach a session to the browser a person is signed into with
`--chrome`. That flag must never appear in anything this app spawns, because
that browser is signed into every account its owner holds.
`tests/no-worker-drives-her-own-browser.test.mjs` fails if it ever does. A
browser an agent may drive has to carry nothing; the app's own pane on the
`persist:junk` partition is the only candidate. `--ide` is the user's to switch
on, never ours.

## Billing

Workers run on the user's own Claude or Codex subscription. Never pass an API
key into a worker's environment.

## One-off harnesses go in `scripts/scratch/`

It is gitignored. A script that proves one change runs once; move it up into
`scripts/` only if something will run it again.

## Nothing personal is committed

This repository is public. Names of the people who use it, pasted
conversations, screenshots or recordings of real sessions, account ids, home
paths, keys and tokens stay out of it. Quoting feedback in a comment is fine
as long as it names nobody and carries nothing private. `scripts/check-before-public.mjs` runs before every push
to it and refuses one that carries any of them; `npm run check:public` audits
the whole tree.

## THE TEAM VERSION IS PART OF THIS REPOSITORY (2026-10-01)

The team version (shared projects, teammates, the Team page) used to live in a
separate private repository. It was merged in here with its history, so this
is the one app and the one source of truth. The plan is `docs/team/PLAN.md`.

- The team cloud's address and key, `cloud/team.config.json`, are never
  committed (it is ignored, and `tests/the-team-cloud-key-stays-out-of-the-repository`
  checks it). Machines that run the team version keep their own copy; without
  it the app is the single-person app. `cloud/team.config.example.json` shows
  the shape.
- A branch cut from the old private repository's history will not line up with
  this one: the merge rewrote those commits to take the key file out. Move it
  across with
  `git rebase --onto refs/remotes/origin/main $(git merge-base <branch> 5ff1b688195c90508ecb8abdc7355e028226e729) <branch>`,
  where that sha is the old team history's last commit.
- Keep team code in its own files (`main/team/`, `renderer/src/team/`,
  `shared/team-*.mjs`, `cloud/`, `tests/team-*.test.mjs`) where that is
  natural.
