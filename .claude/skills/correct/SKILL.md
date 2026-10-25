---
name: correct
description: Find the mistakes agents keep repeating in this repository and make each one impossible, by changing the code's structure first, then a check that fails loudly, then a test, and a written rule only last. Proves each new check goes red on a real past mistake. Use when asked to run /correct, or after the maintainer corrects agents for the same thing twice.
disable-model-invocation: true
---

# Correct

The maintainer keeps correcting agents in this repository for the same
mistakes. Change the repository so the next agent cannot make them.

Assume every contributor is an agent that sees only the files it opened,
copies the nearest example, and takes the shortest path that passes the tests.
Make a change that looks right from one file be right for the whole
repository.

This repository already works this way in places.
`tests/no-worker-drives-her-own-browser.test.mjs` turned a rule into a
failing test, and `scripts/hooks/` turned "never commit in the app's folder"
into a refusal. This skill does that on purpose, across the history.

## Find the mistake classes

Read, newest first:

- `git log` for reverts, "fix again", "put back", and fixes to a fix.
- CLAUDE.md, and the maintainer's private notes if CLAUDE.md points to them.
  Every section that tells an incident story is a class that was fixed with
  prose.
- The maintainer's replies on threads in the Agentbox store
  (`list_work_items`, `read_chat`): look for "again", "I already said",
  "why did".
- Review comments on pull requests.

Group what you find into classes. A class counts once it has happened twice.

## Fix each class at the highest level that works

1. **Remove it with structure.** One owner for each piece of state, one
   supported way to do each task, one copy of each rule (as `shared/rank.mjs`
   is for ranking). Delete the old way and any dead code an agent would copy.
2. **Make the wrong thing fail loudly.** A type, a runtime check, a git hook,
   or a check in `scripts/` whose error names the file or function to use
   instead. If the pattern is already common, fail only when a change adds
   more of it.
3. **A test of the behaviour**, named as a sentence and opened with what
   broke, as CLAUDE.md requires. Fix or delete any test that still passes when
   the behaviour breaks.
4. **A written rule, last**, and only for a judgment call. Nothing fails when
   an agent skips a paragraph.

## Prove it

Fix the most frequent classes first, one commit each. Prove each new check
fails on a real past mistake: check out the file from the commit that had the
mistake, or put the mistake back by hand, and watch the check go red. Paste
that output. Run `npm run test:changed` before you report.

Nothing personal goes into a test or a check: no names, account ids, home
paths or real messages. The repository is public.

## Keep the rules and their checks together

Where CLAUDE.md states a rule that is now enforced, add one line naming the
test or check that enforces it, the way the browser rule does. When a rule's
mistake can no longer happen, shorten the prose to that pointer. When the
maintainer corrects an agent for something CLAUDE.md already says and nothing
enforces, that is a repeat: enforce it in the same change.

## Reply

Each class, with its evidence (commits, threads, dates), the level you chose,
why a higher level did not work, and the red-then-green proof.

Adapted from pstack's `correct` skill,
https://github.com/cursor/plugins/tree/main/pstack (MIT).
