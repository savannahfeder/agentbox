// SHARE: a link anyone can open to the file on screen (main/file-link.mts).
// Nothing leaves this computer until Copy link is pressed. Every version of
// one file shares one link; Update link puts the copy on screen in it.
import { useEffect, useRef, useState } from 'react';
import { api, type FileLinkState, type LinkComment } from '../api';
import { shareWords } from '../public-link-words';
import { NoteGlyph } from './NoteGlyphs';

export const SIGN_IN_TO_SHARE = 'agentbox:sign-in-to-share';

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

type Can = 'view' | 'comment' | 'edit';
type Person = { email: string; can: Can; name: string | null };
const CANS: Can[] = ['view', 'comment', 'edit'];
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** What a link lets people do and who it is for, as words a select can show. */
export function CanPick({ value, editable, onPick, label, remove = false, disabled }: {
  value: Can; editable: boolean; onPick: (c: Can | null) => void; label: string; remove?: boolean; disabled?: boolean;
}) {
  // An edit given before the file stopped being editable still reads as what it is.
  const offered = CANS.filter((c) => c !== 'edit' || editable || value === 'edit');
  return (
    <select className="av-share-pick" aria-label={label} value={value} disabled={disabled}
      onChange={(e) => onPick(e.target.value === 'remove' ? null : e.target.value as Can)}>
      {offered.map((c) => <option key={c} value={c}>{shareWords.can[c]}</option>)}
      {remove && <option value="remove">Remove</option>}
    </select>
  );
}

/** Who can open the link, what they can do, and the people added by email. */
function WhoCanOpen({ token, access, can, editable, onChanged, onProblem }: {
  token: string; access: 'anyone' | 'people'; can: Can; editable: boolean;
  onChanged: () => void; onProblem: (words: string | null) => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api.fileLinkPeople({ token }).then((r) => { if (live && r.ok) setPeople(r.people ?? []); });
    return () => { live = false; };
  }, [token]);

  const setAccess = async (a: 'anyone' | 'people', c: Can) => {
    setBusy(true); onProblem(null);
    const out = await api.fileLinkAccess({ token, access: a, can: c });
    setBusy(false);
    if (!out.ok) { onProblem(out.error ?? 'That did not change.'); return; }
    onChanged();
  };
  const setPerson = async (email: string, c: Can | null) => {
    setBusy(true); onProblem(null);
    const out = await api.fileLinkPerson({ token, email, can: c });
    setBusy(false);
    if (!out.ok) { onProblem(out.error ?? 'That did not change.'); return false; }
    setPeople(out.people ?? []);
    return true;
  };
  const add = async () => {
    const email = adding.trim();
    if (!email) return;
    if (!looksLikeEmail(email)) { onProblem('That is not an email address.'); return; }
    if (await setPerson(email, editable ? 'edit' : 'comment')) setAdding('');
  };

  return (
    <>
      <div className="av-share-access">
        <select className="av-share-pick" aria-label="Who can open it" value={access} disabled={busy} onChange={(e) => void setAccess(e.target.value as 'anyone' | 'people', can)}>
          <option value="anyone">{shareWords.access.anyone}</option>
          <option value="people">{shareWords.access.people}</option>
        </select>
        {access === 'anyone' && <CanPick value={can} editable={editable} label="What anyone with the link can do" disabled={busy} onPick={(c) => void setAccess(access, c ?? can)} />}
      </div>
      <form className="av-share-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input type="email" value={adding} onChange={(e) => { setAdding(e.target.value); onProblem(null); }} placeholder={shareWords.addPeople} aria-label={shareWords.addPeople} disabled={busy} autoComplete="off" spellCheck={false} />
      </form>
      {people && people.length > 0 && (
        <ul className="av-share-people" aria-label="People added">
          {people.map((p) => (
            <li key={p.email}>
              <span className="av-share-person" title={p.email}>{p.name ? <><b>{p.name}</b> {p.email}</> : p.email}</span>
              <CanPick value={p.can} editable={editable} remove label={`What ${p.name ?? p.email} can do`} disabled={busy} onPick={(c) => void setPerson(p.email, c)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
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
  const live = link?.access === 'people' ? shareWords.kept : shareWords.live;

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
    if (!stopAsked) { setStopAsked(true); setSaid(null); return; }
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
        ? <button type="button" className={`doc-mark${link ? ' is-shared' : ''}${flagged ? ' is-behind' : ''}`} title={behind ? shareWords.behind : unseen ? shareWords.newComments : link ? live : 'Share'} aria-label={link ? live : 'Share'} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="globe" /></button>
        : <button type="button" className={`av-btn${open ? ' is-on' : ''}${flagged ? ' is-behind' : ''}`} title={behind ? shareWords.behind : unseen ? shareWords.newComments : undefined} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><NoteGlyph name="globe" />{link ? live : 'Share'}</button>}
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
              <p className="av-share-meta"><span>{behind ? shareWords.behind : link.ahead ? shareWords.ahead(link.version) : link.changedByName ? shareWords.editedBy(link.changedByName, link) : shareWords.shared(link)}</span></p>
              <WhoCanOpen
                token={link.token} access={link.access ?? 'anyone'} can={link.can ?? 'comment'} editable={!!link.editable}
                onChanged={() => void api.fileLink(ask).then(setState)} onProblem={setProblem}
              />
              {stopAsked ? (
                <div className="av-share-confirm" role="group" aria-label="Stop sharing">
                  <p>{shareWords.stopConfirm(link.comments)}</p>
                  <div className="av-share-acts">
                    <button type="button" className="av-btn is-on" disabled={busy} autoFocus onClick={() => void stop()}>Stop sharing</button>
                    <button type="button" className="av-btn" disabled={busy} onClick={() => setStopAsked(false)}>Keep sharing</button>
                  </div>
                </div>
              ) : (
                <div className="av-share-acts">
                  {behind && <button type="button" className="av-btn is-on" disabled={busy} onClick={() => void share()}>Update link</button>}
                  <button type="button" className={`av-btn${behind ? '' : ' is-on'}`} disabled={busy} onClick={() => void copy(link.url).then((ok) => setSaid(ok ? 'Link copied' : null))}>Copy link</button>
                  {!behind && <button type="button" className="av-btn" disabled={busy} onClick={() => window.open(link.url, '_blank')}>Open</button>}
                  <span className="av-spring" />
                  <button type="button" className="av-share-stop" disabled={busy} onClick={() => void stop()}>Stop sharing</button>
                </div>
              )}
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
              {/* Just stopped: that is what the panel says, in place of the offer to share. */}
              {said === shareWords.stopped
                ? <p className="av-share-gone" role="status"><b>Not shared.</b> The old link no longer works.</p>
                : <p>{shareWords.fresh}</p>}
              <div className="av-share-acts">
                <button type="button" className="av-btn is-on" disabled={busy} onClick={() => void share()}>{busy ? 'Making the link' : said === shareWords.stopped ? 'Make a new link' : 'Make link'}</button>
              </div>
            </>
          )}
          {(problem || (said && said !== shareWords.stopped)) && <p className={`av-share-said${problem ? ' is-bad' : ''}`} role="status">{problem ?? said}</p>}
        </div>
      )}
    </div>
  );
}
