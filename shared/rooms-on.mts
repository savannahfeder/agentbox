// Whether Rooms is on: the one rule main, the window and the phone all read.
// A person on a team with Multiplayer on gets it unless they turned it off;
// anyone else only if they turned it on, so the single-person app stays as it was.

export interface TeamFacts { signedIn?: boolean | null; team?: unknown }

export function isOnTeam(state: TeamFacts | null | undefined): boolean {
  return !!state?.signedIn && !!state?.team;
}

export function roomsOn({ saved, onTeam }: { saved: unknown; onTeam: boolean }): boolean {
  return saved === true || (saved !== false && onTeam);
}

// Multiplayer off keeps the team out of the window, so Rooms must not publish
// this person's presence to it either, unless they turned Rooms on themselves.
export function roomsOnFor(config: { alphaRooms?: unknown; alphaMultiplayer?: unknown } | null | undefined, onTeam: boolean): boolean {
  return roomsOn({ saved: config?.alphaRooms, onTeam: onTeam && config?.alphaMultiplayer !== false });
}
