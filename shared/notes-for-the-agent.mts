// NOTES THE APP WRITES FOR THE NEXT RUN, NOT FOR THE PERSON: trouble it is
// already seeing to by itself. They stay on the row, so the next run is told
// why the last one stopped and the record keeps them, but no thread draws them
// (tests/trouble-the-app-handles-itself-is-not-drawn-on-the-thread). The
// writers build them from these words, so the reader cannot drift from them.

/** How the note on a run whose cloud machine stopped begins (main/cloud/run.mts `layCheckpoint`). */
export const MACHINE_STOPPED = "This thread's cloud machine stopped";

/** A ship or a push held until this computer has the memory for it. */
export const waitingForMemory = (before: 'shipping' | 'pushing'): string => `Waiting for memory on this computer before ${before}.`;

const CLEARED = ' is cleared. Carry on from where this stopped.';

/** What a thread that waited on a cause is told as it starts again. */
export const causeCleared = (title: string | undefined): string => `${title ?? 'The cause'}${CLEARED}`;

export function forTheAgent(note: string): boolean {
  return note.startsWith(MACHINE_STOPPED)
    || note === waitingForMemory('shipping') || note === waitingForMemory('pushing')
    || note.endsWith(CLEARED);
}
