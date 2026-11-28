// NOTES THE APP WRITES FOR THE NEXT RUN, NOT FOR THE PERSON: trouble it is
// already seeing to by itself. They stay on the row, so the next run is told
// why the last one stopped and the record keeps them, but no thread draws them
// (tests/trouble-the-app-handles-itself-is-not-drawn-on-the-thread). The
// writers build them from these words, so the reader cannot drift from them.
import { KEPT_ASIDE } from './not-shipped.mts';

/** How the note on a run whose cloud machine stopped begins (main/cloud/run.mts `layCheckpoint`). */
export const MACHINE_STOPPED = "This thread's cloud machine stopped";

/** A ship or a push held until this computer has the memory for it. */
export const waitingForMemory = (before: 'shipping' | 'pushing'): string => `Waiting for memory on this computer before ${before}.`;

const CLEARED = ' is cleared. Carry on from where this stopped.';

/** What a thread that waited on a cause is told as it starts again. */
export const causeCleared = (title: string | undefined): string => `${title ?? 'The cause'}${CLEARED}`;

/** How a cloud run set aside on its own branch (main/cloud/run.mts `park`) asks the person for a reply. */
export const ASKS_FOR_A_REPLY = 'Reply to have the agent bring the two together; it will not ship until then.';
const BRINGING = 'Its agent is bringing the two together, and it ships after that.';

/** The same news once the app has handed the branch to the agent itself. */
export const bringingItTogether = (asked: string): string => asked.replace(ASKS_FOR_A_REPLY, BRINGING);

/** What that agent is told as it starts again. */
export const bringItTogether = (branch: string): string =>
  `Your last cloud run came home after this task folder had changed on this computer, so its work was put on the branch ${branch} and is not in the folder yet. Bring that branch together with this folder, keeping the work on both sides, run the tests for what changed, and ship as usual.`;

export function forTheAgent(note: string): boolean {
  return note.startsWith(MACHINE_STOPPED)
    || note === waitingForMemory('shipping') || note === waitingForMemory('pushing')
    || note.endsWith(CLEARED)
    || (note.startsWith(KEPT_ASIDE) && note.endsWith(BRINGING));
}
