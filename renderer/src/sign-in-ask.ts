// WHEN THE WINDOW ASKS YOU TO SIGN IN. Every build that can sign in asks,
// whether or not Multiplayer is on. "Skip for now" puts the page away on this
// computer until a sign-in; the sidebar's Sign in row brings it back. The
// phone with the computer shut cannot skip: it has nothing to show without
// the account.
import type { TeamState } from './types';

export const SIGN_IN_SKIPPED = 'agentbox.sign-in-skipped';

type Team = Pick<TeamState, 'configured' | 'canSignIn' | 'started' | 'signedIn'> | null | undefined;

export function signInAsk({ team, fixtures, skipped, canSkip }: { team: Team; fixtures: boolean; skipped: boolean; canSkip: boolean }) {
  const out = !fixtures && !!team && (team.configured || !!team.canSignIn) && !team.signedIn;
  const held = out && !(canSkip && skipped);
  return {
    page: held && team!.started === true,
    // From the first frame, not only once the saved sign-in has been looked
    // for: the walk under the page holds presses (the-first-run-walk-waits-for-sign-in).
    walkWaits: held,
    sidebar: out && !held,
  };
}
