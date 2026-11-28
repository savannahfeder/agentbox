// Rooms is on for anyone signed in and on a team (main/settings.mts
// alphaFeatures); main, the window and the phone all read that through this.

export interface TeamFacts { signedIn?: boolean | null; team?: unknown }

export function isOnTeam(state: TeamFacts | null | undefined): boolean {
  return !!state?.signedIn && !!state?.team;
}
