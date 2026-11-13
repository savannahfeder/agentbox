// WHEN THE WINDOW ASKS YOU TO SIGN IN. Every build that can sign in asks,
// whether or not Multiplayer is on. "Skip for now" puts the page away on this
// computer until a sign-in; the sidebar's Sign in row brings it back. The
// phone with the computer shut cannot skip: it has nothing to show without
// the account.
import type { TeamState } from './types';

export const SIGN_IN_SKIPPED = 'agentbox.sign-in-skipped';

type Team = Pick<TeamState, 'configured' | 'canSignIn' | 'started' | 'signedIn'> | null | undefined;

/** A new install cannot skip making an account, so someone who skipped is most likely an older install without one. */
export const shareSignInStartsOn = ({ skipped }: { skipped: boolean }): 'sign-in' | 'sign-up' => (skipped ? 'sign-up' : 'sign-in');

export const signInWasSkipped = () => { try { return localStorage.getItem(SIGN_IN_SKIPPED) === '1'; } catch { return false; } };

/** `firstRun`: a new install's setup asks for sign-in at its invite step, so the page waits until after it. */
export function signInAsk({ team, fixtures, skipped, canSkip, firstRun = false }: { team: Team; fixtures: boolean; skipped: boolean; canSkip: boolean; firstRun?: boolean }) {
  const out = !fixtures && !!team && (team.configured || !!team.canSignIn) && !team.signedIn;
  const held = out && !(canSkip && (skipped || firstRun));
  return {
    page: held && team!.started === true,
    // From the first frame, not only once the saved sign-in has been looked
    // for: the walk under the page holds presses (the-first-run-walk-waits-for-sign-in).
    walkWaits: held,
    sidebar: out && !held,
  };
}
