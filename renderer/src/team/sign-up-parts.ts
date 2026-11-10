/** Creating an account in the setup, one thing at a time. */
export const SIGN_UP_PARTS = ['start', 'name', 'email', 'password'] as const;
export type SignUpPart = typeof SIGN_UP_PARTS[number];

/** The part one step on or back, or null past either end. */
export function nextSignUpPart(at: SignUpPart, by: 1 | -1): SignUpPart | null {
  return SIGN_UP_PARTS[SIGN_UP_PARTS.indexOf(at) + by] ?? null;
}
