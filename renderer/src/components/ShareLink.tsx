// SHARE: a link anyone can open to the file on screen (main/file-link.mjs).
// Nothing leaves this computer until Copy link is pressed. Every version of
// one file shares one link; Update link puts the copy on screen in it.
import { useEffect, useRef, useState } from 'react';
import { api, type FileLinkState, type LinkComment } from '../api';
import { clock } from '../thread-history';
import { NoteGlyph } from './NoteGlyphs';

export const SIGN_IN_TO_SHARE = 'agentbox:sign-in-to-share';

export const shareWords = {
  signedOut: 'Sign in to share this file or see its link.',
  fresh: 'Make a link anyone can open, without an account. Its comments are public too.',
  stopped: 'Stopped. The old link no longer works.',
  behind: 'The link shows an older copy.',
  ahead: (v: number) => `The link shows version ${v}, newer than this one.`,
  newComments: 'New comments on the link',
  comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
  stopAsk: (n: number) => (n > 0 ? `Stop, and delete ${n === 1 ? 'its comment' : `its ${n} comments`}` : 'Stop the link'),
  shared: ({ createdAt, updatedAt }: { createdAt: number; updatedAt: number }, now = Date.now()) => {
    const what = updatedAt - createdAt > 1000 ? 'Updated' : 'Shared';
    return new Date(updatedAt).toDateString() === new Date(now).toDateString()
      ? `${what} today at ${clock(updatedAt)}`
      : `${what} ${new Date(updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  },
  // "Shared" already means a teammate's thread, and a file your agent handed you.
  live: 'Public link',
};

/** A new link goes on the clipboard; updating one already sent leaves the clipboard alone. */
export async function afterSharing(hadLink: boolean, copyIt: () => Promise<boolean>): Promise<string | null> {
  if (hadLink) return 'Link updated';
  return (await copyIt()) ? 'Link copied' : null;
}

/** The kinds a link can draw, as main/file-link.mjs linkKindOf names them. */
export const canShareFile = (src: string) => /\.(md|markdown|html?|png|jpe?g|gif|webp|svg|pdf)$/i.test(String(src ?? '').split(/[?#]/)[0]);

/** What the panel offers: the live link, and whether it holds an older copy than the one on screen. */
export function linkOffer(state: FileLinkState | null) {
  const link = state?.link ?? null;
  return { link, behind: !!link && !link.current && !link.ahead };
}

// How many of a link's comments this computer has shown, so a new one marks the button.
const SEEN = 'agentbox:link-comments-seen';
const seenAll = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch { return {}; } };
export const seenComments = (token: string) => seenAll()[token] ?? 0;
export function seeComments(token: string, n: number) {
  try { localStorage.setItem(SEEN, JSON.stringify({ ...seenAll(), [token]: n })); } catch { /* storage full: the dot stays */ }
}

const whenSaid = (at: number, now = Date.now()) => {
  const m = Math.floor(Math.max(0, now - at) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h`;
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

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

  const [stopAsked, setStopAsked] = useState(false);
  const [comments, setComments] = useState<LinkComment[] | null>(null);
  const [answer, setAnswer] = useState('');
  const [unseen, setUnseen] = useState(false);
  // Read again on every opening: an edit or a comment since is what the panel is opened to see.
  useEffect(() => {
    let live = true;
    void api.fileLink(ask).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [product, thread, src, signedIn, open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  const token = state?.link?.token ?? null;
  const count = state?.link?.comments ?? 0;
  useEffect(() => {
    if (!open || !token) { setComments(null); return; }
    let live = true;
    void api.fileLinkComments({ token }).then((r) => {
      if (!live || !r.ok) return;
      setComments(r.comments ?? []);
      seeComments(token, (r.comments ?? []).length);
      setUnseen(false);
    });
    return () => { live = false; };
  }, [open, token, count]);
  useEffect(() => { setUnseen(!!token && count > seenComments(token)); }, [token, count]);

  if (!state?.ok || !state.site) return null;
  const { link, behind } = linkOffer(state);
  const reply = async () => {
    const words = answer.trim();
    if (!words || !link) return;
    setBusy(true); setProblem(null);
    const out = await api.fileLinkComment({ token: link.token, text: words });
    setBusy(false);
    if (!out.ok) { setProblem(out.error ?? 'That did not send.'); return; }
    setAnswer('');
    setComments(out.comments ?? []);
    seeComments(link.token, (out.comments ?? []).length);
  };
  const flagged = behind || unseen;

  const share = async () => {
    setBusy(true); setProblem(null); setSaid(null);
    const out = await api.fileLinkShare(ask);
    setBusy(false);
    if (!out.ok || !out.link) { setProblem(out.error ?? 'That did not share.'); return; }
    setState(out);
    setSaid(await afterSharing(!!link, () => copy(out.link!.url)));
  };
  const stop = async () => {
    if (!link) return;
    if (!stopAsked) { setStopAsked(true); return; }
    setStopAsked(false);
    setBusy(true); setProblem(null);
    const out = await api.fileLinkStop({ token: link.token });
    setBusy(false);
    if (!out.ok) { setProblem(out.error ?? 'That did not stop.'); return; }
    setState({ ...state, link: null });
    setSaid(shareWords.stopped);
  };
  const toggle = () => { setOpen(!open); setSaid(null); setProblem(null); setStopAsked(false); };

  return (
    <div className={`av-share${icon ? ' is-mark' : ''}`} ref={box}>
      {icon
        ? <button type="button" className={`doc-mark${link ? ' is-shared' : ''}${flagged ? ' is-behind' : ''}`} title={behind ? shareWords.behind : unseen ? shareWords.newComments : link ? shareWords.live : 'Share'} aria-label={link ? shareWords.live : 'Share'} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="globe" /></button>
        : <button type="button" className={`av-btn${open ? ' is-on' : ''}${flagged ? ' is-behind' : ''}`} title={behind ? shareWords.behind : unseen ? shareWords.newComments : undefined} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="globe" />{link ? shareWords.live : 'Share'}</button>}
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
              <p className="av-share-meta"><span>{behind ? shareWords.behind : link.ahead ? shareWords.ahead(link.version) : shareWords.shared(link)}</span></p>
              <div className="av-share-acts">
                {behind && <button type="button" className="av-btn is-on" disabled={busy} onClick={() => void share()}>Update link</button>}
                <button type="button" className={`av-btn${behind ? '' : ' is-on'}`} disabled={busy} onClick={() => void copy(link.url).then((ok) => setSaid(ok ? 'Link copied' : null))}>Copy link</button>
                {!behind && <button type="button" className="av-btn" disabled={busy} onClick={() => window.open(link.url, '_blank')}>Open</button>}
                <span className="av-spring" />
                <button type="button" className={`av-share-stop${stopAsked ? ' is-asking' : ''}`} disabled={busy} onBlur={() => setStopAsked(false)} onClick={() => void stop()}>
                  {stopAsked ? shareWords.stopAsk(link.comments) : 'Stop sharing'}
                </button>
              </div>
              {comments && comments.length > 0 && (
                <ol className="av-share-comments" aria-label="Comments">
                  {comments.map((c) => (
                    <li key={c.id}>
                      <span className="av-share-who"><b>{c.byOwner ? 'You' : c.byName}</b><time>{whenSaid(c.at)}</time></span>
                      <p>{c.text}</p>
                    </li>
                  ))}
                </ol>
              )}
              {comments && comments.length > 0 && (
                <form className="av-share-reply" onSubmit={(e) => { e.preventDefault(); void reply(); }}>
                  <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Reply on the page" aria-label="Reply on the page" maxLength={4000} disabled={busy} />
                </form>
              )}
            </>
          ) : (
            <>
              <p>{shareWords.fresh}</p>
              <div className="av-share-acts">
                <button type="button" className="av-btn is-on" disabled={busy} onClick={() => void share()}>{busy ? 'Making the link' : 'Make link'}</button>
              </div>
            </>
          )}
          {(said || problem) && <p className={`av-share-said${problem ? ' is-bad' : ''}`} role="status">{problem ?? said}</p>}
        </div>
      )}
    </div>
  );
}
