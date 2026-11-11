// COMMENTS ON A FILE'S PUBLIC LINK, in the file's Notes beside its owner's own
// notes, each at its place. Pressing one goes there; a reply is posted on the
// link page. They are never sent to the agent: whoever has the link wrote them.
import { useCallback, useEffect, useState } from 'react';
import { api, type LinkComment } from '../api';
import { Face } from '../team/people';
import { NoteGlyph } from './NoteGlyphs';
import { NotesSection } from './NotesSidebar';
import { placeLabel, pinNumbers } from '../shared-file/link-notes';
import { clock } from '../thread-history';
import type { FileNote, NotePlace } from '../types';

const POLL_MS = 30_000;

/** The live link's comments for the file on screen; none when it is not shared. */
export function useLinkNotes(ask: { product: string; thread: string | null | undefined; src: string | null | undefined } | null) {
  const [got, setGot] = useState<{ token: string; comments: LinkComment[] } | null>(null);
  const key = ask && ask.thread && ask.src ? `${ask.product}\u0000${ask.thread}\u0000${ask.src}` : null;
  const read = useCallback(async () => {
    if (!ask || !ask.thread || !ask.src) { setGot(null); return; }
    const state = await api.fileLink({ product: ask.product, thread: ask.thread, src: ask.src });
    const token = state.ok ? state.link?.token ?? null : null;
    if (!token || !state.link?.comments) { setGot(token ? { token, comments: [] } : null); return; }
    const out = await api.fileLinkComments({ token });
    if (out.ok) setGot({ token, comments: out.comments ?? [] });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void read();
    const tick = () => { if (document.visibilityState === 'visible') void read(); };
    const t = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(t);
  }, [read]);
  const reply = useCallback(async (text: string) => {
    if (!got) return false;
    const out = await api.fileLinkComment({ token: got.token, text });
    if (!out.ok) return false;
    setGot({ token: got.token, comments: out.comments ?? got.comments });
    return true;
  }, [got]);
  return { comments: got?.comments ?? [], reply };
}

/**
 * The link's placed comments as the file draws notes: pins on a frame or a
 * picture, marks on a timeline, quoted words. Drawn only, as notes carried
 * from elsewhere are ("Link·1"); never listed or sent as the owner's own.
 */
export function linkNotesOnTheFile(comments: readonly LinkComment[], file: string): FileNote[] {
  const n = pinNumbers(comments);
  return comments.flatMap((c) => (c.place && c.place.kind !== 'whole' ? [{
    id: linkNoteId(c.id), file, place: c.place, text: c.text, by: null, ts: c.at, mentions: [], owner: null, uid: null,
    from: 'Link', ...(n.has(c.id) ? { pin: Number(n.get(c.id)) } : {}),
  }] : []));
}

export const linkNoteId = (id: string) => `link-${id}`;

export function LinkNotes({ comments, onGo, reply, activeId = null }: {
  activeId?: string | null;
  comments: LinkComment[];
  /** Go to a comment's place in the file, as pressing a note does. */
  onGo: (place: NotePlace, id: string) => void;
  reply: (text: string) => Promise<boolean>;
}) {
  const [writing, setWriting] = useState(false);
  const [words, setWords] = useState('');
  const [sending, setSending] = useState(false);
  if (!comments.length) return null;
  const numbers = pinNumbers(comments);
  const send = async () => {
    const text = words.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await reply(text);
    setSending(false);
    if (ok) { setWords(''); setWriting(false); }
  };
  return <>
    <NotesSection word="On the link" />
    {comments.map((c) => {
      const at = placeLabel(c, numbers);
      const quote = c.place?.kind === 'quote';
      const who = c.byOwner ? 'You' : c.byName;
      return <article key={c.id} className={`av-note is-link${activeId === linkNoteId(c.id) ? ' is-on' : ''}`}>
        <button type="button" className="av-note-go" disabled={!c.place} onClick={() => { if (c.place) onGo(c.place, linkNoteId(c.id)); }} aria-label={at ? `Go to ${at}` : who}>
          <span className="av-note-head">
            <Face person={null} name={who} me={c.byOwner} />
            <span className="av-note-who">{who}</span>
            {at && !quote && <span className="av-note-at">{/^\d/.test(at) ? `at ${at}` : at}</span>}
            <span className="av-note-when">{clock(c.at)}</span>
          </span>
          {at && quote && <span className="av-note-place">{at}</span>}
          <span className="av-note-text">{c.text}</span>
        </button>
      </article>;
    })}
    {writing ? (
      <form className="av-reply-write av-link-reply" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea rows={1} autoFocus value={words} placeholder="Reply on the link page" aria-label="Reply on the link page"
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <span className="av-note-acts">
          <button type="button" className="av-note-act" onClick={() => { setWords(''); setWriting(false); }}>Cancel</button>
          <button type="submit" className="av-note-act is-strong" disabled={!words.trim() || sending}><NoteGlyph name="reply" />Reply</button>
        </span>
      </form>
    ) : (
      <span className="av-note-acts av-link-acts">
        <button type="button" className="av-note-act" onClick={() => setWriting(true)}><NoteGlyph name="reply" />Reply on the link page</button>
      </span>
    )}
  </>;
}
