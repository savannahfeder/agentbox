// Notes beside a file opened full screen from its thread: you select words or
// pin a spot on a page, write as much as you like, attach files, and Send hands
// every waiting note to the agent at once (main/notes-wake.mts noteToItsAgent).
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Face, TeamContext } from '../team/people';
import { clock, type LedgerLine } from '../thread-history';
import type { FileElsewhere, FileNote, NotePlace, Person, TableCell, WorkItem } from '../types';
import { isTablePath } from '../table-file';
import { whoseIsTheFile } from '../../../shared/artifact-marks.mts';
import { attachProblem, fromPaste, persistAttachments, useAttaching, type PendingAttachment } from '../attachments';
import { notePictures, noteWithPictures } from '../note-pictures';
import { canPaintQuotes, cellAround, paintQuotes } from '../paint-quotes';
import { fileFamilyFor, notesBesideCount, notesCanPoint, noteAttachments, sentTimes, sidebarNotes } from '../notes-sidebar';
import { noteSendWords, pinLabel, pinsToDraw, whereANoteGoes, whoTalksOnFile } from '../artifact-pins';
import { AttachRow } from './AttachRow';
import { NotePictureShown } from './FileNoteCard';
import { NoteGlyph } from './NoteGlyphs';
import { PinMarks, spotIn } from './PinMarks';
import { FrameWordsBar, SelectionBar } from './SelectionBar';
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

/**
 * Beside the chat, where notes are not drawn: the same corner mark, counting the
 * file's notes, every copy's included, and pressing it opens them full screen.
 */
export function NotesBesideMark({ item, src, onOpen }: { item: WorkItem; src: string; onOpen: () => void }) {
  const [lines, setLines] = useState<LedgerLine[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => { void api.itemHistory({ product: item.product, id: item.id }).then((r) => { if (live) setLines(r?.lines ?? []); }); };
    read();
    const off = api.onChanged(read);
    return () => { live = false; off?.(); };
  }, [item.product, item.id]);
  const { fileIds, copies } = useMemo(() => fileFamilyFor(lines, src), [lines, src]);
  const copiesKey = JSON.stringify(copies);
  const [elsewhere, setElsewhere] = useState<FileElsewhere[]>([]);
  useEffect(() => {
    if (!copies.length) { setElsewhere([]); return undefined; }
    let live = true;
    void api.fileElsewhere({ product: item.product, id: item.id, copies }).then((all) => { if (live) setElsewhere(all); });
    return () => { live = false; };
  }, [item.product, item.id, copiesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <NotesToggle open={false} waiting={notesBesideCount(item.artifacts?.notes ?? [], fileIds, elsewhere)} onToggle={onOpen} />;
}

type Quote = { text: string; cell?: TableCell };

const Quoted = ({ quote }: { quote: Quote }) => (
  <span className="sb-quote">{quote.text}{quote.cell && <span className="sb-cell"> in row {quote.cell.row}, {quote.cell.column}</span>}</span>
);

function SidebarNote({ note, product, on, who, person, me, sentAt, onGo }: {
  note: FileNote; product: string; on: boolean; who: string; person: Person | null; me: boolean; sentAt?: number; onGo: () => void;
}) {
  const said = notePictures(note.text);
  const { words, files } = noteAttachments(said.words);
  return (
    <button type="button" className={`sb-note${on ? ' is-on' : ''}${note.sent ? ' is-sent' : ''}${note.saving ? ' is-saving' : ''}`} onClick={onGo}>
      <span className="sb-meta">
        <Face person={person} name={person ? undefined : who} me={me} />
        <span className="sb-who">{who}</span>
        {note.place.kind === 'pin' && <span className="av-pin-tag sb-pin">{pinLabel(note)}</span>}
        <span className="sb-when">{note.sent && <NoteGlyph name="check" />}{note.sent && sentAt ? `Sent ${clock(sentAt)}` : clock(note.ts)}</span>
      </span>
      {note.place.kind === 'quote' && <Quoted quote={note.place} />}
      {words && <span className="sb-text">{words}</span>}
      {said.pictures.length > 0 && <span className="sb-pictures">{said.pictures.map((p) => <NotePictureShown key={p.src} product={product} picture={p} />)}</span>}
      {files.length > 0 && <span className="sb-files">{files.map((f) => <span key={f.src} className="sb-file">{f.name}</span>)}</span>}
    </button>
  );
}

/** `asked`: a table cell whose Comment was chosen, for the note box; `onAsked` says it was taken. */
export function NotesSidebar({ item, src, asked, onAsked }: { item: WorkItem; src: string; asked?: Quote | null; onAsked?: () => void }) {
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

  const { version, fileIds, files } = useMemo(() => fileFamilyFor(lines, src), [lines, src]);

  const [pending, setPending] = useState<FileNote[]>([]);
  const stored = item.artifacts?.notes ?? [];
  const all = [...stored, ...pending.filter((p) => !stored.some((n) => n.id === p.id))];
  const { waiting, said } = sidebarNotes(all, fileIds, people);
  const canSend = typeof version?.agent === 'string';
  const sentAt = useMemo(() => sentTimes(lines), [lines]);
  const authors = [...new Set([...waiting, ...said].map((n) => n.by))].slice(0, 3);
  const noteTo = {
    people, me, agentMade: canSend, toAgent: canSend,
    owner: version ? whoseIsTheFile(files, version.id) : null, threadOwner: item.runner ?? item.createdBy ?? null,
    talking: whoTalksOnFile(all, fileIds, me),
  };

  const aside = useRef<HTMLElement | null>(null);
  const page = useRef<HTMLElement | null>(null);
  const [pageAt, setPageAt] = useState(0);
  // A page is drawn in a frame on a sheet as tall as itself (DocPane PinSheet); pins go on the sheet.
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const [whole, setWhole] = useState(false);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [sheetSize, setSheetSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const card = aside.current?.closest('.doc-card');
    if (!card) return;
    const find = () => {
      const found = card.querySelector<HTMLElement>('.doc-rich-content, .code-scroll, .tbl');
      if (found !== page.current) { page.current = found; setPageAt((n) => n + 1); }
      const on = card.querySelector<HTMLElement>('.doc-pin-sheet');
      setSheet(on);
      setWhole(!!on?.hasAttribute('data-whole'));
      setFrame(on?.querySelector('iframe') ?? null);
    };
    find();
    const watch = new MutationObserver(find);
    watch.observe(card, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-whole'] });
    return () => watch.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!sheet) return undefined;
    const measure = () => setSheetSize({ w: sheet.clientWidth, h: sheet.clientHeight });
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(sheet);
    return () => seen.disconnect();
  }, [sheet]);

  const points = notesCanPoint(src);
  const pinsHere = points.spots && whole ? sheet : null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const table = isTablePath(src);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const pinNotes = [...waiting, ...said].filter((n) => n.place.kind === 'pin');
  const pins = pinsToDraw(pinNotes, [], activeId);
  useEffect(() => {
    if (!pinning) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPinning(false); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [pinning]);
  const ranges = useRef(new Map<string, Range>());
  const quotes = [...waiting, ...said].flatMap((n) => (n.place.kind === 'quote' ? [{ id: n.id, text: n.place.text, cell: n.place.cell }] : []));
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
    if (note.place.kind === 'pin' && pinsHere) {
      const box = pinsHere.parentElement;
      box?.scrollTo({ top: note.place.y * pinsHere.clientHeight - box.clientHeight / 2, behavior: 'smooth' });
      return;
    }
    ranges.current.get(note.id)?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const pointAt = (q: Quote | null, s: { x: number; y: number } | null) => {
    setQuote(q); setSpot(s); setPinning(false);
    if (q || s) requestAnimationFrame(() => box.current?.focus());
  };

  const [words, setWords] = useState('');
  const sendWords = noteSendWords({ ...noteTo, text: words, nameOf: whoSaid });
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
  useEffect(() => {
    if (!asked) return;
    setQuote(asked);
    onAsked?.();
    requestAnimationFrame(() => box.current?.focus());
  }, [asked]);
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
    const place: NotePlace = spot ? { kind: 'pin', x: spot.x, y: spot.y } : quote ? { kind: 'quote', ...quote } : { kind: 'whole' };
    const id = newId();
    const owner = whoseIsTheFile(files, version.id);
    const goes = whereANoteGoes({ ...noteTo, text: typed });
    const mentions = goes.to === 'person' ? [goes.person] : [];
    const kept = { words, quote, spot, pictures };
    const pin = spot ? { pin: pinNotes.length + 1 } : {};
    setPending((was) => [...was, { id, file: version.id, place, text, by: me, ts: Date.now(), mentions, owner: null, uid: null, wait: true, saving: true, ...pin }]);
    setWords(''); setQuote(null); setSpot(null); setPictures([]); setTrouble(null);
    const out = await api.fileMark({ product: item.product, id: item.id, mark: { do: 'note', id, file: version.id, place, text, wait: true, ...(mentions.length ? { mentions } : {}), ...(owner ? { owner } : {}) } })
      .catch((err: Error) => ({ ok: false, error: err.message }));
    setSending(false);
    // Kept, so Send can take it before the thread's own copy catches up.
    if (out.ok) setPending((was) => was.map((n) => (n.id === id ? { ...n, saving: false } : n)));
    else {
      setPending((was) => was.filter((n) => n.id !== id));
      setWords(kept.words); setQuote(kept.quote); setSpot(kept.spot); setPictures(kept.pictures);
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
    <SidebarNote key={n.id} note={n} product={item.product} on={n.id === activeId} who={whoSaid(n.by)} person={person(n.by)} me={!!me && n.by === me} sentAt={sentAt.get(n.id)} onGo={() => goTo(n)} />
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
        <div className={`sb-write${quote || spot ? ' has-quote' : ''}`}
          onClick={(e) => { if (e.target === e.currentTarget) box.current?.focus(); }}
          onDragOver={canAttach ? (e) => e.preventDefault() : undefined}
          onDrop={canAttach ? (e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); } : undefined}>
          {(quote || spot) && (
            <div className="sb-write-quote">
              {spot ? <span className="sb-pin-draft"><span className="av-pin-tag sb-pin">{pinNotes.length + 1}</span></span> : quote && <Quoted quote={quote} />}
              <button type="button" className="sb-icon" aria-label={`Note the whole ${table ? 'table' : 'page'} instead`} title={`Note the whole ${table ? 'table' : 'page'} instead`} onClick={() => pointAt(null, null)}><Glyph d="M4 4l8 8M12 4l-8 8" /></button>
            </div>
          )}
          <textarea ref={box} rows={1} value={words} aria-label="Note"
            placeholder={spot ? 'Your note on this spot' : quote ? 'Your note on these words' : pinning ? 'Click a spot on the page'
              : pinsHere ? 'Add a note, select words or pin a spot' : table ? 'Add a note, or right-click a cell'
              : page.current || points.words ? 'Add a note, or select words in the page' : 'Add a note'}
            onChange={(e) => setWords(e.target.value)}
            onPaste={canAttach ? async (e) => {
              if (![...e.clipboardData.items].some((i) => i.kind === 'file')) return;
              e.preventDefault();
              const got = await fromPaste(e);
              if (got.length) setPictures((was) => [...was, ...got]);
            } : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void add(); }
              // The app ignores Escape inside a box, so letting go of it is what lets the next one leave full screen.
              else if (e.key === 'Escape') { e.preventDefault(); if (quote || spot || pinning) pointAt(null, null); else e.currentTarget.blur(); }
            }} />
          <AttachRow attachments={pictures} attaching={attaching} onRemove={(i) => setPictures((was) => was.filter((_, j) => j !== i))} />
          <div className="sb-write-foot">
            {canAttach && <>
              <button type="button" className="sb-icon" title="Attach files" aria-label="Attach files" onClick={() => fileInput.current?.click()}><Glyph d="M10.5 4.5 5.2 9.8a1.6 1.6 0 0 0 2.3 2.3l5.6-5.6a3 3 0 0 0-4.2-4.2L3.3 7.9a4.4 4.4 0 0 0 6.2 6.2l4-4" /></button>
              <input ref={fileInput} type="file" multiple hidden onChange={async (e) => { await addFiles(e.target.files); e.target.value = ''; }} />
            </>}
            {pinsHere && (
              <button type="button" className={`sb-icon${pinning ? ' is-on' : ''}`} aria-pressed={pinning}
                title={pinning ? 'Click a spot on the page' : 'Pin a spot'} aria-label="Pin a spot" onClick={() => setPinning(!pinning)}>
                <Glyph d="M8 9.2V14M3.5 7a4.5 4.5 0 0 1 9 0M10.2 7a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0" />
              </button>
            )}
            <span className="sb-spring" />
            <button type="submit" className="sb-add" title={`${sendWords} (return)`} aria-label={sendWords}
              disabled={(!words.trim() && !pictures.length) || sending || attaching.length > 0 || !!attachProblem(pictures)}>
              <ReturnGlyph />
            </button>
          </div>
        </div>
      </form>
      <SelectionBar page={page} onComment={(q, at) => pointAt({ text: q, cell: cellAround(at) }, null)} />
      {points.words && frame && <FrameWordsBar frame={frame} onComment={(q) => pointAt({ text: q }, null)} />}
      {pinsHere && createPortal(<>
        {pinning && <div className="doc-pin-catch" onClick={(e) => pointAt(null, spotIn(e.currentTarget, e))} />}
        <div className="doc-pin-marks">
          <PinMarks pins={pins} draft={spot} draftLabel={String(pinNotes.length + 1)} size={sheetSize} onPick={(id) => setActiveId(id)} />
        </div>
      </>, pinsHere)}
    </aside>
  );
}
