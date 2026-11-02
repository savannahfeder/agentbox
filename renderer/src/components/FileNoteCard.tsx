// One note on a file in the big view: who said it, where, what, its replies, and what can be done with it.
import { useState } from 'react';
import { Face } from '../team/people';
import { clock } from '../thread-history';
import type { FileNote, Person } from '../types';
import { notePlaceWords } from '../artifact-pins';

const clockAt = clock;

export function FileNoteCard({ note, wordsGone, active, settling, person, me, onGo, onSettle, nameOf, replying, onReplying, onReply, canReply, held, onToAgent }: {
  note: FileNote; wordsGone: boolean; active: boolean; person: (id: string | null) => Person | null; me: string | null;
  /** Just resolved: it stays in place, struck, with its Undo, before it folds away. */
  settling: boolean;
  /** On an agent's file, where a note the agent was not sent went instead. */
  held: string | null; onToAgent: () => void;
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
  return <article className={`av-note${active ? ' is-on' : ''}${note.resolved ? ' is-settled' : ''}${settling ? ' is-just-settled' : ''}${note.saving ? ' is-saving' : ''}`} id={`av-note-${note.id}`}>
    <button type="button" className="av-note-go" onClick={onGo} aria-label={`Go to ${place}`}>
      <span className="av-note-head">
        <Face person={person(note.by)} name={person(note.by) ? undefined : whoSaid(note.by)} me={!!me && note.by === me} />
        <span className="av-note-who">{whoSaid(note.by)}</span>
        <span className="av-note-when">{clockAt(note.ts)}</span>
      </span>
      <span className="av-note-place">{place}</span>
      <span className="av-note-text">{note.text}</span>
    </button>
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
      </form>
    )}
    {settling ? <span className="av-note-acts" role="status">
      <span className="av-note-done">Resolved</span>
      <button type="button" className="av-note-act av-note-undo" onClick={() => onSettle(false)}>Undo</button>
    </span> : <span className="av-note-acts">
      {wordsGone && <span className="av-note-sent">Those words were edited</span>}
      {note.in && <span className="av-note-sent">In {note.in}</span>}
      {note.from && <span className="av-note-sent">From {note.from}, still open</span>}
      {note.sent && <span className="av-note-sent">Sent to the agent</span>}
      {!note.sent && held && !note.resolved && <>
        <span className="av-note-sent">{held}</span>
        <button type="button" className="av-note-act" onClick={onToAgent}>Send to the agent</button>
      </>}
      {canReply && !replying && !note.resolved && <button type="button" className="av-note-act" onClick={() => onReplying(true)}>Reply</button>}
      <button type="button" className="av-note-act" onClick={() => onSettle(!note.resolved)}>{note.resolved ? 'Reopen' : 'Resolve'}</button>
    </span>}
  </article>;
}
