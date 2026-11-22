// The app's sign-in card (team/SignInPage.tsx) for a shared file's page, which
// has no app behind it: it talks to the database itself, and every way in
// comes back to this same page.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AppMark } from '../components/AppMark';
import { GoogleMark } from '../team/SignInPage';
import { whatIsMissing, type Missing } from '../team/what-is-missing';
import type { CloudClient } from '../cloud-rest';
import { saidOf } from './shared-file';
import '../team/sign-in.css';

const TERMS_URL = 'https://agentbox.ac/terms';
const PRIVACY_URL = 'https://agentbox.ac/privacy';

type Mode = 'sign-in' | 'sign-up' | 'check-email';
export type SignInFor = 'comment' | 'edit' | 'open';
const FOR_WORDS: Record<SignInFor, string> = { comment: 'to comment', edit: 'to edit', open: 'to open this file' };

export function SharedSignIn({ client, startOn, error: startError = null, purpose = 'comment', onNew, onClose, onSignedIn }: {
  client: CloudClient;
  startOn: 'sign-in' | 'sign-up';
  error?: string | null;
  purpose?: SignInFor;
  /** Called before an account may be made here, so the page can offer the Mac app after the first comment. */
  onNew: () => void;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<Mode>(startOn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<null | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(startError);
  const [missing, setMissing] = useState<Missing | null>(null);
  const nameField = useRef<HTMLInputElement | null>(null);
  const emailField = useRef<HTMLInputElement | null>(null);
  const pwField = useRef<HTMLInputElement | null>(null);
  const fieldOf = { name: nameField, email: emailField, password: pwField };
  const back = () => location.origin + location.pathname;

  useEffect(() => { setMissing(null); (mode === 'sign-up' ? nameField : emailField).current?.focus(); }, [mode]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [busy, onClose]);

  const google = async () => {
    setBusy('google'); setError(null);
    try {
      if (mode === 'sign-up') onNew();
      location.assign(await client.googleUrl(back()));
    } catch (err) { setBusy(null); setError(saidOf(err)); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || mode === 'check-email') return;
    const gap = whatIsMissing({ mode, name, email, password });
    if (gap) { setMissing(gap); setError(null); fieldOf[gap.field].current?.focus(); return; }
    setBusy('email'); setError(null);
    try {
      if (mode === 'sign-up') {
        onNew();
        const { confirm } = await client.signUp(name.trim(), email.trim(), password, back());
        if (confirm) { setBusy(null); setMode('check-email'); return; }
      } else {
        await client.signInWithPassword(email.trim(), password);
      }
      onSignedIn();
    } catch (err) { setBusy(null); setError(saidOf(err)); }
  };

  const tab = (to: 'sign-in' | 'sign-up', words: string) => (
    <button type="button" role="tab" aria-selected={mode === to} className={mode === to ? 'on' : ''}
      onClick={() => { setMode(to); setPassword(''); setError(null); }}>{words}</button>
  );
  const heading = mode === 'sign-up' ? `Create an account ${FOR_WORDS[purpose]}` : mode === 'check-email' ? 'Check your email' : `Sign in ${FOR_WORDS[purpose]}`;

  return (
    <div className="si-page sf-sign-in" role="dialog" aria-modal="true" aria-label={heading}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="si-card">
        <span className="si-mark"><AppMark size={28} /></span>
        <h1>{heading}</h1>
        {mode === 'check-email' ? (
          <>
            <p className="si-lede">We sent a link to {email.trim()}. Follow it to confirm your address and you come back here signed in.</p>
            <button type="button" className="si-primary" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="si-tabs" role="tablist">{tab('sign-in', 'Sign in')}{tab('sign-up', 'Create account')}</div>
            <button type="button" className="si-google" disabled={!!busy} onClick={() => void google()}><GoogleMark />Continue with Google</button>
            <div className="si-or"><span>or</span></div>
            <form className="si-form" onSubmit={submit} noValidate>
              {mode === 'sign-up' && (
                <label className={missing?.field === 'name' ? 'si-missing' : undefined}><span>Name</span>
                  <input ref={nameField} value={name} autoComplete="name" onChange={(e) => { setName(e.target.value); setMissing(null); setError(null); }} />
                </label>
              )}
              <label className={missing?.field === 'email' ? 'si-missing' : undefined}><span>Email</span>
                <input ref={emailField} type="email" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value); setMissing(null); setError(null); }} />
              </label>
              <label className={missing?.field === 'password' ? 'si-missing' : undefined}><span>Password</span>
                <span className="si-pw">
                  <input ref={pwField} type={showPassword ? 'text' : 'password'} value={password} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    onChange={(e) => { setPassword(e.target.value); setMissing(null); setError(null); }} />
                  <button type="button" className="si-pw-show" aria-pressed={showPassword} onClick={() => setShowPassword((on) => !on)}>{showPassword ? 'Hide' : 'Show'}</button>
                </span>
              </label>
              <button type="submit" className="si-primary" disabled={!!busy}>
                {busy === 'email' ? (mode === 'sign-up' ? 'Creating…' : 'Signing in…') : mode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>
            {mode === 'sign-up' && (
              <p className="si-terms">By creating an account or continuing with Google, you agree to the <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms</a> and the <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy policy</a>.</p>
            )}
          </>
        )}
        {(error || missing) && <p className="si-error" role="alert">{error || missing?.say}</p>}
      </div>
      <button type="button" className="sf-close" aria-label="Close" title="Close" disabled={!!busy} onClick={onClose}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  );
}
