// A SHIP WHOSE PUSH NEEDS A GITHUB SIGN-IN ON THIS COMPUTER.
//
// The push runs here, not on the thread's machine, so its agent cannot fix a
// missing sign-in. The app asks for one on the thread instead
// (renderer/src/components/GitHubSignInCard.tsx) and ships again once it is
// saved (main/github-push-sign-in.mts).
import { Name } from './product-name.mjs';

export const NOT_PUSHED: string = 'It did not ship because ';
export const NO_GITHUB_SIGN_IN: string = 'this computer could not sign in to GitHub';
export const GITHUB_REFUSED_SIGN_IN: string = 'GitHub refused the sign-in saved on this computer';
export const SHIPPING_AGAIN: string = 'Signed in to GitHub. Shipping it again.';

// A classic token with the one box a push needs already ticked.
export const GITHUB_TOKEN_PAGE: string = `https://github.com/settings/tokens/new?scopes=repo&description=${encodeURIComponent(Name)}`;

// Git's own words, at the start of a line, so a test run that quotes them in a diff does not count.
const SAYS_SO: RegExp[] = [
  /^fatal: could not read (Username|Password) for 'https:\/\/([^@/']+@)?github\.com/i,
  /^fatal: Authentication failed for 'https:\/\/([^@/']+@)?github\.com\//i,
  /^remote: Invalid username or (password|token)/i,
  /^remote: Support for password authentication was removed/i,
  /^remote: Permission to \S+ denied to /i,
  /^(ERROR: )?(git@github\.com: )?Permission denied \(publickey\)/,
];

/** Whether a ship's output says git here could not sign in to GitHub. */
export function pushNeedsGitHubSignIn(output: unknown): boolean {
  return String(output ?? '').split('\n').some((line) => SAYS_SO.some((re) => re.test(line.trim())));
}

/** Whether a not-shipped reason is one a GitHub sign-in answers. */
export const asksForGitHubSignIn = (why: unknown): boolean => why === NO_GITHUB_SIGN_IN || why === GITHUB_REFUSED_SIGN_IN;

/** The note the thread shows. */
export const notPushedNote = (refused: boolean): string => `${NOT_PUSHED}${refused ? GITHUB_REFUSED_SIGN_IN : NO_GITHUB_SIGN_IN}.`;
