// One note on a file in the big view: who said it, where, what, its replies, and what can be done with it.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { notePictures, type NotePicture } from '../note-pictures';
import { pictureUrl } from '../picture';
import { Face } from '../team/people';
import { clock } from '../thread-history';
import type { FileNote, Person } from '../types';
import { notePlaceWords } from '../artifact-pins';
import { NoteGlyph } from './NoteGlyphs';

const clockAt = clock;

/** "Pin 2 at 0:12" as the tag on the file ("2") and the words after it ("at 0:12"). */
function placeParts(words: string): { tag: string | null; rest: string } {
  const m = /^Pin (\S+)(?: (.*))?$/.exec(words);
  return m ? { tag: m[1], rest: m[2] ?? '' } : { tag: null, rest: words };
}

// A picture saved on a teammate's computer is not on this one: its name stands in.
function NotePictureShown({ product, picture }: { product: string; picture: NotePicture }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api.resolveDoc({ product, src: picture.src })
      .then((r) => { if (live) setSrc(r.ok && r.opened ? pictureUrl(r.opened) : null); })
      .catch(() => { if (live) setSrc(null); });
    return () => { live = false; };
  }, [product, picture.src]);
  if (src === null) return <span className="av-note-picture-gone">{picture.name}</span>;
  return src ? <img className="av-note-picture" src={src} alt={picture.name} onError={() => setSrc(null)} /> : null;
}

export function FileNoteCard({ note, answeredBy = null, wordsGone, product, active, settling, person, me, onGo, onSettle, nameOf, replying, onReplying, onReply, canReply, held, onToAgent }: {
  note: FileNote; wordsGone: boolean; product: string;
  /** "Resolved by your agent in v15", when a newer version resolved it. */
  answeredBy?: string | null; active: boolean; person: (id: string | null) => Person | null; me: string | null;
  /** Just resolved: it stays in place, struck, with its Undo, before it folds away. */
  settling: boolean;
  /** On an agent's file, where a note the agent was not sent went instead. */
  held: { words: string; went: boolean } | null; onToAgent: () => void;
  onGo: () => void; onSettle: (resolved: boolean) => void; nameOf: (id: string | null) => string;
  replying: boolean; onReplying: (on: boolean) => void; onReply: (text: string) => Promise<boolean>; canReply: boolean;
}) {
  const place = notePlaceWords(note);
  const [words, setWords] = useState('');
  const [sending, setSending] = useState(false);
  const whoSaid = (id: string | null) => (id === me || !id ? 'You' : nameOf(id));
  const send = async () => {
    const text = words.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onReply(text);
    setSending(false);
    if (ok) { setWords(''); onReplying(false); }
  };
  const { tag, rest } = placeParts(place);
  const said = notePictures(note.text);
  const quote = note.place.kind === 'quote';
  // What became of the note itself: above its replies when it has some, so it is not read as theirs.
  const answered = !!note.replies?.length;
  const facts = [
    wordsGone && <span key="gone" className="av-note-sent">Those words were edited</span>,
    note.in && <span key="in" className="av-note-sent">In {note.in}</span>,
    note.from && <span key="from" className="av-note-sent">{note.resolved ? <>From {note.from}</> : <>From {note.from}, still open</>}</span>,
    answeredBy && <span key="answered" className="av-note-done"><NoteGlyph name="check" />{answeredBy}</span>,
    note.sent && !answeredBy && <span key="sent" className="av-note-sent"><NoteGlyph name="send" />Sent to the agent</span>,
    !note.sent && held && !note.resolved && <span key="held" className="av-note-sent">{held.went && <NoteGlyph name="send" />}{held.words}</span>,
  ].filter(Boolean);
  return <article className={`av-note${active ? ' is-on' : ''}${note.resolved ? ' is-settled' : ''}${settling ? ' is-just-settled' : ''}${note.saving ? ' is-saving' : ''}`} id={`av-note-${note.id}`}>
    <button type="button" className="av-note-go" onClick={onGo} aria-label={`Go to ${place}`}>
      <span className="av-note-head">
        <Face person={person(note.by)} name={person(note.by) ? undefined : whoSaid(note.by)} me={!!me && note.by === me} />
        <span className="av-note-who">{whoSaid(note.by)}</span>
        {tag && <span className="av-pin-tag av-note-tag">{tag}</span>}
        {!quote && note.place.kind !== 'whole' && rest && <span className="av-note-at">{rest}</span>}
        <span className="av-note-when">{clockAt(note.ts)}</span>
      </span>
      {quote && <span className="av-note-place">{place}</span>}
      {said.words && <span className="av-note-text">{said.words}</span>}
      {said.pictures.length > 0 && <span className="av-note-pictures">
        {said.pictures.map((p) => <NotePictureShown key={p.src} product={product} picture={p} />)}
      </span>}
    </button>
    {answered && facts.length > 0 && <span className="av-note-acts av-note-facts">{facts}</span>}
    {(note.replies ?? []).map((r) => (
      <div className="av-reply" key={r.id}>
        <span className="av-note-head">
          <Face person={person(r.by)} name={person(r.by) ? undefined : whoSaid(r.by)} me={!!me && r.by === me} />
          <span className="av-note-who">{whoSaid(r.by)}</span>
          <span className="av-note-when">{clockAt(r.ts)}</span>
        </span>
        <span className="av-note-text">{r.text}</span>
      </div>
    ))}
    {replying && (
      <form className="av-reply-write" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea rows={1} autoFocus value={words} placeholder="Reply" aria-label="Reply"
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <span className="av-note-acts">
          <button type="button" className="av-note-act" onClick={() => { setWords(''); onReplying(false); }}>Cancel</button>
          <button type="submit" className="av-note-act is-strong" disabled={!words.trim() || sending}><NoteGlyph name="reply" />Reply</button>
        </span>
      </form>
    )}
    {settling ? <span className="av-note-acts" role="status">
      <span className="av-note-done"><NoteGlyph name="check" />Resolved</span>
      <button type="button" className="av-note-act" onClick={() => onSettle(false)}><NoteGlyph name="undo" />Undo</button>
    </span> : <span className="av-note-acts">
      {!answered && facts}
      {!note.sent && held && !note.resolved && <button type="button" className="av-note-act av-note-toagent" onClick={onToAgent}><NoteGlyph name="send" />Send to the agent</button>}
      {!replying && <span className="av-note-btns">
        {canReply && !note.resolved && <button type="button" className="av-note-act" onClick={() => onReplying(true)}><NoteGlyph name="reply" />Reply</button>}
        <button type="button" className="av-note-act" onClick={() => onSettle(!note.resolved)}><NoteGlyph name={note.resolved ? 'undo' : 'check'} />{note.resolved ? 'Reopen' : 'Resolve'}</button>
      </span>}
    </span>}
  </article>;
}
