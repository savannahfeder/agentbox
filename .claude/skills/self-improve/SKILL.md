---
name: self-improve
description: Look back at the last day of the person's real threads, in every project, find where Agentbox itself made them go wrong (a run that never started or was cut off, lost or parked work, a ship that bounced, a brief or tool that misled the agent, a mistake the person had to correct), and fix the worst few in this repository, tested and shipped by the project's own rules. Use when asked to self-improve, to look at my threads and fix what went wrong, for a look back, or by the repeating task that runs it every day.
---

# Self-improve

Agentbox improves from the person's own threads. Once a day this run reads
what happened in every thread since the last run, finds where the app, its
briefs, its tools or its skills let the person down, and fixes the worst of
it. `product-loop` does the same with synthetic testers; this one learns from
real use.

It fixes Agentbox, never the threads' own work. A thread still stuck now is
named in the answer so the person can act on it. Do not write on it: a note on
another agent's thread starts a turn there.

## 1. Read the day

On the person's computer, where the store is:

```sh
node .claude/skills/self-improve/scripts/look-back.mjs --hours 24 --out <designs>/look-back.md
```

`<designs>` is this thread's designs folder in the product's docs. Use
`--hours 72` after a weekend or a missed run. The file lists every thread
touched in the window, across every project, with the marked ones first:

| mark | means |
|---|---|
| pushback | the person replied with "still", "again", "didn't", "wrong", "why did" and the like |
| reopened | a closed thread came back |
| app-trouble | the app said a run never started, was cut off, was held, did not ship, or its work was parked |
| failed-run | a run exited failed |
| unanswered | the person's reply waited over 2 hours with no answer and no agent on it |
| long | the person replied 4 or more times |

Each marked thread has its words in order (person, agent, app) and the folder
of its run logs. The marks are where to look, not verdicts.

On the Agentbox cloud there is no store on disk. Call `list_work_items` with
`includeDone: true`; its answer is saved to a file when it is large (write it
to one yourself when it is not), and pass that with `--from <file>`. Each
thread then has only its ask and its latest reply, note and result, and no
run logs, so say in the answer that the look was thinner.

## 2. Check what earlier runs did

The earlier runs of this repeating task are threads with the same `repeat:`
label as this one: `list_work_items` with that label and `includeDone`. Read
their answers, and `git log --since=8.days --grep=self-improve`. Do not redo
a fix. A problem an earlier run fixed that is back means the fix did not hold:
say so and fix it properly.

## 3. Find what Agentbox got wrong

For each marked thread, read its story and open the newest run log. Ask one
question: would a better Agentbox have avoided this? It counts when:

- the app broke: a run never started, was cut off, hung, lost or parked work,
  bounced a ship on its own machinery, or showed the wrong thing;
- the brief, a store tool's description or a skill told the agent something
  wrong or left out what it needed (`briefs/`, `mcp/tools.mts`,
  `.claude/skills/`);
- the agent broke a rule the person or CLAUDE.md had already given, so the
  rule needs a check that fails, not more words (the `correct` skill);
- the person had to say "try again", "continue" or "didn't hear back" to get
  a thread moving.

It does not count when the person changed their mind, gave notes on a design,
the task was simply hard, or an outside service was down and the app said so.

Group what counts into classes: one cause, however many threads. Score each
1 to 10 for how often it happens and how bad it is, as `handoff` does. Lost
work and a thread that silently stops are the worst there are.

## 4. Fix the worst three

At most three classes a run, highest score first, so one run cannot sprawl.
Each fix is one commit on this run's branch, with `self-improve` in its
message, and follows CLAUDE.md: the test first, watched red, named as a
sentence, then the fix, then `npm run test:changed`, `trim-comments`,
`unslop`, and `blast-radius` for anything under `main/`, `shared/` or the
store.

THE REPOSITORY IS PUBLIC. Nothing from a thread goes into a test, a fixture,
a comment or a commit message beyond a thread id: no quotes, names, paths,
pasted messages or screenshots. Rebuild the case with made-up words.

The tray's look is approved and not this run's to change
(`tests/the-trays-approved-look-stays-as-approved`).

## 5. Ship by the project's rules

The project's instructions sort every change into four kinds. A fix nobody
sees, or one that reaches a lot without changing the screen, ships once its
tests pass: add `ship` to this thread's labels, keeping the others. A change
the person can see, or a big one, does not ship from here: bring it with
screenshots, checked against the `design-taste` skill. A class too big for one
run is filed under this thread (`parent`) with what you found.

## 6. Answer

Nothing counted: finish clean, as the repeating task's protocol says.

Otherwise line one says what was fixed or what needs them. Then, for each
class, in a sentence or two: what went wrong and in which threads (ids), what
changed, what tested it, and whether it shipped. Then the threads still stuck
right now, by id, with what each is waiting on.
