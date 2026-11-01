// Only operations PowerUp actually dispatches. Paths and prose remain messages.
export const CODEX_COMPACT = Object.freeze({ name: 'compact', description: 'Free up context in this conversation', menuDescription: null, whole: true, argumentHint: null, aliases: [] });
export function codexCommand(text) {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  if (!/^\/compact(?:\s|$)/i.test(value)) return null;
  return { name: 'compact', valid: /^\/compact$/i.test(value) };
}
export const COMPACTION_COPY = Object.freeze({
  running: 'Compacting this conversation…',
  done: 'Conversation compacted. You can continue this task.',
  failed: 'Couldn’t compact this conversation. Try again.',
  busy: 'Wait for the current response to finish and pause any active goal, then run /compact.',
  unavailable: 'Compaction isn’t available with this Codex version.',
  missing: 'This task doesn’t have a Codex conversation to compact yet.',
  invalid: 'Run /compact on its own. Your draft has been kept.',
});
