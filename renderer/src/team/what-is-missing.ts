// WHICH FIELD THE SIGN-IN FORM IS STILL WAITING ON (w-aaedc8f711).
//
// A dimmed button is not an answer: it says no and never says why. The form
// takes the press, finds the first field it cannot do without, and names it.
export type Missing = { field: 'name' | 'email' | 'password'; say: string };

export function whatIsMissing({ mode, name, email, password }: {
  mode: 'sign-in' | 'sign-up'; name: string; email: string; password: string;
}): Missing | null {
  if (mode === 'sign-up' && !name.trim()) return { field: 'name', say: 'Enter your name.' };
  if (!email.trim()) return { field: 'email', say: 'Enter your email address.' };
  // A password is taken as typed, spaces and all, so it is never trimmed.
  if (!password) return { field: 'password', say: mode === 'sign-up' ? 'Choose a password.' : 'Enter your password.' };
  return null;
}
