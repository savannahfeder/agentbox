// A person's or an AI teammate's place: your conversation with them, with
// small buttons over it that open their work and job, and the few things you
// do with them in the header.
import { useEffect, useState, type ReactNode } from 'react';
import { agoQuiet } from '../../format';
import { sendKeyFor } from '../../reply-keys';
import { MemberFace, MemberWord } from './TeamStrip';
import type { Member } from './members';

const BACK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;

/** One button over a place's chat: a list or the job, shown in the chat's place, or a page it goes to. */
export type PlacePart = { key: string; label: string; count?: number; ask?: boolean; body?: ReactNode; onOpen?: () => void };

export function Place({ m, waits = 0, about, onBack, backTo, actions, chat, parts = [] }: {
  m: Member; waits?: number;
  /** Under the name: their role, or whose AI teammate it is. */
  about?: string | null;
  /** Absent inside Chats, where the list beside it is the way back. */
  onBack?: () => void; backTo?: string;
  actions?: ReactNode; chat: ReactNode; parts?: PlacePart[];
}) {
  const [view, setView] = useState<{ of: string; key: string } | null>(null);
  const shown = view?.of === m.key ? parts.find((p) => p.key === view.key && p.body) ?? null : null;
  useEffect(() => {
    if (!shown) return undefined;
    // Esc goes back to the chat, unless it is ending an edit in a box first.
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement | null)?.closest?.('textarea, input')) return;
      e.stopPropagation(); setView(null);
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [shown]);
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
    {parts.length > 0 && <div className="pl-parts" role="tablist" aria-label={m.name}>
      <button type="button" role="tab" aria-selected={!shown} className="pl-btn pl-chip" onClick={() => setView(null)}>Chat</button>
      {parts.map((p) => <button type="button" key={p.key} role={p.body ? 'tab' : undefined} aria-selected={p.body ? shown === p : undefined}
        className={`pl-btn pl-chip${p.ask ? ' ask' : ''}`}
        onClick={() => { if (p.onOpen) p.onOpen(); else setView({ of: m.key, key: p.key }); }}>
        {p.ask && <i aria-hidden="true" />}{p.label}{p.count != null && <b>{p.count}</b>}
      </button>)}
    </div>}
    <div className="pl-body">
      <div className={`pl-chat${shown ? ' away' : ''}`}>{chat}</div>
      {shown && <div className="pl-view" role="tabpanel" aria-label={shown.label}>{shown.body}</div>}
    </div>
  </section>;
}

export type PlaceRow = { key: string; title: string; word: string; at: number; tone?: 'work' | 'ask' | 'hold' | 'done' | 'later'; onOpen?: () => void };

/** A list as a button over the chat, or no button when it is empty. */
export function listPart(label: string, rows: PlaceRow[], now: number, { ask = false }: { ask?: boolean } = {}): PlacePart[] {
  return rows.length ? [{ key: label, label, count: rows.length, ask, body: <PlaceRows rows={rows} now={now} /> }] : [];
}

function PlaceRows({ rows, now }: { rows: PlaceRow[]; now: number }) {
  return <ul className="pl-rows">{rows.map((r) => <li key={r.key}>
    <button type="button" className={`pl-row ${r.tone ?? 'work'}`} onClick={r.onOpen} disabled={!r.onOpen} title={r.title}>
      <i aria-hidden="true" /><span className="pl-t">{r.title}</span>
      <span className="pl-at">{agoQuiet(r.at, now)}</span>
      {r.word && <span className="pl-w">{r.word}</span>}
    </button>
  </li>)}</ul>;
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

/** A chat with nothing in it yet: two faint bubbles, and what to do. */
export function EmptyChat({ name }: { name: string }) {
  return <div className="pl-empty-chat">
    <div className="pl-bubbles" aria-hidden="true"><i className="pl-bubble them" /><i className="pl-bubble you" /></div>
    <p className="pl-hello">Send {name} your first message</p>
  </div>;
}

/** A chat not started yet: what to do, over the chat's own box. */
export function ChatStart({ empty, box }: { empty: ReactNode; box: ReactNode }) {
  return <div className="pl-send">
    <div className="pl-send-empty">{empty}</div>
    {box}
  </div>;
}

/** A box that sends one message, for a conversation that has no chat of its own. */
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

/** Their AI teammates as a button over the chat: a face and a name each, which open its own place. */
export function matesPart(label: string, mates: Member[], waits: ReadonlyMap<string, number> | undefined, onPick: (key: string) => void): PlacePart[] {
  if (!mates.length) return [];
  return [{ key: 'mates', label, count: mates.length, body: <div className="pl-mates">
    {mates.map((t) => <button type="button" key={t.key} className="pl-mate" onClick={() => onPick(t.key)}>
      <MemberFace m={t} size={24} /><span className="rm-one">{t.name}</span><MemberWord m={t} waits={waits?.get(t.key) ?? 0} />
    </button>)}
  </div> }];
}
