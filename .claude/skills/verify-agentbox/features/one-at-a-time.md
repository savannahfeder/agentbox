# One thing at a time

Every thread with an agent opens on this page. In Needs you it also shows the
place in the queue and the arrows, an answer moves them to the next, and the
last answer lands them on the empty inbox. A thread they have written to since
its answer is drawn from that message down, the agent's work under it.

## Sub-features

- `way-in` Enter or a click on a Needs you row, the board's Waiting column, search or an alert: any way a Needs you thread is opened.
- `page` the thread's name as the largest type on the page, said once (the bar keeps only the way back); a two-line Context under it, opened whole on a click; the place in the queue and two arrows beside the menu, which name J and K on hover; the newest answer under its bold first line; tight choices at the foot, apart from the reply box; the line saying where the last answer went in the bar's empty middle.
- `moves-on` a pick, a typed reply or E moves to the next thread, and the answer reaches that thread's agent.
- `walks` J and K, and the arrows, step through the queue without answering.
- `earlier` Show N earlier messages opens the whole conversation in place, the agent's steps included.
- `leaves` esc goes back to Needs you; the last answer lands on the empty inbox.
- `files` a page or a note the answer names is read in place under it, and folds to its name from its head (a page is framed only in the Mac app: the browser copy gives it no address).

## How to get to it (user POV)

- Open any thread on Needs you.
- A thread in In progress, Later or Done opens on the same page, without the place in the queue.

## Driving it with live.mjs

Preconditions: a clean `live.mjs doctor` on a fresh copy (`down`, then `up`), so Needs you holds only the drive's threads.

- **Run it.** `live.mjs drive one-at-a-time`. It files four threads, has the stand-in answer each with choices, then holds replies for two minutes so the queue can be emptied.
- **Checks.** Every sub-feature above but `files`, on the screen and in the ledger: the pick, the typed reply and the close are on their threads, and a pick starts the stand-in again.
- **Proof.** `01-needs-you.png` to `07-in-progress.png`, `report.json`.

## Gotchas

- The first E on a thread whose agent is waiting says so once and needs a second E (renderer/src/stopped-agent.ts). The drive presses it again when it sees the warning.
- A number pressed the moment the app moves you waits about a second (renderer/src/pick-settles.ts), so the drive waits before each pick.
