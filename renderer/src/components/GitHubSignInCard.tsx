import { useState } from 'react';
import { GITHUB_REFUSED_SIGN_IN, GITHUB_TOKEN_PAGE } from '../../../shared/github-push-sign-in.mts';
import { logoOf } from '../connections/logos';
import './need-card.css';

const lock = <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;
const arrow = <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 11l6-6M6 5h5v5" /></svg>;
const again = <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" /></svg>;

/**
 * A ship the push refused for want of a GitHub sign-in here. GitHub's own
 * sign-in first, in the browser with a code; a pasted token where this
 * computer has no gh to run it.
 */
export function GitHubSignInCard({ why, signIn, save, openLink, copy }: {
  why: string;
  signIn: () => Promise<{ code: string; url: string } | { error: string }>;
  save: (token: string) => Promise<string | null>;
  openLink: (href: string) => void;
  copy: (text: string) => void;
}) {
  const [token, setToken] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<{ code: string; url: string } | null>(null);
  const [pasting, setPasting] = useState(false);
  const refused = why === GITHUB_REFUSED_SIGN_IN;
  const begin = async () => {
    setBusy(true); setSaid(null);
    const out = await signIn();
    setBusy(false);
    if ('error' in out) { setSaid(out.error); setPasting(true); return; }
    setDevice(out);
    openLink(out.url);
  };
  const keep = async () => {
    setBusy(true); setSaid(null);
    const out = await save(token.trim());
    setBusy(false);
    if (out) setSaid(out);
  };
  // Enter and Space belong to the card, not to the thread's own shortcuts.
  return <div className="need" data-need="github-push" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
    <div className="need-body">
      <span className="need-mark need-mark-ink" aria-hidden="true"><img src={logoOf('github') ?? ''} alt="" draggable={false} /></span>
      <div className="need-col">
        <div className="need-title">{refused ? 'Sign in to GitHub again' : 'Sign in to GitHub'}</div>
        {device ? <>
          <div className="need-code-box">
            <span className="need-code-label">Enter this code</span>
            <span className="need-code-value">{device.code}</span>
            <button type="button" className="need-link" onClick={() => copy(device.code)}>Copy</button>
          </div>
          <div className="need-acts">
            <button type="button" className="need-btn need-main" onClick={() => openLink(device.url)}>Open GitHub<span className="need-btn-arrow">{arrow}</span></button>
          </div>
          <div className="need-why need-also">Ships again as soon as you approve it.</div>
        </> : !pasting && <div className="need-acts">
          <button type="button" className="need-btn need-main" disabled={busy} onClick={() => void begin()}>{busy ? 'Starting' : 'Sign in with GitHub'}<span className="need-btn-arrow">{arrow}</span></button>
          <button type="button" className="need-link need-skip" onClick={() => setPasting(true)}>Paste a token instead</button>
        </div>}
        {pasting && <>
          <div className="need-facts">
            <div>{arrow}<span>Get a token from <a href={GITHUB_TOKEN_PAGE} onClick={(e) => { e.preventDefault(); openLink(GITHUB_TOKEN_PAGE); }}>GitHub's own page</a></span></div>
            <div>{lock}<span>Kept on this computer, only for shipping</span></div>
            <div>{again}<span>Ships again as soon as it is saved</span></div>
          </div>
          <form className="need-form" onSubmit={(e) => { e.preventDefault(); if (token.trim() && !busy) void keep(); }}>
            <div className="need-row">
              <input className="need-input" type="password" autoComplete="off" spellCheck={false} aria-label="GitHub token" placeholder="Paste the token"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } }}
                value={token} onChange={(e) => { setToken(e.target.value); setSaid(null); }} />
              <button type="submit" className="need-btn need-main" disabled={busy || !token.trim()}>{busy ? 'Checking' : 'Save'}</button>
            </div>
          </form>
        </>}
        {said && <p className="need-said" role="status">{said}</p>}
      </div>
    </div>
  </div>;
}
