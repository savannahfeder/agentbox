// The cloud's words, said the way the sign-in page says everything else.
// Its own file so the listener can use it without importing the session,
// which imports the listener.

export function plainAuthError(message) {
  const m = String(message ?? '');
  if (/invalid login credentials/i.test(m)) return 'That email and password do not match an account.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: follow the link we sent, then sign in.';
  if (/already registered|already been registered/i.test(m)) return 'There is already an account with that email. Sign in instead.';
  if (/password should be at least/i.test(m)) return 'Use a password of at least 6 characters.';
  if (/should be different from the old password|same_password/i.test(m)) return 'Choose a password different from the one you had.';
  if (/rate limit|only request this after/i.test(m)) return 'Too many tries just now. Wait a minute and try again.';
  if (/auth session missing/i.test(m)) return 'That reset did not finish. Ask for the email again.';
  return m || 'That did not work. Try again.';
}
