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
