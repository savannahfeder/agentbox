// SHARE: a link anyone can open to the file on screen (main/file-link.mjs).
// Nothing leaves this computer until Copy link is pressed. Every version of
// one file shares one link; Update link puts the copy on screen in it.
import { useEffect, useRef, useState } from 'react';
import { api, type FileLinkState } from '../api';
import { clock } from '../thread-history';
import { NoteGlyph } from './NoteGlyphs';

export const SIGN_IN_TO_SHARE = 'agentbox:sign-in-to-share';

export const shareWords = {
  signedOut: 'Sign in to share a link to this file.',
  fresh: 'Anyone with the link can view this file.',
  stopped: 'Stopped. The old link no longer works.',
  behind: 'The link shows an older copy.',
  comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
  shared: (at: number, now = Date.now()) => (new Date(at).toDateString() === new Date(now).toDateString()
    ? `Shared today at ${clock(at)}`
    : `Shared ${new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' })}`),
};

/** The kinds a link can draw, as main/file-link.mjs linkKindOf names them. */
export const canShareFile = (src: string) => /\.(md|markdown|html?|png|jpe?g|gif|webp|svg|pdf)$/i.test(String(src ?? '').split(/[?#]/)[0]);

/** What the panel offers: the live link, and whether it holds an older copy than the one on screen. */
export function linkOffer(state: FileLinkState | null) {
  const link = state?.link ?? null;
  return { link, behind: !!link && !link.current };
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** `icon`: drawn as the side pane's square mark rather than a worded button. */
export function ShareLink({ product, thread, src, signedIn, icon = false }: {
  product: string; thread: string; src: string;
  /** From the window's snapshot, so signing in elsewhere moves the panel on. */
  signedIn: boolean;
  icon?: boolean;
}) {
  const [state, setState] = useState<FileLinkState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const ask = { product, thread, src };

  useEffect(() => {
    let live = true;
    void api.fileLink(ask).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [product, thread, src, signedIn]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  if (!state?.ok || !state.site) return null;
  const { link, behind } = linkOffer(state);

  const share = async () => {
    setBusy(true); setProblem(null); setSaid(null);
    const out = await api.fileLinkShare(ask);
    setBusy(false);
    if (!out.ok || !out.link) { setProblem(out.error ?? 'That did not share.'); return; }
    setState(out);
    setSaid((await copy(out.link.url)) ? 'Link copied' : null);
  };
  const stop = async () => {
    if (!link) return;
    setBusy(true); setProblem(null);
    const out = await api.fileLinkStop({ token: link.token });
    setBusy(false);
    if (!out.ok) { setProblem(out.error ?? 'That did not stop.'); return; }
    setState({ ...state, link: null });
    setSaid(shareWords.stopped);
  };
  const toggle = () => { setOpen(!open); setSaid(null); setProblem(null); };

  return (
    <div className={`av-share${icon ? ' is-mark' : ''}`} ref={box}>
      {icon
        ? <button type="button" className={`doc-mark${link ? ' is-shared' : ''}`} title={link ? 'Shared' : 'Share'} aria-label={link ? 'Shared' : 'Share'} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="link" /></button>
        : <button type="button" className={`av-btn${open ? ' is-on' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="link" />{link ? 'Shared' : 'Share'}</button>}
      {open && (
        <div className="av-share-box" role="dialog" aria-label="Share">
          {!state.signedIn ? (
            <>
              <p>{shareWords.signedOut}</p>
              <div className="av-share-acts">
                <button type="button" className="av-btn is-on" onClick={() => { setOpen(false); window.dispatchEvent(new Event(SIGN_IN_TO_SHARE)); }}>Sign in</button>
              </div>
            </>
          ) : link ? (
            <>
              <input className="av-share-url" readOnly value={link.url} aria-label="Link" onFocus={(e) => e.currentTarget.select()} />
              <p className="av-share-meta">
                <span>{behind ? shareWords.behind : shareWords.shared(link.updatedAt)}</span>
                {link.comments > 0 && <a href={link.url} onClick={(e) => { e.preventDefault(); window.open(link.url, '_blank'); }}>{shareWords.comments(link.comments)}</a>}
              </p>
              <div className="av-share-acts">
                <button type="button" className="av-btn is-on" disabled={busy} onClick={() => void (behind ? share() : copy(link.url).then((ok) => setSaid(ok ? 'Link copied' : null)))}>
                  {behind ? 'Update link' : 'Copy link'}
                </button>
                <button type="button" className="av-btn" disabled={busy} onClick={() => window.open(link.url, '_blank')}>Open</button>
                <span className="av-spring" />
                <button type="button" className="av-share-stop" disabled={busy} onClick={() => void stop()}>Stop sharing</button>
              </div>
            </>
          ) : (
            <>
              <p>{shareWords.fresh}</p>
              <div className="av-share-acts">
                <button type="button" className="av-btn is-on" disabled={busy} onClick={() => void share()}>{busy ? 'Sharing' : 'Copy link'}</button>
              </div>
            </>
          )}
          {(said || problem) && <p className={`av-share-said${problem ? ' is-bad' : ''}`} role="status">{problem ?? said}</p>}
        </div>
      )}
    </div>
  );
}
