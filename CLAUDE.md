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
- Run the whole suite before you report anything: `npx vitest run`.

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

This repository is public. Conversations, quotes of the people who use it,
screenshots or recordings of real sessions, account ids, home paths, keys and
tokens stay out of it. `scripts/check-before-public.mjs` runs before every push
to it and refuses one that carries any of them; `npm run check:public` audits
the whole tree.

## THIS CHECKOUT IS THE PRIVATE TEAM REPOSITORY, NOT THE PUBLIC ONE

`origin` is `Astral-Agent/agentbox-team`, private. It is the public repository
plus the team version (shared projects, teammates, the Team page), which stays
private until the founder decides to open it. The plan is `docs/team/PLAN.md`.

- `upstream` is the public `savannahfeder/agentbox`. Its push URL is disabled on
  purpose. Never re-enable it and never push team code there.
- Nothing pulls the public repo in automatically; this version may be
  maintained on its own. If public changes are wanted, merge them by hand
  (`git fetch upstream && git merge upstream/main`), never rebase.
- Keep team code in its own files (`main/team/`, `renderer/src/team/`,
  `shared/team-*.mjs`, `cloud/`, `tests/team-*.test.mjs`) where that is
  natural, so the two codebases stay easy to compare.
- The section above about nothing personal still applies here: this code is
  meant to become public later.
- Work on branches named `agentbox/<work item id>`; `main` here is the team build.
