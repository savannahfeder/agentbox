// THE SIGN-IN PAGE, AND WHAT SIGNING OUT LANDS ON (2026-10-01).
//
// A team version people can actually use needs a real sign-in page and a real
// sign-out page. Signing in used to
// be one Google button inside the Team page, and signing out left the whole
// app standing with nobody in it. Now a team build with nobody signed in shows
// this page over the whole window: Google first, then email and password, and
// a way to make an account. Signing out lands here too, saying so.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Name } from '../../../shared/product-name.mjs';
import { AppMark } from '../components/AppMark';
import './sign-in.css';

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

type Mode = 'sign-in' | 'sign-up' | 'check-email';

// WAITING ON THE BROWSER IS A PAGE OF ITS OWN (2026-10-04). The first teammate
// to install this clicked Continue with Google and saw nothing happen: the
// sign-in had opened in a browser window she could not see, and this page then
// offered a disabled button for five minutes. Now it says where the sign-in
// went, and gives the link back, a copy of it and a way out.
export function SignInPage({ signedOut = false, error: startError = null, waitingUrl = null }: { signedOut?: boolean; error?: string | null; waitingUrl?: string | null }) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => { first.current?.focus(); }, [mode]);

  const [copied, setCopied] = useState(false);
  const google = async () => {
    setBusy('google'); setError(null); setCopied(false);
    const out = await api.teamSignIn();
    setBusy(null);
    if (!out.ok && !/cancelled/i.test(out.error ?? '')) setError(out.error ?? 'Google sign-in did not finish.');
  };
  // A reload while the browser is out still finds the sign-in waiting.
  const waiting = busy === 'google' || !!waitingUrl;
  const copy = async () => {
    if (!waitingUrl) return;
    try { await navigator.clipboard.writeText(waitingUrl); setCopied(true); setError(null); } catch { setError('Could not copy the link.'); }
  };

  if (waiting) {
    return (
      <div className="si-page" role="dialog" aria-modal="true" aria-label="Finish signing in in your browser">
        <div className="si-card">
          <span className="si-mark"><AppMark size={40} /></span>
          <h1>Finish in your browser</h1>
          <p className="si-lede">
            {waitingUrl
              ? `Google sign-in is open in your default browser. Pick your account there and ${Name} carries on by itself.`
              : 'Opening Google sign-in in your browser…'}
          </p>
          <button type="button" className="si-google" disabled={!waitingUrl} onClick={() => { setError(null); void api.teamSignInReopen(); }}>
            <GoogleMark />Open the sign-in page again
          </button>
          <div className="si-wait-row">
            <button type="button" disabled={!waitingUrl} onClick={copy}>{copied ? 'Link copied' : 'Copy the link'}</button>
            <button type="button" onClick={() => { void api.teamSignInCancel(); setBusy(null); setError(null); }}>Cancel</button>
          </div>
          {error && <p className="si-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy('email'); setError(null);
    const out = mode === 'sign-up'
      ? await api.teamSignUp(name, email, password)
      : await api.teamSignInEmail(email, password);
    setBusy(null);
    if (!out.ok) { setError(out.error ?? 'That did not work. Try again.'); return; }
    if (out.confirm) setMode('check-email');
  };

  const heading = mode === 'sign-up' ? 'Create your account'
    : mode === 'check-email' ? 'Check your email'
      : signedOut ? 'You are signed out' : `Sign in to ${Name}`;
  const lede = mode === 'sign-up' ? 'Your teammates will see this name beside your threads and messages.'
    : mode === 'check-email' ? `We sent a link to ${email}. Follow it to confirm your address, then sign in here.`
      : signedOut ? 'Sign in again to get back to your inbox and your team.'
        : 'Your threads, your agents and your team, in one inbox.';
  const canSubmit = !!email.trim() && !!password && (mode !== 'sign-up' || !!name.trim());

  return (
    <div className="si-page" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="si-card">
        <span className="si-mark"><AppMark size={40} /></span>
        <h1>{heading}</h1>
        <p className="si-lede">{lede}</p>

        {mode === 'check-email' ? (
          <button type="button" className="si-primary" onClick={() => { setMode('sign-in'); setPassword(''); }}>Back to sign in</button>
        ) : (
          <>
            <button type="button" className="si-google" disabled={!!busy} onClick={google}>
              <GoogleMark />Continue with Google
            </button>
            <div className="si-or"><span>or</span></div>
            <form className="si-form" onSubmit={submit}>
              {mode === 'sign-up' && (
                <label><span>Name</span>
                  <input ref={first} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <label><span>Email</span>
                <input ref={mode === 'sign-in' ? first : undefined} type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label><span>Password</span>
                <input type="password" value={password} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button type="submit" className="si-primary" disabled={!canSubmit || !!busy}>
                {busy === 'email' ? (mode === 'sign-up' ? 'Creating…' : 'Signing in…') : mode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </>
        )}

        {(error || (startError && mode === 'sign-in' && !signedOut)) && <p className="si-error" role="alert">{error || startError}</p>}

        {mode !== 'check-email' && (
          <p className="si-switch">
            {mode === 'sign-in'
              ? <>New here? <button type="button" onClick={() => { setMode('sign-up'); setError(null); }}>Create an account</button></>
              : <>Have an account? <button type="button" onClick={() => { setMode('sign-in'); setError(null); }}>Sign in</button></>}
          </p>
        )}
      </div>
    </div>
  );
}
