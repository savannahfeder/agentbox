# A new thread

The core loop: the person types what they need, sends it, and an agent picks
it up in a folder of its own, works, and its answer appears in the thread.

## Sub-features

- `compose` N opens the composer with the cursor in "What do you need done?".
- `send` ⌘↵ files the thread; it appears in In progress with its project.
- `worker` a worker starts on it in its own worktree, told which thread it is on, with no API key.
- `answer` the worker's closing message is written onto the thread and shows when it is opened.
- `opened-by` the thread's history says the person opened it, signed in or not.

## How to get to it (user POV)

- Press N anywhere in the inbox.
- The New thread button in the header, or in the empty state.

## Driving it with live.mjs

Preconditions: `live.mjs up` and a clean `live.mjs doctor`.

- **Compose and send.** Run `live.mjs drive new-thread`. N focuses the composer textarea; the typed title appears in the list after ⌘↵.
- **Stored.** The ledger under `<store>/projects/<…>-sandbox/work-items.jsonl` holds a row with that title.
- **Worker.** The stand-in's receipt `<instance>/receipts/<id>.json` exists, its `cwd` is `repos/sandbox/.claude/worktrees/<id>`, `ZERO_ITEM` is the id, and no `ANTHROPIC_`/`OPENAI_` variable is in its environment.
- **Answer.** The row's `result` is the stand-in's line ("The verify stand-in ran and answered."), and clicking the row shows it under RESULT.
- **Real Claude.** With `up --real-claude`, the title asks for one word (PINEAPPLE) and the answer is Claude Code's; allow up to 5 minutes.
- **Proof.** `01-composer.png`, `02-sent.png`, `03-thread.png`, `report.json`.

## Gotchas

- The stand-in must speak Claude Code's streamed-input protocol (replay the prompt, then wait for its input to close). If it does not, every run reads as unfinished and no answer is written; `tests/the-stand-in-worker-speaks-claude-codes-input-protocol.test.mts` guards it.
- The thread's status stays open after the answer: on an install with the store tools, the worker owns its status and the stand-in never sets it. The answer is the claim, not the status.
- The ledger is in the store's `projects/` folder, not beside `project.json`.
