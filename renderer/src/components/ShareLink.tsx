// SHARE: a link anyone can open to the file on screen (main/file-link.mts).
// Nothing leaves this computer until Copy link is pressed. Every version of
// one file shares one link; Update link puts the copy on screen in it.
import { useEffect, useRef, useState } from 'react';
import { api, type FileLinkState, type LinkComment } from '../api';
import { shareSignedOutWords, shareWords } from '../public-link-words';
import { shareSignInStartsOn, signInWasSkipped } from '../sign-in-ask';
import { NoteGlyph } from './NoteGlyphs';
import { placeWords, shownName, type NotePlace } from '../../../shared/artifact-marks.mts';

/** A link comment's place, short: "at 0:24", "a pin", the quote. */
const placeOn = (place: NotePlace) => (place.kind === 'time' ? `at ${placeWords({ place: { kind: 'time', s: place.s } })}` : place.kind === 'pin' ? 'on a pin' : placeWords({ place }));

export const SIGN_IN_TO_SHARE = 'agentbox:sign-in-to-share';
export const COPIED_MS = 1800;

/** The Share panel's one button: it says the link was copied, for a moment, where it was pressed. */
export const copyWords = ({ copied, making }: { copied: boolean; making: boolean }) => (copied ? 'Copied' : making ? 'Making the link' : 'Copy link');

export { shareWords };

/** A new link goes on the clipboard; updating one already sent leaves the clipboard alone. */
export async function afterSharing(hadLink: boolean, copyIt: () => Promise<boolean>): Promise<string | null> {
  if (hadLink) return 'Link updated';
  return (await copyIt()) ? 'Link copied' : null;
}

/** The kinds a link can draw, as main/file-link.mts linkKindOf names them. */
export const canShareFile = (src: string) => /\.(md|markdown|csv|tsv|html?|png|jpe?g|gif|webp|svg|pdf|mp4|m4v|mov|webm)$/i.test(String(src ?? '').split(/[?#]/)[0]);

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
  const [copied, setCopied] = useState(false);
  const copiedFor = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedFor.current), []);
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
  const copyIt = async (url: string) => {
    if (!(await copy(url))) { setProblem('This browser would not copy. Open the link and copy it from there.'); return; }
    setCopied(true);
    window.clearTimeout(copiedFor.current);
    copiedFor.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };
  const makeAndCopy = async () => {
    setBusy(true); setProblem(null); setSaid(null);
    const out = await api.fileLinkShare(ask);
    setBusy(false);
    if (!out.ok || !out.link) { setProblem(out.error ?? 'That did not share.'); return; }
    setState(out);
    if (!link) await copyIt(out.link.url);
  };
  const name = shownName(src) || src;

  return (
    <div className={`av-share${icon ? ' is-mark' : ''}`} ref={box}>
      {icon
        ? <button type="button" className={`doc-mark${link ? ' is-shared' : ''}${flagged ? ' is-behind' : ''}`} title={behind ? shareWords.behind : unseen ? shareWords.newComments : link ? shareWords.live : 'Share'} aria-label={link ? shareWords.live : 'Share'} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="globe" /></button>
        : <button type="button" className={`av-btn${open ? ' is-on' : ''}${flagged ? ' is-behind' : ''}`} title={behind ? shareWords.behind : unseen ? shareWords.newComments : undefined} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="globe" />{link ? shareWords.live : 'Share'}</button>}
      {open && (
        <div className="av-share-box" role="dialog" aria-label="Share">
          <p className="av-share-title">Share <span>{name}</span></p>
          {!state.signedIn ? (() => {
            const offer = shareSignedOutWords(shareSignInStartsOn({ skipped: signInWasSkipped() }));
            return <>
              <div className="av-share-who-sees">
                <span className="av-share-icon"><NoteGlyph name="lock" /></span>
                <span className="av-share-access"><b>{shareWords.notPublic}</b><i>{offer.line}</i></span>
              </div>
              <div className="av-share-foot">
                <span />
                <button type="button" className="av-share-copy" onClick={() => { setOpen(false); window.dispatchEvent(new Event(SIGN_IN_TO_SHARE)); }}>{offer.button}</button>
              </div>
            </>;
          })() : (
            <>
              <div className="av-share-who-sees">
                <span className={`av-share-icon${link ? ' is-open' : ''}`}><NoteGlyph name={link ? 'globe' : 'lock'} /></span>
                <span className="av-share-access">
                  <b>{link ? shareWords.anyone : shareWords.notPublic}</b>
                  <i>{link && stopAsked && link.comments > 0 ? shareWords.keptComments(link.comments) : link ? shareWords.canComment : shareWords.fresh}</i>
                </span>
                {link && (
                  <button type="button" className={`av-share-stop${stopAsked ? ' is-asking' : ''}`} disabled={busy} onBlur={() => setStopAsked(false)} onClick={() => void stop()}>
                    {stopAsked ? shareWords.stopAsk(link.comments) : 'Stop sharing'}
                  </button>
                )}
              </div>
              {link && comments && comments.length > 0 && (
                <>
                  <ol className="av-share-comments" aria-label="Comments">
                    {comments.map((c) => (
                      <li key={c.id}>
                        <span className="av-share-who"><b>{c.byOwner ? 'You' : c.byName}</b>{c.place && c.place.kind !== 'whole' && <em>{placeOn(c.place)}</em>}<time>{whenSaid(c.at)}</time></span>
                        <p>{c.text}</p>
                      </li>
                    ))}
                  </ol>
                  <form className="av-share-reply" onSubmit={(e) => { e.preventDefault(); void reply(); }}>
                    <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Reply on the page" aria-label="Reply on the page" maxLength={4000} disabled={busy} />
                    <button type="submit" className="av-share-send" aria-label="Send the reply" title="Send the reply" disabled={busy || !answer.trim()}><NoteGlyph name="send" /></button>
                  </form>
                </>
              )}
              {(said || problem) && <p className={`av-share-said${problem ? ' is-bad' : ''}`} role="status">{problem ?? said}</p>}
              <div className="av-share-foot">
                <span className="av-share-when">{!link ? '' : behind ? shareWords.behind : link.ahead ? shareWords.ahead(link.version) : shareWords.shared(link)}</span>
                {link && !behind && <button type="button" className="av-share-out" title="Open the link" aria-label="Open the link" onClick={() => window.open(link.url, '_blank')}><NoteGlyph name="out" /></button>}
                {link && behind
                  ? <button type="button" className="av-share-copy" disabled={busy} onClick={() => void makeAndCopy()}>Update link</button>
                  : <button type="button" className={`av-share-copy${copied ? ' is-copied' : ''}`} disabled={busy} aria-live="polite"
                    onClick={() => void (link ? copyIt(link.url) : makeAndCopy())}>
                    <NoteGlyph name={copied ? 'check' : 'link'} />{copyWords({ copied, making: busy && !link })}
                  </button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
