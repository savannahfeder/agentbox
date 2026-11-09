// Notes beside a document opened full screen from its thread: you select words,
// write as much as you like, attach files, and Send hands every waiting note
// to the agent at once (main/notes-wake.mts noteToItsAgent).
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Face, TeamContext } from '../team/people';
import { clock, type LedgerLine } from '../thread-history';
import type { FileNote, NotePlace, Person, WorkItem } from '../types';
import { notedFilesInLines, threadFiles, versionForPath, whoseIsTheFile } from '../../../shared/artifact-marks.mts';
import { attachProblem, fromPaste, persistAttachments, useAttaching, type PendingAttachment } from '../attachments';
import { notePictures, noteWithPictures } from '../note-pictures';
import { canPaintQuotes, paintQuotes } from '../paint-quotes';
import { noteAttachments, sidebarNotes } from '../notes-sidebar';
import { AttachRow } from './AttachRow';
import { NotePictureShown } from './FileNoteCard';
import { NoteGlyph } from './NoteGlyphs';
import { SelectionBar } from './SelectionBar';
import './notes-sidebar.css';

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const Glyph = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** "Notes 7" and the faces of who wrote them; the big viewer's column has the same one. */
export function NotesHead({ count, faces }: { count: number; faces?: ReactNode }) {
  return (
    <div className="sb-head">
      <span className="sb-title">Notes</span>
      {count > 0 && <span className="sb-count">{count}</span>}
      {faces && <span className="sb-faces">{faces}</span>}
    </div>
  );
}

/** A section's name over its notes, with Send on the Unsent line. */
export function NotesSection({ word, send }: { word: string; send?: { count: number; onSend: () => void } }) {
  return (
    <div className="sb-sec">
      <span className="doc-outline-head">{word}</span>
      {send && <button type="button" className="sb-send" onClick={send.onSend}><Glyph d="M2.5 8h9M8 4.5 11.5 8 8 11.5" />Send {send.count}</button>}
    </div>
  );
}

export const ReturnGlyph = () => <Glyph d="M12.5 3.5v5h-9M6 5.5 3.5 8.5 6 11.5" />;

/** The corner mark that opens and closes the sidebar; closed, it counts the notes not sent yet. */
export function NotesToggle({ open, waiting, onToggle }: { open: boolean; waiting: number; onToggle: () => void }) {
  return (
    <button type="button" className={`doc-mark notes-toggle${open ? ' is-on' : ''}`} aria-pressed={open}
      title={open ? 'Hide notes' : 'Show notes'} onClick={onToggle}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx=".5" /><path d="M10 3v10" /></svg>
      {!open && waiting > 0 && <span className="notes-toggle-count">{waiting}</span>}
    </button>
  );
}

function SidebarNote({ note, product, on, who, person, me, onGo }: {
  note: FileNote; product: string; on: boolean; who: string; person: Person | null; me: boolean; onGo: () => void;
}) {
  const said = notePictures(note.text);
  const { words, files } = noteAttachments(said.words);
  return (
    <button type="button" className={`sb-note${on ? ' is-on' : ''}${note.sent ? ' is-sent' : ''}${note.saving ? ' is-saving' : ''}`} onClick={onGo}>
      <span className="sb-meta">
        <Face person={person} name={person ? undefined : who} me={me} />
        <span className="sb-who">{who}</span>
        <span className="sb-when">{note.sent && <NoteGlyph name="check" />}{note.sent ? 'Sent ' : ''}{clock(note.ts)}</span>
      </span>
      {note.place.kind === 'quote' && <span className="sb-quote">{note.place.text}</span>}
      {words && <span className="sb-text">{words}</span>}
      {said.pictures.length > 0 && <span className="sb-pictures">{said.pictures.map((p) => <NotePictureShown key={p.src} product={product} picture={p} />)}</span>}
      {files.length > 0 && <span className="sb-files">{files.map((f) => <span key={f.src} className="sb-file">{f.name}</span>)}</span>}
    </button>
  );
}

export function NotesSidebar({ item, src }: { item: WorkItem; src: string }) {
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const people = useMemo<Person[]>(() => (team ? [...team.byId.values()] : []), [team]);
  const person = (id: string | null) => (id ? team?.byId.get(id) ?? null : null);
  const whoSaid = (id: string | null) => (id === me ? 'You' : String(person(id)?.name ?? 'Someone').split(/\s+/)[0]);

  const [lines, setLines] = useState<LedgerLine[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => { void api.itemHistory({ product: item.product, id: item.id }).then((r) => { if (live) setLines(r?.lines ?? []); }); };
    read();
    const off = api.onChanged(read);
    return () => { live = false; off?.(); };
  }, [item.product, item.id]);

  // The version this document is on the thread's file line, or a line of its own when no message named it.
  const { version, fileIds, files } = useMemo(() => {
    const asked = src.replace(/^\.\//, '');
    const said = notedFilesInLines(lines);
    const named = versionForPath(threadFiles(said), asked);
    const all = named ? said : [...said, { path: asked, by: null, at: 0 }];
    const families = threadFiles(all);
    const v = named ?? versionForPath(families, asked);
    const family = v ? families.find((f) => f.versions.some((x) => x.id === v.id)) : null;
    return { version: v, fileIds: family ? family.versions.map((x) => x.id) : [], files: all };
  }, [lines, src]);

  const [pending, setPending] = useState<FileNote[]>([]);
  const stored = item.artifacts?.notes ?? [];
  const all = [...stored, ...pending.filter((p) => !stored.some((n) => n.id === p.id))];
  const { waiting, said } = sidebarNotes(all, fileIds, people);
  const canSend = typeof version?.agent === 'string';
  const authors = [...new Set([...waiting, ...said].map((n) => n.by))].slice(0, 3);

  const aside = useRef<HTMLElement | null>(null);
  const page = useRef<HTMLElement | null>(null);
  const [pageAt, setPageAt] = useState(0);
  useEffect(() => {
    const card = aside.current?.closest('.doc-card');
    if (!card) return;
    const find = () => {
      const found = card.querySelector<HTMLElement>('.doc-rich-content, .code-scroll');
      if (found !== page.current) { page.current = found; setPageAt((n) => n + 1); }
    };
    find();
    const watch = new MutationObserver(find);
    watch.observe(card, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const ranges = useRef(new Map<string, Range>());
  const quotes = [...waiting, ...said].filter((n) => n.place.kind === 'quote').map((n) => ({ id: n.id, text: (n.place as { text: string }).text }));
  const quotesKey = JSON.stringify(quotes);
  useEffect(() => {
    const root = page.current;
    if (!root || !canPaintQuotes()) return;
    let frame = 0;
    const paint = () => { ranges.current = paintQuotes(root, quotes, activeId, quote); };
    paint();
    // The page is an editor, so typing redraws it and the painted ranges with it.
    const again = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); });
    again.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { again.disconnect(); cancelAnimationFrame(frame); };
  }, [pageAt, quotesKey, activeId, quote]);
  useEffect(() => () => {
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    highlights?.delete('av-quote'); highlights?.delete('av-quote-on');
  }, []);

  const goTo = (note: FileNote) => {
    setActiveId(note.id);
    ranges.current.get(note.id)?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const [words, setWords] = useState('');
  const [pictures, setPictures] = useState<PendingAttachment[]>([]);
  const { attaching, collect } = useAttaching();
  const [sending, setSending] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.45))}px`;
  }, [words]);
  const canAttach = !!window.zero?.saveAttachments;
  const addFiles = async (list: FileList | File[] | null) => {
    if (!list?.length) return;
    const got = await collect(list);
    if (got.length) setPictures((was) => [...was, ...got]);
  };

  const add = async () => {
    const typed = words.trim();
    if ((!typed && !pictures.length) || !version || sending || attaching.length) return;
    setSending(true);
    let links = '';
    try { links = await persistAttachments(item.product, pictures); } catch (err) {
      setSending(false);
      setTrouble((err as Error).message || 'Those files did not save.');
      return;
    }
    const text = noteWithPictures(typed, links);
    const place: NotePlace = quote ? { kind: 'quote', text: quote } : { kind: 'whole' };
    const id = newId();
    const owner = whoseIsTheFile(files, version.id);
    const kept = { words, quote, pictures };
    setPending((was) => [...was, { id, file: version.id, place, text, by: me, ts: Date.now(), mentions: [], owner: null, uid: null, wait: true, saving: true }]);
    setWords(''); setQuote(null); setPictures([]); setTrouble(null);
    const out = await api.fileMark({ product: item.product, id: item.id, mark: { do: 'note', id, file: version.id, place, text, wait: true, ...(owner ? { owner } : {}) } })
      .catch((err: Error) => ({ ok: false, error: err.message }));
    setSending(false);
    // Kept, so Send can take it before the thread's own copy catches up.
    if (out.ok) setPending((was) => was.map((n) => (n.id === id ? { ...n, saving: false } : n)));
    else {
      setPending((was) => was.filter((n) => n.id !== id));
      setWords(kept.words); setQuote(kept.quote); setPictures(kept.pictures);
      setTrouble(out.error ?? 'That note did not save.');
    }
  };

  const send = async () => {
    const on = waiting.filter((n) => !n.saving).map((n) => n.id);
    if (!on.length) return;
    const out = await api.fileMark({ product: item.product, id: item.id, mark: { do: 'toagent', on } }).catch((err: Error) => ({ ok: false, error: err.message }));
    setTrouble(out.ok ? null : out.error ?? 'Those notes did not reach the agent.');
  };

  const note = (n: FileNote) => (
    <SidebarNote key={n.id} note={n} product={item.product} on={n.id === activeId} who={whoSaid(n.by)} person={person(n.by)} me={!!me && n.by === me} onGo={() => goTo(n)} />
  );

  return (
    <aside ref={aside} className="sb" aria-label="Notes">
      <NotesHead count={waiting.length + said.length}
        faces={authors.length > 0 && authors.map((id) => <Face key={id ?? 'me'} person={person(id)} name={person(id) ? undefined : whoSaid(id)} me={!!me && id === me} />)} />
      <div className="sb-list">
        {waiting.length > 0 && <>
          <NotesSection word={canSend ? 'Unsent' : 'Notes'} send={canSend ? { count: waiting.length, onSend: () => void send() } : undefined} />
          {waiting.map(note)}
        </>}
        {said.length > 0 && <>
          <NotesSection word={canSend ? 'Sent' : 'Notes'} />
          {said.map(note)}
        </>}
      </div>
      {trouble && <p className="sb-trouble" role="alert">{trouble}</p>}
      <form className="sb-foot" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className={`sb-write${quote ? ' has-quote' : ''}`}
          onClick={(e) => { if (e.target === e.currentTarget) box.current?.focus(); }}
          onDragOver={canAttach ? (e) => e.preventDefault() : undefined}
          onDrop={canAttach ? (e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); } : undefined}>
          {quote && (
            <div className="sb-write-quote">
              <span className="sb-quote">{quote}</span>
              <button type="button" className="sb-icon" aria-label="Note the whole page instead" title="Note the whole page instead" onClick={() => setQuote(null)}><Glyph d="M4 4l8 8M12 4l-8 8" /></button>
            </div>
          )}
          <textarea ref={box} rows={1} value={words} aria-label="Note"
            placeholder={quote ? 'Your note on these words' : page.current ? 'Add a note, or select words in the page' : 'Add a note'}
            onChange={(e) => setWords(e.target.value)}
            onPaste={canAttach ? async (e) => {
              if (![...e.clipboardData.items].some((i) => i.kind === 'file')) return;
              e.preventDefault();
              const got = await fromPaste(e);
              if (got.length) setPictures((was) => [...was, ...got]);
            } : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void add(); }
            }} />
          <AttachRow attachments={pictures} attaching={attaching} onRemove={(i) => setPictures((was) => was.filter((_, j) => j !== i))} />
          <div className="sb-write-foot">
            {canAttach && <>
              <button type="button" className="sb-icon" title="Attach files" aria-label="Attach files" onClick={() => fileInput.current?.click()}><Glyph d="M10.5 4.5 5.2 9.8a1.6 1.6 0 0 0 2.3 2.3l5.6-5.6a3 3 0 0 0-4.2-4.2L3.3 7.9a4.4 4.4 0 0 0 6.2 6.2l4-4" /></button>
              <input ref={fileInput} type="file" multiple hidden onChange={async (e) => { await addFiles(e.target.files); e.target.value = ''; }} />
            </>}
            <span className="sb-spring" />
            <button type="submit" className="sb-add" title="Add note (return)" aria-label="Add note"
              disabled={(!words.trim() && !pictures.length) || sending || attaching.length > 0 || !!attachProblem(pictures)}>
              <ReturnGlyph />
            </button>
          </div>
        </div>
      </form>
      <SelectionBar page={page} onComment={(q) => { setQuote(q); requestAnimationFrame(() => box.current?.focus()); }} />
    </aside>
  );
}
