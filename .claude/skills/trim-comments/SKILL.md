---
name: trim-comments
description: Cut the comments in a change down to the ones that earn their place. A comment stays only when it says why the code is the way it is and the code cannot say it. The story of how a bug was found goes in the commit message and the test, not above the function. Use on your own diff before you commit, when a change reads as over-commented, or when asked to trim comments, cut comments or unslop code.
---

# Trim comments

On 2026-10-15 this repository was 43% comment lines: `main/` 43%, `shared/`
48%, `renderer/src/` 37%. Most of them are incident reports: what broke, on
which day, how many hours it cost, who said what. Each was written for a
good reason. Together they cost every later reader, person or agent, three
paragraphs to find the one sentence that changes what they do next.

The thesis, from pstack's `no-comments`: a comment is a sign the code did not
say something. First try to make the code say it. Keep a comment only for
what the code cannot say. We stop short of zero comments, because some of
what this app depends on (Electron, macOS, Claude Code's and Codex's CLIs,
git) behaves in ways no name can explain.

## Where the story goes instead

- **The commit message.** What broke, when, and the number that proved it.
  `git blame` finds it from the line.
- **The test's opening comment.** This repository already requires one on
  every test file: what broke and how it was measured. The test is what keeps
  the rule true, so the explanation belongs beside it.
- **CLAUDE.md**, only for a rule every agent has to know before it opens the
  file.

## Scope

By default, only the comments your change adds or edits: `git diff main...HEAD`
plus the working tree. Do not sweep code you were not asked to touch. Many
agents edit this repository at once, and a comment sweep across a whole file
is a merge conflict for each of them. Trim a whole file only when someone asks,
one file per commit, with no behaviour change in that commit.

## Keep

- **A why the code cannot say**, especially a fact about something we do not
  control: "the CLI traps SIGTERM and exits 143 itself, so Node reports no
  signal". One or two sentences.
- **An ordering or timing need** that no rename or restructure can make
  obvious.
- **A pointer to the test that guards a rule**:
  "pinned by tests/no-worker-drives-her-own-browser.test.mjs".
- **The opening comment of a test file.** Required here.
- License headers, lint suppressions that give their reason, and doc comments
  on an exported function whose contract is not clear from its name and types.

## Cut

- A comment that says what the next line does.
- Dated history: dates, durations, counts, item ids, quotes. Keep the one
  sentence of why; the rest belongs in the commit message.
- Commented-out code.
- Banners and section dividers.
- Anything CLAUDE.md already says.
- A warning about our own code, like "call X before Y" or "do not remove".
  That is a design problem written down as prose. See Encode.

## Encode

When a comment says "must", "never" or "do not", try to make breaking the rule
fail loudly instead, cheapest first:

1. A clearer name, or an order that makes the wrong call impossible.
2. A runtime check that throws with a message naming the fix.
3. A test that goes red when the rule is broken.

Once the rule is enforced, the comment shrinks to a pointer to the check, or
goes. If enforcing it would take work outside your task, leave a one-line
comment and name the rule in your answer, so someone can decide.

## Steps

1. List every comment in scope with a verdict: keep, shorten, cut or encode.
2. Before you keep a "do not" comment about our own code, read the code it
   guards. If the claim is no longer true, cut it.
3. Make the edits. Comments only, unless you are encoding a rule.
4. Run `npm run test:changed`. Some tests here read source files as text. If
   one goes red because a comment's words went, the test is pinning prose:
   say so in your answer rather than quietly putting the comment back.
5. Report how many comments you cut, shortened and encoded, each keep with
   a one-line reason, and any rule you could not enforce.

Adapted from pstack's `no-comments` skill and its Comment Sicko reviewer,
https://github.com/cursor/plugins/tree/main/pstack (MIT).
