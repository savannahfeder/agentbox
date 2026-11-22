// A CHAT BROUGHT IN THAT YOU CARRY ON WHERE IT STARTED (main/chat-follow.mts).
//
// While its agent works on what you typed there, the row is claimed under one
// of these names. The claim is what puts it in In progress, reading "Working"
// outside this window, and its lease is what brings it back to Needs you if the
// app stops watching. The thread draws the claim as your reply there.
export const HELD_IN = { claude: 'outside:claude-code', codex: 'outside:codex' } as const;

const WHERE: Record<string, string> = { [HELD_IN.claude]: 'Claude Code', [HELD_IN.codex]: 'Codex' };

/** "Claude Code" or "Codex" for a claim the follow holds, null for any other. */
export function carriedOnIn(holder: unknown): string | null {
  return WHERE[String(holder ?? '')] ?? null;
}

// `carriedOn` is the phone's copy of the same fact: its rows carry no claim
// (shared/phone-snapshot.mts).
interface Held { claim?: { holder?: string | null } | null; claimExpired?: boolean; carriedOn?: unknown }

export function heldOutside(item: Held | null | undefined): boolean {
  if (typeof item?.carriedOn === 'string' && item.carriedOn) return true;
  return !!item?.claim && !item.claimExpired && carriedOnIn(item.claim.holder) !== null;
}

/** An agent stopped on its own window, whose question is nowhere else: Claude
 *  Code writes nothing to the chat while one is open. `waitingFor` is its
 *  session file's word, and `folder` the one it is open in. */
const STOPPED = '**Claude Code stopped to ';
const inItsWindow = (folder?: string | null) => (folder ? `in the terminal open in ${folder}` : 'there');
export function stoppedThere(waitingFor: string, folder?: string | null, { replyWaits = false } = {}): string {
  const why = waitingFor === 'permission prompt' ? 'ask for your OK' : 'ask you a question';
  return `${STOPPED}${why}. Answer it ${inItsWindow(folder)}${replyWaits ? ', and it gets your reply next' : ''}.**`;
}
export const saysItStopped = (text: unknown): boolean => String(text ?? '').startsWith(STOPPED);
/** Any of the lines the follow writes where an answer would be: your move, not an answer. */
export const followsWord = (text: unknown): boolean => [STOPPED, CUT_THERE, CLOSED_THERE, HELD].some((l) => String(text ?? '').startsWith(l));
/** What its agent had said before it stopped, '' for nothing. */
export const saidBeforeTheStop = (text: string): string => text.split('\n\n').slice(1).join('\n\n');
/** You stopped it there: Esc, on a question or in the middle of its work. */
export const CUT_THERE = '**You stopped Claude Code there.**';
/** Its window went before its agent answered. */
export const CLOSED_THERE = '**Claude Code closed before it answered.**';
/** It keeps a reply from here until you allow it in its own window. */
const HELD = '**Claude Code is holding your reply.';
export const heldThere = (folder?: string | null): string => `${HELD} Allow it ${inItsWindow(folder)}.**`;
