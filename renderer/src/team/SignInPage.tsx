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
import { onCloudPhone } from '../phone-screen';
import { agreedHere, rememberAgreed } from './cloud-agreed';
import './sign-in.css';

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

type Mode = 'sign-in' | 'sign-up' | 'check-email' | 'agree';

// WAITING ON THE BROWSER IS A PAGE OF ITS OWN (2026-10-04). The first teammate
// to install this clicked Continue with Google and saw nothing happen: the
// sign-in had opened in a browser window she could not see, and this page then
// offered a disabled button for five minutes. Now it says where the sign-in
// went, and gives the link back, a copy of it and a way out.
// AND IT SIGNS IN TO AGENTBOX CLOUD (2026-10-20, w-6633e825a7). The owner
// turned down new screens for the cloud: "We already have a sign-in page
// built that's pretty darn decent." With purpose cloud the same page signs in
// through main/cloud/account.mjs, says one line about the terms, and can be
// left: the cloud is something chosen, not a gate over the app. With purpose
// phone it is the team sign-in, opened from Settings › Phone and closable the
// same way, for a build whose team version is off.
// SIGN IN AND CREATE ACCOUNT ARE TABS, AND ONLY CREATE ACCOUNT AGREES
// (w-2c627fdea8, 2026-10-23). The terms line names the two buttons it covers,
// at reading size, under the button pressed, which is what courts ask of a
// line like this. A Google sign-in on the Sign in tab can still be someone
// new; the cloud server then says so and the card asks once, here.
const TERMS_URL = 'https://agentbox.ac/terms';
const PRIVACY_URL = 'https://agentbox.ac/privacy';
const TermsLinks = () => <>the <a href={TERMS_URL} onClick={(e) => { e.preventDefault(); window.open(TERMS_URL, '_blank'); }}>Terms</a> and the <a href={PRIVACY_URL} onClick={(e) => { e.preventDefault(); window.open(PRIVACY_URL, '_blank'); }}>Privacy policy</a></>;

export function SignInPage({ onSkip, signedOut = false, error: startError = null, waitingUrl = null, purpose = 'team', startOn = 'sign-in', onClose, onSignedIn }: {
  onSkip?: () => void; signedOut?: boolean; error?: string | null; waitingUrl?: string | null;
  purpose?: 'team' | 'cloud' | 'phone'; startOn?: 'sign-in' | 'sign-up'; onClose?: () => void; onSignedIn?: () => void;
}) {
  const cloud = purpose === 'cloud';
  const closable = cloud || purpose === 'phone';
  const [mode, setMode] = useState<Mode>(startOn);
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
    const out = cloud ? await api.cloudAccountSignIn({ method: 'google', acceptTerms: mode === 'sign-up' }) : await api.teamSignIn();
    setBusy(null);
    if (out.ok) { if (closable) onSignedIn?.(); return; }
    if ('needsTerms' in out && out.needsTerms) { setMode('agree'); return; }
    if (!/cancelled/i.test(out.error ?? '')) setError(out.error ?? 'Google sign-in did not finish.');
  };
  const agree = async () => {
    setBusy('email'); setError(null);
    const out = await api.cloudAccountSignIn({ method: 'agree' });
    setBusy(null);
    if (out.ok) { onSignedIn?.(); return; }
    setError(out.error ?? 'That did not work. Try again.');
  };
  useEffect(() => {
    if (!closable || !onClose) return undefined;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [closable, onClose, busy]);
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
          <button type="button" className="si-google" disabled={!waitingUrl && !cloud} onClick={() => { setError(null); void (cloud ? api.cloudAccountReopen() : api.teamSignInReopen()); }}>
            <GoogleMark />Open the sign-in page again
          </button>
          <div className="si-wait-row">
            {!cloud && <button type="button" disabled={!waitingUrl} onClick={copy}>{copied ? 'Link copied' : 'Copy the link'}</button>}
            <button type="button" onClick={() => { void (cloud ? api.cloudAccountCancel() : api.teamSignInCancel()); setBusy(null); setError(null); }}>Cancel</button>
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
    const out = cloud
      ? await api.cloudAccountSignIn(mode === 'sign-up' ? { method: 'sign-up', name, email, password } : { method: 'email', email, password, acceptTerms: agreedHere(email) })
      : mode === 'sign-up'
        ? await api.teamSignUp(name, email, password)
        : await api.teamSignInEmail(email, password);
    setBusy(null);
    if (cloud && 'needsTerms' in out && out.needsTerms) { setMode('agree'); return; }
    if (!out.ok) { setError(out.error ?? 'That did not work. Try again.'); return; }
    if (out.confirm) { if (cloud) rememberAgreed(email); setMode('check-email'); return; }
    if (closable) onSignedIn?.();
  };

  const heading = mode === 'sign-up' ? 'Create your account'
    : mode === 'check-email' ? 'Check your email'
      : mode === 'agree' ? 'Agree to the terms'
      : signedOut ? 'You are signed out' : `Sign in to ${Name}`;
  const lede = mode === 'check-email' ? `We sent a link to ${email}. Follow it to confirm your address, then sign in here.`
    : cloud ? 'Then your agents run in the cloud.'
      : purpose === 'phone' ? 'Then your phone can read and reply to your threads, even with this computer closed.'
      : mode === 'sign-up' ? 'Your teammates will see this name beside your threads and messages.'
      : signedOut ? 'Sign in again to get back to your inbox and your team.'
        // On the phone with the Mac shut: what signing in here gets her.
        : onCloudPhone() ? 'Use the account your computer is signed in with. Your threads are here even when it is closed.'
        : 'Your threads, your agents and your team, in one inbox.';
  // A name is what tells creating an account from signing in, at a glance.
  const canSubmit = !!email.trim() && !!password && (mode !== 'sign-up' || !!name.trim());

  return (
    <div className="si-page" role="dialog" aria-modal="true" aria-label={heading}>
      {/* No key on purpose: a stray Escape would skip it without anyone meaning to. */}
      {onSkip && <button type="button" className="si-skip-corner" onClick={onSkip}>Skip for now</button>}
      <div className="si-card">
        <span className="si-mark"><AppMark size={40} /></span>
        <h1>{heading}</h1>
        <p className="si-lede">{mode === 'agree' ? <>You&rsquo;re new to {Name} Cloud. Read <TermsLinks />, then agree to finish.</> : lede}</p>

        {(mode === 'sign-in' || mode === 'sign-up') && (
          <div className="si-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'on' : ''} onClick={() => { setMode('sign-in'); setError(null); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'on' : ''} onClick={() => { setMode('sign-up'); setError(null); }}>Create account</button>
          </div>
        )}

        {mode === 'check-email' ? (
          <button type="button" className="si-primary" onClick={() => { setMode('sign-in'); setPassword(''); }}>Back to sign in</button>
        ) : mode === 'agree' ? (
          <>
            <button type="button" className="si-primary" disabled={!!busy} onClick={() => void agree()}>{busy ? 'Finishing…' : 'Agree and continue'}</button>
            <p className="si-switch si-center"><button type="button" onClick={() => { setMode('sign-in'); setError(null); }}>Back to sign in</button></p>
          </>
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
            {cloud && mode === 'sign-up' && (
              <p className="si-terms">By creating an account or continuing with Google, you agree to <TermsLinks />.</p>
            )}
          </>
        )}

        {(error || (startError && mode === 'sign-in' && !signedOut)) && <p className="si-error" role="alert">{error || startError}</p>}
      </div>
      {closable && onClose && (
        <button type="button" className="back-esc fr-back si-back" aria-label="Back" title="Back" onClick={onClose}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
        </button>
      )}
    </div>
  );
}
