import type { Missing } from './what-is-missing';

/** Creating an account in the setup: Google or email, then your name, then email and password together. */
export const SIGN_UP_PARTS = ['start', 'name', 'login'] as const;
export type SignUpPart = typeof SIGN_UP_PARTS[number];

/** The part one step on or back, or null past either end. */
export function nextSignUpPart(at: SignUpPart, by: 1 | -1): SignUpPart | null {
  return SIGN_UP_PARTS[SIGN_UP_PARTS.indexOf(at) + by] ?? null;
}

type Fields = { name: string; email: string; password: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The cloud's own floor (cloud/supabase/config.toml, minimum_password_length). */
const PASSWORD_MIN = 6;

/** The field on this part that is not ready yet, and what to say about it. */
export function partMissing(part: SignUpPart, { name, email, password }: Fields): Missing | null {
  if (part === 'name' && !name.trim()) return { field: 'name', say: 'Enter your name.' };
  if (part !== 'login') return null;
  if (!email.trim()) return { field: 'email', say: 'Enter your email address.' };
  if (!EMAIL.test(email.trim())) return { field: 'email', say: 'Enter a full email address.' };
  if (password.length < PASSWORD_MIN) return { field: 'password', say: `Use a password of at least ${PASSWORD_MIN} characters.` };
  return null;
}

export const partReady = (part: SignUpPart, fields: Fields): boolean => !partMissing(part, fields);
