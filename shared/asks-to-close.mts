// Whether a person's reply asks for its thread to be closed. The close has to
// open a clause or follow and/then/please/can you, so "don't close this task"
// and "why did you close this thread" are not asks.
const ASKS_TO_CLOSE = /(?:^|\b(?:and|then|please|just|can you|could you|you can)\s+)close (?:this|the) (?:task|thread)(?:\s+(?:please|now))?$/i;

export function asksToClose(answer: string | null | undefined): boolean {
  if (!answer) return false;
  const words = answer.replace(/^option \d+:\s*/i, '').replace(/\s*\(recommended\)\s*/i, '');
  return words.split(/[,;.!?\n]+/).some((clause) => ASKS_TO_CLOSE.test(clause.trim()));
}
