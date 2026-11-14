// What the sign-in and reset screens say when an email will not do.

// Loose on purpose: the cloud is the judge, this only catches what is plainly not an address.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NO_EMAIL = 'Enter your email address.';
export const BAD_EMAIL = 'Enter a valid email address.';

/** Why a reset link cannot be asked for yet, or null when it can. */
export function resetEmailProblem(email: string): string | null {
  const e = email.trim();
  if (!e) return NO_EMAIL;
  return LOOKS_LIKE_EMAIL.test(e) ? null : BAD_EMAIL;
}

/** The cloud's refusal in plain words where we know a plainer one. */
export function plainAuthError(message: string): string {
  if (/validate email address|invalid format/i.test(message)) return BAD_EMAIL;
  return message;
}
