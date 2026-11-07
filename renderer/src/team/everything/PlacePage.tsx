// A person's or an AI teammate's place: your conversation with them on the
// left, what they are on and what they finished on the right, and the few
// things you do with them over both.
import { useEffect, useState, type ReactNode } from 'react';
import { agoQuiet } from '../../format';
import { sendKeyFor } from '../../reply-keys';
import { MemberFace, MemberWord } from './TeamStrip';
import type { Member } from './members';

const BACK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;

export function Place({ m, waits = 0, about, onBack, backTo, actions, chat, side }: {
  m: Member; waits?: number;
  /** Under the name: their role, or whose AI teammate it is. */
  about?: string | null;
  /** Absent inside Chats, where the list beside it is the way back. */
  onBack?: () => void; backTo?: string;
  actions?: ReactNode; chat: ReactNode; side: ReactNode;
}) {
  return <section className="pl" aria-label={m.name}>
    <header className="pl-head">
      {onBack && <button type="button" className="pl-back" onClick={onBack} title={`Back to ${backTo} (Esc)`} aria-label={`Back to ${backTo}`}>{BACK}<span>{backTo}</span></button>}
      <div className="pl-who">
        <MemberFace m={m} size={40} />
        <div className="pl-name">
          <h2>{m.name}{about && <em>{about}</em>}</h2>
          <MemberWord m={m} waits={waits} />
        </div>
      </div>
      {actions && <div className="pl-acts">{actions}</div>}
    </header>
    <div className="pl-body">
      <div className="pl-chat">{chat}</div>
      <aside className="pl-side">{side}</aside>
    </div>
  </section>;
}

export type PlaceRow = { key: string; title: string; word: string; at: number; tone?: 'work' | 'ask' | 'hold' | 'done' | 'later'; onOpen?: () => void };

/** One list on a place's right: a quiet title, its rows, and a line when there are none. */
export function PlaceList({ title, rows, now, empty, more }: { title: string; rows: PlaceRow[]; now: number; empty?: string; more?: ReactNode }) {
  if (!rows.length && !empty) return null;
  return <div className="pl-sec">
    <h3>{title}{rows.length > 0 && <b>{rows.length}</b>}</h3>
    {rows.length ? <ul className="pl-rows">{rows.map((r) => <li key={r.key}>
      <button type="button" className={`pl-row ${r.tone ?? 'work'}`} onClick={r.onOpen} disabled={!r.onOpen} title={r.title}>
        <i aria-hidden="true" /><span className="pl-t">{r.title}</span>
        <span className="pl-at">{agoQuiet(r.at, now)}</span>
        {r.word && <span className="pl-w">{r.word}</span>}
      </button>
    </li>)}</ul> : <p className="pl-none">{empty}</p>}
    {more}
  </div>;
}

/** Its job, in its own block, with Edit for the AI teammate you own. */
export function JobBlock({ job, onSave }: { job: string | null; onSave?: (job: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(job ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!editing) setText(job ?? ''); }, [job, editing]);
  const save = async () => {
    if (!onSave) return;
    const words = text.trim();
    if (!words) return;
    const failed = await onSave(words);
    if (failed) { setError(failed); return; }
    setError(null);
    setEditing(false);
  };
  return <div className="pl-sec pl-job">
    <h3>Job{onSave && !editing && <button type="button" className="pl-link" onClick={() => setEditing(true)}>Change</button>}</h3>
    {editing
      ? <>
        <textarea className="pl-box" rows={6} value={text} autoFocus aria-label="Its job" onChange={(e) => setText(e.target.value)}
          onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
          }} />
        {error && <p className="tq-error" role="alert">{error}</p>}
        <div className="pl-box-acts">
          <button type="button" className="pl-btn" onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="pl-btn go" disabled={!text.trim()} onClick={() => { void save(); }}>Save</button>
        </div>
      </>
      : <p className="pl-text">{job || 'No job written yet.'}</p>}
  </div>;
}

/** A box that sends one message, for a conversation that has no chat of its own yet. */
/** A chat with nothing in it yet: two faint bubbles, and what to do. */
export function EmptyChat({ name }: { name: string }) {
  return <div className="pl-empty-chat">
    <div className="pl-bubbles" aria-hidden="true"><i className="pl-bubble them" /><i className="pl-bubble you" /></div>
    <p className="pl-hello">Send {name} your first message</p>
  </div>;
}

export function SendBox({ placeholder, note, onSend, empty }: {
  placeholder: string; note?: string | null; empty?: ReactNode;
  /** Null once it went, or the reason it did not. */
  onSend: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    const words = text.trim();
    if (!words || busy) return;
    setBusy(true);
    const failed = await onSend(words);
    setBusy(false);
    if (failed) { setError(failed); return; }
    setError(null);
    setText('');
  };
  return <div className="pl-send">
    <div className="pl-send-empty">{empty}</div>
    {error && <p className="tq-error" role="alert">{error}</p>}
    <div className="rm-compose tq-compose pl-first">
      <textarea className="rm-compose-input" autoFocus rows={1} value={text} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
      <div className="rm-compose-bar">
        <button type="button" className="dock-send" disabled={!text.trim() || busy} title={`Send · ${sendKeyFor(true)}`} onClick={() => { void send(); }}>Send <kbd>{sendKeyFor(true)}</kbd></button>
      </div>
    </div>
    {note && <p className="pl-note">{note}</p>}
  </div>;
}

/** A button on a place's header. */
export function PlaceAction({ children, onClick, quiet = false, title }: { children: ReactNode; onClick: () => void; quiet?: boolean; title?: string }) {
  return <button type="button" className={`pl-btn${quiet ? ' quiet' : ''}`} onClick={onClick} title={title}>{children}</button>;
}

/** Their AI teammates, under a person's lists: a face and a name each, which open its own place. */
export function PlaceMates({ title, mates, waits, onPick }: { title: string; mates: Member[]; waits?: ReadonlyMap<string, number>; onPick: (key: string) => void }) {
  if (!mates.length) return null;
  return <div className="pl-sec pl-mates">
    <h3>{title}</h3>
    {mates.map((t) => <button type="button" key={t.key} className="pl-mate" onClick={() => onPick(t.key)}>
      <MemberFace m={t} size={24} /><span className="rm-one">{t.name}</span><MemberWord m={t} waits={waits?.get(t.key) ?? 0} />
    </button>)}
  </div>;
}
