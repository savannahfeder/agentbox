// A FILE OPENED BIG: the file filling the window, its comments down the right,
// the thread's name and the version above, Escape back. One view for the owner
// and for teammates; only where a comment is written differs (`write`).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  addressedTo, approvalSince, approveAsk, carriedNotes, editClash, familyName, filesInLines, fileNewsFor, noteGoesTo, notesForTheAgent, otherFilesInLines, placeWords, reviewKind, sharedByWords, threadFiles, versionForPath, viewKind, whereAPressLands, whoseIsTheFile,
} from '../../../shared/artifact-marks.mjs';
import type { FileVersion } from '../../../shared/artifact-marks.mjs';
import { api } from '../api';
import { canPaintQuotes, paintQuotes } from '../paint-quotes';
import { firstName, Face } from '../team/people';
import { clock, type LedgerLine } from '../thread-history';
import type { ArtifactMark, FileMarks, FileNote, NotePlace, Person } from '../types';
import { hasSpot, notePlaceWords, otherFilesOpen, pageSpot, PIN_FRAME_S, pinned, viewOffers, type Found } from '../artifact-pins';
import { commentsInList, notesWithSaving, settleLocally, UNDO_MS } from '../note-saving';
import { ArtifactStage, StageThread, type StageFiles, type StageGo } from './ArtifactStage';
import { OpeningWait } from './OpeningWait';
import { CrossIcon } from './CrossIcon';
import { DocText } from './DocText';
import './artifact-view.css';

export interface ArtifactOpen { path?: string; file?: string; note?: string; at?: number }

// One sitting is one version: a save per pause in typing would bury the chain.
const SAVE_AFTER_A_PAUSE_MS = 30_000;
type Editing = { text: string; draft?: string; top: number; folder: string | null; base: ReturnType<typeof threadFiles>[number]['versions'][number] };

export const NO_MARKS: FileMarks = { notes: [], approvals: [], seen: {} };

const clockAt = clock;
const whenShared = (ts: number) => (new Date(ts).toDateString() === new Date().toDateString()
  ? `today at ${clockAt(ts)}` : new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }));
const KIND_WORD = { image: 'Picture', film: 'Film', pdf: 'PDF', deck: 'Slides', markdown: 'Document', page: 'Page', code: 'Code' } as const;

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function Note({ note, wordsGone, active, settling, person, me, onGo, onSettle, nameOf, replying, onReplying, onReply, canReply, held, onToAgent }: {
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

export function ArtifactView({ product, thread, threadName, lines, numbers, marks, me, people, open, ownerOfRow, write, withAgent = false, onNewVersion, editGoes, missingSays, onClose, onOutside, below, files: fromElsewhere }: {
  /** Each path's number on its file's version line, which every surface counts by. */
  numbers?: Record<string, number>;
  /** What to say of a version with no bytes on this computer, by who made it. */
  missingSays?: (by: string | null) => string;
  /** For a file kept outside any project, such as one in a group chat. */
  files?: StageFiles;
  product: string;
  /** The thread whose files these are, so a name opens that thread's own file. */
  thread?: string;
  threadName: string;
  lines: LedgerLine[];
  marks: FileMarks;
  me: string | null;
  /** Who can be named here. Empty with nobody else on the thread. */
  people: Person[];
  open: ArtifactOpen;
  ownerOfRow: string | null;
  write: (mark: ArtifactMark) => Promise<{ ok: boolean; error?: string }>;
  /** Only on a thread with an agent, on the owner's own computer. */
  withAgent?: boolean;
  /** Posts edited words as the next version of a document. Null when it went, else why not. */
  onNewVersion?: (name: string, text: string, path: string, id: string) => Promise<string | null>;
  /** Said after a save that only becomes a version on someone else's computer. */
  editGoes?: string;
  onClose: () => void;
  onOutside?: (path: string) => void;
  /** A line under the file, the full width of the window. */
  below?: ReactNode;
}) {
  const files = useMemo(() => {
    const reviewed = filesInLines(lines);
    const others = otherFilesInLines(lines);
    // Lines that name nothing else are Files opening this one script or page.
    const said = [...reviewed, ...(reviewed.length ? otherFilesOpen(others, open.path, marks.notes) : others)];
    // A note on a page the thread never linked opens that page by its name, never the thread's last file.
    const noted = open.note ? marks.notes.find((n) => n.id === open.note)?.file : undefined;
    const path = open.path?.replace(/^\.\//, '') ?? (noted && !/[#@]\d+$/.test(noted) ? noted : undefined);
    return path && !versionForPath(threadFiles(said), path) && viewKind(path) ? [...said, { path, by: null, at: 0 }] : said;
  }, [lines, open.path, open.note, marks.notes]);
  const families = useMemo(() => threadFiles(files, numbers), [files, numbers]);
  const flat = useMemo(() => families.flatMap((f, fi) => f.versions.map((v, vi) => ({ fi, vi, v }))), [families]);

  const [at, setAt] = useState<{ fi: number; vi: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(open.note ?? null);
  const [go, setGo] = useState<StageGo>(null);
  const [draftPlace, setDraftPlace] = useState<NotePlace | null>(null);
  const [here, setHere] = useState<NotePlace | null>(null);
  const [words, setWords] = useState('');
  const [named, setNamed] = useState<Person[]>([]);
  const [asking, setAsking] = useState<{ start: number; query: string; sel: number } | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [compare, setCompare] = useState(false);
  const [leftVi, setLeftVi] = useState<number | null>(null);
  const [hold, setHold] = useState(0);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [found, setFound] = useState<Found>('looking');
  const box = useRef<HTMLTextAreaElement | null>(null);
  const placedFor = useRef<string | null>(null);
  const inHand = useRef<string | null>(null);

  // Where the press wants to land, once the thread's files are read. The picked
  // comment's file wins, then the file, then the path.
  useEffect(() => {
    // Once per press: a version arriving later must not pull the view off the page in hand.
    const press = `${open.at ?? 0}:${!!marks.notes.find((n) => n.id === open.note)}:${lines.length > 0}`;
    if (!flat.length) return;
    if (placedFor.current === press) {
      const same = flat.find((x) => x.v.id === inHand.current);
      if (same) setAt({ fi: same.fi, vi: same.vi });
      return;
    }
    placedFor.current = press;
    const wanted = open.note ? marks.notes.find((n) => n.id === open.note)?.file : open.file;
    // A press names one file at one version and opens exactly that, or waits.
    const hit = whereAPressLands(families, { path: open.path, file: wanted });
    if (!hit) return;
    setAt(hit);
    const note = open.note ? marks.notes.find((n) => n.id === open.note) : null;
    if (note) { setActiveId(note.id); if (note.resolved) setShowSettled(true); setGo({ place: note.place, at: Date.now() }); }
  }, [flat.length, open.at, open.note, open.file, open.path, !!marks.notes.find((n) => n.id === open.note)]);

  const family = at ? families[at.fi] : undefined;
  const version = family?.versions[at!.vi];
  useEffect(() => { inHand.current = version?.id ?? null; }, [version?.id]);
  const kind = version ? viewKind(version.path) : null;
  const [savingNotes, setSavingNotes] = useState<FileNote[]>([]);
  const [settling, setSettling] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<string | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const allNotes = useMemo(() => settleLocally(notesWithSaving(marks.notes, savingNotes), settling), [marks.notes, savingNotes, settling]);
  const notesHere = useMemo(() => allNotes.filter((n) => n.file === version?.id), [allNotes, version?.id]);
  // What was said on an earlier version comes along, as the same comment: open on the file, resolved in the fold.
  const carriedAll = useMemo(() => (family && at ? carriedNotes(family, at.vi, allNotes, { resolved: true }) : []), [family, at?.vi, allNotes]);
  const carried = useMemo(() => carriedAll.filter((n) => !n.resolved), [carriedAll]);
  // A thread reads in the order it was said, whichever version each was said on.
  const { open: openNotes, resolved: settled } = commentsInList([...notesHere, ...carriedAll], undo);
  const approvalsHere = marks.approvals.filter((a) => a.file === version?.id);
  const mineApproved = approvalsHere.some((a) => a.by === me);
  const earlier = family && !approvalsHere.length
    ? family.versions.slice(0, at!.vi).reverse().find((v) => marks.approvals.some((a) => a.file === v.id)) : undefined;

  // A line with no author is yours.
  const person = useCallback((id: string | null): Person | null => people.find((p) => p.id === (id ?? me)) ?? null, [people, me]);
  const nameOf = useCallback((id: string | null) => (id === me ? 'You' : firstName(person(id)) || 'A teammate'), [me, person]);

  useEffect(() => {
    setDraftPlace(null); setHere(null); setCompare(false); setLeftVi(null); setReplyingTo(null); setFound('looking');
  }, [version?.id]);
  const offers = viewOffers(found, !!me && !!version);

  // Opening it is what clears a row from Needs you.
  const sawn = useRef(new Set<string>());
  useEffect(() => {
    if (!version || !me) return;
    const shown = new Set(openNotes.map((n) => n.id));
    const fresh = fileNewsFor({ artifacts: marks, createdBy: ownerOfRow, people: people.map((p) => p.id) }, me)
      .filter((n: { file: string; id: string; on?: string }) => (n.file === version.id || (!!n.on && shown.has(n.on))) && !sawn.current.has(n.id));
    if (!fresh.length) return;
    for (const n of fresh) sawn.current.add(n.id);
    void write({ do: 'seen', on: fresh.map((n: { id: string }) => n.id) });
  }, [version?.id, marks, me, ownerOfRow, people]);

  useEffect(() => {
    if (activeId) document.getElementById(`av-note-${activeId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const followsTheFile = kind === 'film' || kind === 'pdf' || kind === 'deck';
  const place: NotePlace = draftPlace ?? (followsTheFile ? here : null) ?? { kind: 'whole' };
  const [wholeAsked, setWholeAsked] = useState(false);
  useEffect(() => { setWholeAsked(false); }, [version?.id]);
  const placeNow: NotePlace = wholeAsked ? { kind: 'whole' } : place;
  const nextPin = notesHere.filter((n) => pinned(n.place)).length + 1;
  const chip = placeNow.kind === 'whole' ? null : placeWords({ place: placeNow, pin: nextPin });

  // Said here, since this view covers the window's own notices.
  const [trouble, setTrouble] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editWord, setEditWord] = useState<string | null>(null);
  const [told, setTold] = useState<string | null>(null);
  const [leaveAsked, setLeaveAsked] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const typed = useRef<string | null>(null);
  const posted = useRef<string | null>(null);
  const posting = useRef(false);
  const flushEdit = useRef<(() => string | null) | null>(null);
  const idle = useRef<number | null>(null);
  // The family whose new version was just saved, shown once it arrives.
  const [savedIn, setSavedIn] = useState<{ fi: number; count: number } | null>(null);
  useEffect(() => {
    if (!savedIn) return;
    const fam = families[savedIn.fi];
    if (!fam || fam.versions.length <= savedIn.count) return;
    setAt({ fi: savedIn.fi, vi: fam.versions.length - 1 });
    setSavedIn(null);
  }, [families, savedIn]);
  const failed = (out: { ok: boolean; error?: string }, words: string) => {
    if (!out.ok) setTrouble(out.error ?? words);
    else setTrouble(null);
    return !out.ok;
  };

  const pickNote = (note: FileNote) => {
    setActiveId(note.id);
    setGo({ place: note.place, at: Date.now() });
  };

  const send = async () => {
    const text = words.trim();
    if (!text || !version || sending) return;
    // "Sofia, approved v4" names Sofia as surely as @Sofia does: it reaches her, not the agent.
    const to = addressedTo(text, people);
    const mentions = [...new Set([...(to ? [to] : []), ...named.filter((p) => text.includes(`@${firstName(p)}`)).map((p) => p.id)])];
    setSending(true);
    const owner = whoseIsTheFile(files, version.id);
    const id = newId();
    const place = placeNow;
    // It is in the list before the app has answered; a failure puts the words back.
    setSavingNotes((was) => [...was, { id, file: version.id, place, text, by: me, ts: Date.now(), resolved: false, replies: [], saving: true, ...(pinned(place) ? { pin: nextPin } : {}) } as unknown as FileNote]);
    setWords(''); setDraftPlace(null); setWholeAsked(false); setAsking(null);
    setActiveId(id);
    const out = await write({ do: 'note', id, file: version.id, place, text, ...(mentions.length ? { mentions } : {}), ...(owner ? { owner } : {}) })
      .catch((err: Error) => ({ ok: false, error: err.message }));
    setSending(false);
    if (failed(out, 'That comment did not save. Your words are still in the box.')) {
      setSavingNotes((was) => was.filter((n) => n.id !== id));
      setWords(text);
      return;
    }
    setNamed([]);
  };

  const settle = async (note: FileNote, resolved: boolean) => {
    setSettling((was) => ({ ...was, [note.id]: resolved }));
    window.clearTimeout(undoTimer.current);
    setUndo(resolved ? note.id : null);
    if (resolved) undoTimer.current = window.setTimeout(() => setUndo((u) => (u === note.id ? null : u)), UNDO_MS);
    if (resolved && activeId === note.id) setActiveId(null);
    const out = await write({ do: resolved ? 'resolve' : 'reopen', on: note.id });
    if (failed(out, 'That did not save.')) {
      setSettling((was) => { const { [note.id]: _gone, ...rest } = was; return rest; });
      setUndo((u) => (u === note.id ? null : u));
    }
  };

  const reply = async (note: FileNote, text: string) => {
    const out = await write({ do: 'reply', id: newId(), on: note.id, file: note.file, text });
    return !failed(out, 'That reply did not save. Your words are still in the box.');
  };

  // An older version, or one with comments open, is approved only once that is said.
  const [approveAsked, setApproveAsked] = useState<{ text: string; newest: FileVersion | null } | null>(null);
  useEffect(() => { setApproveAsked(null); }, [version?.id]);
  const approveNow = async (v: FileVersion, undo = false) => {
    const owner = whoseIsTheFile(files, v.id);
    setApproveAsked(null);
    const out = await write({ do: undo ? 'unapprove' : 'approve', file: v.id, ...(owner && !undo ? { owner } : {}) });
    failed(out, 'That did not save.');
  };
  const approve = async () => {
    if (!version || !family || !at) return;
    if (mineApproved) return approveNow(version, true);
    const ask = approveAsk(family, at.vi, marks.notes);
    if (ask) { setApproveAsked(ask); return; }
    return approveNow(version);
  };
  const approveNewest = (v: FileVersion) => {
    setAt({ fi: at!.fi, vi: family!.versions.indexOf(v) });
    if (!marks.approvals.some((a) => a.file === v.id && a.by === me)) void approveNow(v);
  };

  // Main sends the notes, so the thread draws them once and not again as an instruction.
  const toAgent = async (on: string[]) => {
    if (!on.length) return;
    failed(await write({ do: 'toagent', on }), 'Those notes did not reach the agent. Try again.');
  };
  const sendNotes = withAgent && version
    ? notesForTheAgent(marks, version, family!.versions.length).ids.filter((id) => noteGoesTo(marks.notes.find((n) => n.id === id), people).to === 'agent')
    : [];
  const pressSend = () => toAgent(sendNotes);

  const isNewest = !!family && !!at && at.vi === family.versions.length - 1;
  const canEdit = !!(onNewVersion && kind === 'markdown' && version && isNewest && found === 'open' && !version.newer);
  const canRestore = !!(onNewVersion && kind === 'markdown' && version && !isNewest && found === 'open') && !family?.versions[family.versions.length - 1].newer;
  const draftKey = (path: string) => `doc-edit-draft:${product}:${path}`;
  const startEdit = async () => {
    if (!version) return;
    const top = document.querySelector('.av-stage .av-doc-scroll')?.scrollTop ?? 0;
    const [text, opened] = fromElsewhere
      ? await Promise.all([fromElsewhere.readText(version.path).catch(() => null), fromElsewhere.find(version.path).catch(() => null)])
      : await Promise.all([api.readDoc({ product, src: version.path, thread }).then((r) => (r.ok ? r.text ?? null : null)).catch(() => null), api.resolveDoc({ product, src: version.path, thread }).then((r) => r.opened ?? null).catch(() => null)]);
    if (text === null) { setTold(`${version.name} could not be read, so it cannot be edited.`); return; }
    let draft: string | undefined;
    try { draft = localStorage.getItem(draftKey(version.path)) ?? undefined; } catch { /* no storage, no draft */ }
    typed.current = draft ?? null;
    posted.current = null;
    setEditWord(draft ? 'Draft restored' : null);
    setTold(null);
    setEditing({ text, draft, top, folder: opened ? opened.replace(/\/[^/]*$/, '') : null, base: version });
  };
  const postEdit = async () => {
    const out = typed.current;
    if (!editing || !onNewVersion || out === null || out === posted.current || posting.current) return true;
    posting.current = true;
    setEditWord('Saving…');
    const clash = editClash(family, editing.base.n, me, nameOf);
    const why = await onNewVersion(editing.base.name, out, editing.base.path, editing.base.id).catch((err: Error) => err.message);
    posting.current = false;
    if (why) { setTold(`${why} Press back again to leave: your words come back when you press Edit.`); setEditWord('Not saved'); return false; }
    posted.current = out;
    try { localStorage.removeItem(draftKey(editing.base.path)); } catch { /* nothing kept */ }
    setTold(clash ?? editGoes ?? null);
    setEditWord(editGoes ? 'Sent' : `Saved as v${(family?.versions.length ?? 1) + 1}`);
    return true;
  };
  // An older version's words become the newest version; every version stays.
  const restore = async () => {
    if (!canRestore || !family || !at || !version || restoring) return;
    const newest = family.versions[family.versions.length - 1];
    const old = version;
    setRestoring(true);
    const text = fromElsewhere
      ? await fromElsewhere.readText(old.path).catch(() => null)
      : await api.readDoc({ product, src: old.path, thread }).then((r) => (r.ok ? r.text ?? null : null)).catch(() => null);
    if (text === null) { setRestoring(false); setTold(`v${old.n} could not be read, so it cannot be restored.`); return; }
    const why = await onNewVersion!(newest.name, text, newest.path, newest.id).catch((err: Error) => err.message);
    setRestoring(false);
    if (why) { setTold(why); return; }
    setSavedIn({ fi: at.fi, count: family.versions.length });
    setTold(editGoes ?? `Restored v${old.n} as v${family.versions.length + 1}. v${newest.n} is kept.`);
  };
  const postNow = useRef(postEdit);
  postNow.current = postEdit;
  const clearIdle = () => { if (idle.current != null) { window.clearTimeout(idle.current); idle.current = null; } };
  useEffect(() => clearIdle, []);
  const onDraft = useCallback((out: string | null) => {
    typed.current = out;
    clearIdle();
    const base = editingNow.current?.base;
    if (base) {
      try {
        if (out === null) localStorage.removeItem(draftKey(base.path));
        else localStorage.setItem(draftKey(base.path), out);
      } catch { /* the words are still in the page */ }
    }
    setEditWord(out === null ? null : 'Draft saved');
    if (out !== null) idle.current = window.setTimeout(() => { void postNow.current(); }, SAVE_AFTER_A_PAUSE_MS);
  }, [product]);
  const editingNow = useRef(editing);
  editingNow.current = editing;
  const finishEdit = async () => {
    clearIdle();
    if (flushEdit.current) typed.current = flushEdit.current();
    if (!(await postEdit())) return false;
    if (posted.current && at && editing) setSavedIn({ fi: at.fi, count: editing.base.n });
    setEditing(null);
    setEditWord(null);
    return true;
  };
  const saveNow = useCallback(() => {
    clearIdle();
    if (flushEdit.current) typed.current = flushEdit.current();
    void postNow.current();
  }, []);
  const unsaved = () => {
    if (flushEdit.current) typed.current = flushEdit.current();
    return typed.current !== null && typed.current !== posted.current;
  };
  const saveAndLeave = () => { setLeaveAsked(false); void finishEdit().then((done) => { if (done) onClose(); }); };
  const discardEdit = () => {
    clearIdle();
    if (editing) { try { localStorage.removeItem(draftKey(editing.base.path)); } catch { /* nothing kept */ } }
    typed.current = null;
    setLeaveAsked(false);
    setEditing(null);
    setEditWord(null);
    setTold(null);
    onClose();
  };
  // The first press after a failed save says so; the next one leaves, and the draft stays for Edit.
  // Changes are kept only when asked: Close is how people throw an edit away.
  const leave = () => {
    if (!editing) { onClose(); return; }
    if (editWord === 'Not saved') {
      flushEdit.current?.();
      setEditing(null);
      setEditWord(null);
      setTold(null);
      onClose();
      return;
    }
    if (!unsaved()) { clearIdle(); setEditing(null); setEditWord(null); onClose(); return; }
    clearIdle();
    setLeaveAsked(true);
  };
  const liveQuotes = useMemo(() => [...notesHere, ...carried].flatMap((n) => (n.place.kind === 'quote' && !n.resolved ? [{ id: n.id, text: n.place.text }] : [])), [notesHere, carried]);
  const [goneQuotes, setGoneQuotes] = useState<string[]>([]);
  const noteGone = useCallback((ids: string[]) => setGoneQuotes((was) => (was.join() === ids.join() ? was : ids)), []);
  useEffect(() => { setGoneQuotes([]); }, [version?.id]);
  const paintEditor = (root: HTMLElement) => {
    const found = paintQuotes(root, liveQuotes, activeId, null);
    if (canPaintQuotes()) noteGone(liveQuotes.filter((q) => !found.has(q.id)).map((q) => q.id));
  };
  const othersSaved = editing ? editClash(family, editing.base.n, me, nameOf) : null;

  const stepFile = (by: number) => {
    if (editing || !at || families.length < 2) return;
    const next = Math.max(0, Math.min(families.length - 1, at.fi + by));
    setAt({ fi: next, vi: families[next].versions.length - 1 });
    setActiveId(null);
  };
  const stepVersion = (by: number) => {
    if (editing || !at || !family) return;
    setAt({ fi: at.fi, vi: Math.max(0, Math.min(family.versions.length - 1, at.vi + by)) });
    setActiveId(null);
  };

  // Escape first of all, ahead of the app's own. Every other key still reaches the
  // box and the players, which React hears at the page, and stops at the document
  // on its way up, so the thread behind stays still.
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (asking) setAsking(null);
      else if (leaveAsked) setLeaveAsked(false);
      else if (replyingTo) setReplyingTo(null);
      else if (draftPlace) setDraftPlace(null);
      else if (compare) setCompare(false);
      else if (editing && editWord === 'Not saved') leave();
      else if (editing) leave();
      else onClose();
    };
    const rest = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      e.stopPropagation();
      const at = e.target as HTMLElement | null;
      const typing = at?.tagName === 'TEXTAREA' || !!at?.isContentEditable;
      if (typing || followsTheFile) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stepFile(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepFile(-1); }
    };
    window.addEventListener('keydown', escape, true);
    document.addEventListener('keydown', rest);
    return () => { window.removeEventListener('keydown', escape, true); document.removeEventListener('keydown', rest); };
  });

  const askingFor = asking ? people.filter((p) => p.id !== me && firstName(p).toLowerCase().startsWith(asking.query.toLowerCase())).slice(0, 5) : [];
  const nameInto = (p: Person) => {
    if (!asking) return;
    const el = box.current;
    const caret = el?.selectionStart ?? words.length;
    const name = `@${firstName(p)} `;
    setWords(`${words.slice(0, asking.start)}${name}${words.slice(caret)}`);
    setNamed((was) => (was.some((x) => x.id === p.id) ? was : [...was, p]));
    setAsking(null);
    requestAnimationFrame(() => { const to = asking.start + name.length; el?.focus(); el?.setSelectionRange(to, to); });
  };
  const onWords = (value: string, caret: number) => {
    setWords(value);
    const m = people.length ? /(^|\s)@(\w*)$/.exec(value.slice(0, caret)) : null;
    setAsking(m ? { start: caret - m[2].length - 1, query: m[2], sel: 0 } : null);
  };
  const onBoxKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (asking && askingFor.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAsking({ ...asking, sel: (asking.sel + 1) % askingFor.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAsking({ ...asking, sel: (asking.sel - 1 + askingFor.length) % askingFor.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); nameInto(askingFor[asking.sel]); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  const hint = kind === 'image' ? 'Click the picture, or write a comment'
    : kind === 'markdown' || kind === 'code' ? 'Select words, or write a comment'
      : kind === 'deck' || kind === 'pdf' ? 'Click a spot, or write a comment'
        : kind === 'page' ? 'Pin a spot, or write a comment'
          : 'Write a comment';

  const heldFor = (n: FileNote): string | null => {
    if (n.sent || !offers.comment || typeof flat.find((x) => x.v.id === n.file)?.v.agent !== 'string') return null;
    const goes = noteGoesTo(n, people);
    if (goes.to === 'person') return `Sent to ${goes.person === me ? 'you' : nameOf(goes.person)}`;
    return goes.to === 'nobody' ? 'Not sent to the agent' : null;
  };
  const card = (n: FileNote) => (
    <Note key={n.id} note={n} wordsGone={goneQuotes.includes(n.id)} active={n.id === activeId} settling={n.id === undo} person={person} me={me} onGo={() => pickNote(n)} onSettle={(r) => void settle(n, r)} nameOf={nameOf}
      canReply={offers.comment} replying={replyingTo === n.id} onReplying={(on) => setReplyingTo(on ? n.id : null)} onReply={(text) => reply(n, text)}
      held={heldFor(n)} onToAgent={() => void toAgent([n.id])} />
  );

  const left = family && compare ? family.versions[leftVi ?? (at!.vi > 0 ? at!.vi - 1 : 1)] : undefined;

  // Two versions of a film are compared moving, so Play on either plays both.
  const split = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = split.current;
    if (!el || !compare || kind !== 'film') return;
    const others = (from: EventTarget | null) => [...el.querySelectorAll('video')].filter((v) => v !== from);
    const play = (e: Event) => {
      for (const v of others(e.target)) {
        if (!v.paused) continue;
        v.currentTime = (e.target as HTMLVideoElement).currentTime;
        v.muted = true;
        void v.play().catch(() => {});
      }
    };
    const pause = (e: Event) => { for (const v of others(e.target)) if (!v.paused) v.pause(); };
    el.addEventListener('play', play, true);
    el.addEventListener('pause', pause, true);
    return () => { el.removeEventListener('play', play, true); el.removeEventListener('pause', pause, true); };
  }, [compare, kind]);

  const bylineOf = (v: { by: string | null; at: number; n: number; agent?: string }) => [
    family && family.versions.length > 1 ? `Version ${v.n}` : null,
    sharedByWords(v, { me, nameOf }),
    v.at ? whenShared(v.at) : null,
  ].filter(Boolean).join('  ·  ');

  const stage = (path: string, id: string, name: string, editable: boolean, v?: { by: string | null; at: number; n: number; agent?: string }) => (
    <ArtifactStage product={product} path={path} name={name} byline={v ? bylineOf(v) : null}
      notes={allNotes.filter((n) => n.file === id)}
      carried={editable ? carriedAll.filter((n) => !n.resolved || n.id === undo) : []}
      keep={editable ? undo : null}
      draft={editable && offers.comment ? placeNow : null}
      activeId={editable ? activeId : null}
      go={editable ? go : null}
      hold={hold}
      showResolved={showSettled}
      onPlace={editable && !compare ? (p) => { setWholeAsked(false); setDraftPlace(p); box.current?.focus(); } : undefined}
      onPick={editable ? (id2) => { const n = [...notesHere, ...carried].find((x) => x.id === id2); if (n) pickNote(n); } : undefined}
      onHere={editable ? (p) => {
        setHere(p); setWholeAsked(false);
        // A pin belongs to its frame; moved off it, what is being written is about the new moment.
        if (p.kind === 'time') setDraftPlace((d) => (hasSpot(d) && Math.abs(d.s - p.s) >= PIN_FRAME_S ? null : d));
        if (p.kind === 'page') setDraftPlace((d) => (pageSpot(d) && d.n !== p.n ? null : d));
      } : undefined}
      onFound={editable ? setFound : undefined}
      onQuotesGone={editable ? noteGone : undefined}
      onOutside={onOutside ? () => onOutside(path) : undefined}
      files={fromElsewhere}
      missingSays={missingSays?.(v?.by ?? null)}
    />
  );

  return createPortal(
    <StageThread.Provider value={thread}>
    <div className="artifact-view" role="dialog" aria-label={version?.name ?? 'File'}>
      <header className="av-top">
        <button type="button" className="av-back" onClick={leave} title="Back (esc)"><span aria-hidden="true">←</span><span className="av-thread">{threadName}</span></button>
        <span className="av-name">{familyName(family, editing?.base ?? version) || ((editing?.base ?? version)?.name ?? '')}</span>
        {kind && <span className="av-kind">{KIND_WORD[kind]}</span>}
        {family && family.versions.length > 1 && !editing && (
          <span className="av-versions">
            <button type="button" className="av-chev" disabled={at!.vi === 0} onClick={() => stepVersion(-1)} aria-label="Older version">‹</button>
            <span className="av-of">v{version!.n} of {family.versions.length}</span>
            <button type="button" className="av-chev" disabled={at!.vi === family.versions.length - 1} onClick={() => stepVersion(1)} aria-label="Newer version">›</button>
            <button type="button" className={`av-btn av-compare${compare ? ' is-on' : ''}`} aria-pressed={compare} onClick={() => setCompare(!compare)}>Side by side</button>
          </span>
        )}
        <span className="av-spring" />
        {approvalsHere.some((a) => a.by !== me) && (
          <span className="av-approved"><i aria-hidden="true" />Approved by {approvalsHere.filter((a) => a.by !== me).map((a) => nameOf(a.by)).join(', ')}</span>
        )}
        {earlier && <span className="av-approved is-old" title={approvalSince(family, at!.vi, marks.approvals, nameOf) ?? undefined}>{version?.edited ? approvalSince(family, at!.vi, marks.approvals, nameOf) : `v${earlier.n} approved, this version is not`}</span>}
        {editing && editWord && <span className="av-saved" role="status">{editWord}</span>}
        {offers.approve && !editing && <button type="button" className={`av-btn${mineApproved ? ' is-on' : ''}`} aria-pressed={mineApproved} onClick={() => void approve()}>{mineApproved ? 'Approved' : 'Approve'}</button>}
        {canEdit && !compare && !editing && <button type="button" className="av-btn" onClick={() => void startEdit()}>Edit</button>}
        {canRestore && !compare && !editing && <button type="button" className="av-btn" disabled={restoring} onClick={() => void restore()}>Restore this version</button>}
        {editing && <button type="button" className="av-btn is-on" onClick={() => void finishEdit()}>Done</button>}
        {onOutside && version && found === 'open' && !editing && <button type="button" className="av-btn" onClick={() => onOutside(version.path)}>Open outside</button>}
        <button type="button" className="av-close" onClick={leave} title="Close (esc)" aria-label="Close"><CrossIcon /></button>
      </header>
      <div className="av-body">
        <div className="av-stage">
          {!version && <OpeningWait name={open.path?.split('/').pop() || 'This file'} kind={null} />}
          {(othersSaved || told) && <p className="av-told" role="status">{othersSaved ?? told}</p>}
          {family && at && !isNewest && !editing && !compare && (
            <p className="av-told" role="status">
              v{family.versions[family.versions.length - 1].n} is the newest.
              <button type="button" className="av-btn" onClick={() => setAt({ fi: at.fi, vi: family.versions.length - 1 })}>Show v{family.versions[family.versions.length - 1].n}</button>
            </p>
          )}
          {approveAsked && version && (
            <p className="av-told av-ask" role="alertdialog">
              {approveAsked.text}
              {approveAsked.newest && <button type="button" className="av-btn is-on" onClick={() => approveNewest(approveAsked.newest!)}>Approve v{approveAsked.newest.n}</button>}
              <button type="button" className="av-btn" onClick={() => void approveNow(version)}>Approve v{version.n} anyway</button>
              <button type="button" className="av-btn" onClick={() => setApproveAsked(null)}>Not yet</button>
            </p>
          )}
          {leaveAsked && editing && (
            <p className="av-told av-ask" role="alertdialog">
              Keep your changes?
              <button type="button" className="av-btn is-on" onClick={saveAndLeave}>Save as v{(family?.versions.length ?? 1) + 1}</button>
              <button type="button" className="av-btn" onClick={discardEdit}>Discard</button>
              <button type="button" className="av-btn" onClick={() => setLeaveAsked(false)}>Keep editing</button>
            </p>
          )}
          {editing && (
            <div className="av-pane" key={`editing-${editing.base.id}`}>
              <DocText product={product} src={editing.base.path} text={editing.text} mtime={0} folder={editing.folder} onSaved={() => {}} onNotice={setTold}
                versions={{ onDraft, saveNow, flush: flushEdit, paint: paintEditor, scrollTop: editing.top, draft: editing.draft, byline: bylineOf(editing.base) }} />
            </div>
          )}
          {version && !compare && !editing && <div className="av-pane" key={version.id}>{stage(version.path, version.id, version.name, true, version)}</div>}
          {version && compare && left && !editing && (
            <div className="av-split" ref={split}>
              <div className="av-pane" key={`l-${left.id}`}>
                <div className="av-pane-head">
                  {family!.versions.filter((v) => v.id !== version.id).map((v) => (
                    <button type="button" key={v.id} className={`av-pane-v${v.id === left.id ? ' is-on' : ''}`} onClick={() => setLeftVi(family!.versions.indexOf(v))}>{`v${v.n}`}</button>
                  ))}
                  <span className="av-pane-name">{left.name}</span>
                </div>
                {stage(left.path, left.id, left.name, false)}
              </div>
              <div className="av-pane" key={`r-${version.id}`}>
                <div className="av-pane-head"><span className="av-pane-v is-on">{`v${version.n}`}</span><span className="av-pane-name">{version.name}</span></div>
                {stage(version.path, version.id, version.name, true)}
              </div>
            </div>
          )}
          {!compare && !editing && families.length > 1 && at && <>
            <button type="button" className="av-step av-prev" disabled={at.fi === 0} onClick={() => stepFile(-1)} aria-label="Previous file">‹</button>
            <button type="button" className="av-step av-next" disabled={at.fi === families.length - 1} onClick={() => stepFile(1)} aria-label="Next file">›</button>
          </>}
        </div>
        {!compare && (found === 'looking' || offers.comment || openNotes.length > 0 || settled.length > 0) && <aside className="av-side" aria-label="Comments">
          <div className="av-list">
            {openNotes.map(card)}
            {settled.length > 0 && (
              <button type="button" className="av-settled" aria-expanded={showSettled} onClick={() => setShowSettled(!showSettled)}>{showSettled ? 'Hide resolved' : `Show resolved (${settled.length})`}</button>
            )}
            {showSettled && settled.map(card)}
          </div>
          {offers.comment && sendNotes.length > 0 && (
            <button type="button" className="av-btn av-send" onClick={() => void pressSend()}>Send {sendNotes.length === 1 ? 'this note' : 'these notes'} to the agent</button>
          )}
          {trouble && <p className="av-trouble" role="alert">{trouble}</p>}
          {offers.comment && <form className="av-write" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            {asking && askingFor.length > 0 && (
              <div className="av-names" role="listbox">
                {askingFor.map((p, i) => (
                  <button type="button" role="option" aria-selected={i === asking.sel} key={p.id} className={`av-name-row${i === asking.sel ? ' is-on' : ''}`} onMouseDown={(e) => { e.preventDefault(); nameInto(p); }}>
                    <Face person={p} />{p.name}
                  </button>
                ))}
              </div>
            )}
            {chip && (
              <div className="av-chip">
                <span className="av-chip-words">{chip}</span>
                <button type="button" className="av-chip-off" aria-label="Comment on the whole file instead" title="Comment on the whole file instead"
                  onClick={() => { setDraftPlace(null); setWholeAsked(followsTheFile); }}><CrossIcon /></button>
              </div>
            )}
            <textarea ref={box} rows={2} value={words} placeholder={chip ? 'Comment' : hint} aria-label="Comment"
              onChange={(e) => onWords(e.target.value, e.target.selectionStart)}
              onFocus={() => setHold((n) => n + 1)}
              onKeyDown={onBoxKey} />
          </form>}
        </aside>}
      </div>
      {below}
    </div>
    </StageThread.Provider>,
    document.body,
  );
}
