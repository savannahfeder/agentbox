# Contributing to Agentbox

Thank you for wanting to help. Pull requests are welcome, and every one is read
by a person before it is merged.

## Before you start

- **For anything bigger than a small fix, open an issue first.** A short note
  saying what you want to change and why saves you from building something we
  then cannot take.
- **One change per pull request.** A pull request that does one thing is
  reviewed in a day; one that does five waits until someone has an afternoon.

## Making the change

```
npm install
npm run dev          # the app, with hot reload
npm run test:changed # the tests for what you changed
```

- **Every change comes with tests.** Write the test first and watch it fail,
  then make it pass. Cover the case you fixed, the cases either side of it, and
  a case that must not match.
- **Tests are named as sentences** that say the behaviour
  (`a-reply-moves-the-agent-row.test.mjs`), and open with a comment saying what
  was wrong and how you know.
- **Run `npm run test:changed`** before you push. The full suite runs on GitHub
  for your pull request.
- **Read [CLAUDE.md](CLAUDE.md)**. It is short, and it holds the rules that are
  not obvious from the code: nothing an agent starts may drive the user's own
  browser (`--chrome`), no API key ever goes into a worker's environment, and
  nothing personal is committed.

## Using AI to write it

Fine, and expected: this is an app for running coding agents. But you are the
author. Read every line before you open the pull request, run it, and say in
the description what you checked by hand.

## What happens after you open one

1. GitHub runs the tests. For a first contribution GitHub waits for a
   maintainer to start that run, which happens once the change has been read.
2. The change is reviewed for safety first (what it sends, reads, runs or
   installs) and then for whether it fits the app.
3. You get one of three answers: merged, a request for specific changes, or a
   closed pull request with the reason. Small style fixes may be made on our
   side rather than asked of you.

## Licence

Agentbox is GPL-3.0-or-later. By opening a pull request you agree that your
contribution is licensed under the same terms.

## Security problems

Please do not open a public issue or pull request for a security problem. See
[SECURITY.md](SECURITY.md).
