// A teammate's thread carried on in a thread of your own: the comment that
// tells its owner, and the label that links the new thread back.

// Sent as an ordinary comment, so a copy that predates this still reads a
// sentence; a copy that knows it draws a quiet line and leaves Needs you alone.
export const CONTINUED_NOTE = 'Continued this in a thread of my own.';
export const isContinuedNote = (text) => text === CONTINUED_NOTE;

const PREFIX = 'continued-from:';
export const continuedFromLabel = (personId, threadId) => `${PREFIX}${personId}:${threadId}`;

/** The owner and thread a thread was continued from, or null. */
export function continuedFrom(labels) {
  const label = (Array.isArray(labels) ? labels : []).find((l) => typeof l === 'string' && l.startsWith(PREFIX));
  const m = label ? /^([\w-]{1,80}):([\w-]{1,80})$/.exec(label.slice(PREFIX.length)) : null;
  return m ? { personId: m[1], threadId: m[2] } : null;
}
