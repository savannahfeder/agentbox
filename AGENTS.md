# agentbox: agent working notes (Codex)

The founder works this repo through both Claude Code and Codex. Codex reads this
file; Claude Code reads `CLAUDE.md`.

**Read `CLAUDE.md` now, in full, before you touch anything.** It is the durable
law for this repo and all of it applies to you: the product's design law, the
store, billing, the arcade's saving, the privacy pages, process etiquette, and
"a fix that is not running is not a fix". This file does not repeat it, because
two copies of a rule become two different rules within a week.

The one rule that is repeated here, because it governs how you finish rather
than what you build, and because a session that misses it damages work that is
already shipped:

## EVERY CHANGE LANDS WITH TESTS, AND YOU RUN ALL OF THEM (the founder, 2026-08-27)

Not only for bug fixes, and not satisfied by one happy path.

- **Write the test first and watch it fail.** A test written after the fix has
  never been red, so nothing tells you it would go red again.
- **Cover the cases, not the case.** At minimum: the one she reported, the
  boundary either side of it, and the case that must NOT match. That last one
  is the one that gets skipped and the one that catches the next regression.
- **Name the file after the behaviour, in her words.** The tests here are
  sentences (`a-reply-moves-the-agent-row.test.mjs`), because the name is what
  a future session reads when it goes red at 2am.
- **Say why the test exists, at the top, with the measurement.** A test whose
  reason is not written down gets deleted by whoever next finds it
  inconvenient.
- **Run the WHOLE suite before you report anything: `npx vitest run`.** Not
  your file. Not breaking things later is the whole point, and it is the one
  part your own
  file cannot answer. About 25 seconds for ~250 files.
- **Report the real result.** A test you did not run is not passing. If
  something is red and you are leaving it red, say so and say why.

Where the behaviour is about a real store rather than a fixture, measure it
against a real store too, and put the number in the commit and on the card.
A number like "316 results, 5 of them real, at ranks 1, 11, 16, 28 and 236" is
a fact somebody can act on. "Search is better now" is not.

## Running things

- Node is nvm-only on this machine:
  `export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"`
- Tests: `npx vitest run`
- Typecheck the renderer: `npx tsc --noEmit -p renderer/tsconfig.json`
- Build the renderer: `npm run build`
- Never commit to `main`. Work on `agentbox/<work-item-id>[-slug]`, which is what
  the app's diff viewer picks up.
- **A one-off harness goes in `scripts/scratch/`, which is gitignored.** The
  script you write to boot the app, drive it and photograph it is scaffolding;
  the picture is the deliverable and it belongs in the product's documents. 226
  of these had been committed by 2026-09-23 and nothing referenced a single one
  of them. If one turns out to be worth keeping, move it up into `scripts/` on
  purpose and say why in the commit.
