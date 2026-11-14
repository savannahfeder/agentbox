// COMMENTS ON A FILE'S PUBLIC LINK, in the file's Notes beside its owner's own
// notes, each at its place. Pressing one goes there; its Reply points the note
// box at the link page. They are never sent to the agent: whoever has the link
// wrote them.
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
    const out = await api.fileLinkComment({ token: got.token, text, ...(ask?.thread && ask.src ? { product: ask.product, thread: ask.thread, src: ask.src } : {}) });
    if (!out.ok) return false;
    setGot({ token: got.token, comments: out.comments ?? got.comments });
    return true;
  }, [got, key]); // eslint-disable-line react-hooks/exhaustive-deps
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

/** Whom the note box answers on the link page, once a comment's Reply is pressed. */
export interface LinkReplyTo { id: string; name: string }

export const LINK_REPLIED = 'Replied on the link page';

export const linkReplyWords =(to: LinkReplyTo) => `Reply to ${to.name.split(/\s+/)[0]} on the link page`;

export function LinkNotes({ comments, onGo, onReply, replyingTo = null, activeId = null }: {
  activeId?: string | null;
  comments: LinkComment[];
  /** Go to a comment's place in the file, as pressing a note does. */
  onGo: (place: NotePlace, id: string) => void;
  /** Points the note box at the link page, answering this comment. */
  onReply: (to: LinkReplyTo) => void;
  replyingTo?: string | null;
}) {
  if (!comments.length) return null;
  const numbers = pinNumbers(comments);
  return <>
    <NotesSection word="On the link" />
    {comments.map((c) => {
      const at = placeLabel(c, numbers);
      const quote = c.place?.kind === 'quote';
      const who = c.byOwner ? 'You' : c.byName;
      const on = activeId === linkNoteId(c.id) || replyingTo === c.id;
      return <article key={c.id} className={`av-note is-link${on ? ' is-on' : ''}`}>
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
        {!c.byOwner && replyingTo !== c.id && <span className="av-note-acts">
          <span className="av-note-btns">
            <button type="button" className="av-note-act" onClick={() => onReply({ id: c.id, name: c.byName })}><NoteGlyph name="reply" />Reply</button>
          </span>
        </span>}
      </article>;
    })}
  </>;
}
