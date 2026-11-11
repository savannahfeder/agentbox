// A FILE OPENED BIG: the file filling the window, its comments down the right,
// the thread's name and the version above, Escape back. One view for the owner
// and for teammates; only where a comment is written differs (`write`).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  addressedTo, approvalSince, approveAsk, carriedNotes, editClash, familyName, filesInLines, fileNewsFor, latestPicturesSaid, nextStep, noteGoesTo, offeredTogether, otherFilesInLines, placeWords, resolvedInWords, reviewKind, sharedByWords, stepsThrough, stillInHand, stillWaiting, tagsYourAgent, threadFiles, viewKind, whereAPressLands, whoseIsTheFile, withFilesAsked,
} from '../../../shared/artifact-marks.mts';
import { AgentFace } from './AgentFace';
import type { FileVersion } from '../../../shared/artifact-marks.mts';
import { api } from '../api';
import { canPaintQuotes, paintQuotes } from '../paint-quotes';
import { firstName, Face } from '../team/people';
import { clock, type LedgerLine } from '../thread-history';
import type { ArtifactMark, FileMarks, FileNote, NotePlace, Person } from '../types';
import { hasSpot, noteSendWords, notesToSendTheAgent, notesToSendTheAgentAnywhere, otherFilesOpen, unsentWords, pageSpot, PIN_FRAME_S, pinned, viewOffers, type Found } from '../artifact-pins';
import { commentsInList, notesWithSaving, settleLocally, UNDO_MS } from '../note-saving';
import { keptDraft, opensForTyping, SAVE_AFTER_A_PAUSE_MS, savedVersionArrived, wordsToSave } from '../edit-sitting';
import { quotesKey } from '../selection-bar';
import { SelectionBar } from './SelectionBar';
import { pressedInTheFindBox } from '../find-in-page';
import { ArtifactStage, StageLink, StageProject, StageThread, type StageFiles, type StageGo } from './ArtifactStage';
import { keepCommentDraft, openCommentDraft, readLooseDraft, type Holding } from '../comment-drafts';
import { attachProblem, fromPaste, persistAttachments, useAttaching, type PendingAttachment } from '../attachments';
import { noteWithPictures } from '../note-pictures';
import { AttachRow } from './AttachRow';
import { FileLinkBrowser } from './FileLinkBrowser';
import { OpeningWait } from './OpeningWait';
import { CrossIcon } from './CrossIcon';
import { ArtifactControlGlyph } from './ArtifactControlGlyph';
import { FocusControl } from './FocusControl';
import { DocText } from './DocText';
import { useLiveSession, useLiveTicket } from '../live/live-session';
import { FileNoteCard } from './FileNoteCard';
import { NoteGlyph } from './NoteGlyphs';
import { NotesHead, NotesSection, ReturnGlyph } from './NotesSidebar';
import { ShareLink, canShareFile } from './ShareLink';
import { paneKey, staysOnNewest } from '../table-follows';
import { SEND } from '../this-keyboard';
import './artifact-view.css';

/** `steps`: the paths the arrows step through, in order, when the press came from a turn of the thread. `drawn`: every picture that turn drew, versions too. */
export interface ArtifactOpen { path?: string; file?: string; note?: string; at?: number; steps?: string[]; drawn?: string[]; /** Where a film beside the chat had got to, in seconds. */ time?: number }

type Editing = { fam: string; text: string; draft?: string; folder: string | null; base: ReturnType<typeof threadFiles>[number]['versions'][number] };

export const NO_MARKS: FileMarks = { notes: [], approvals: [], seen: {} };

const YOUR_AGENT: Person = { id: '@agent', email: '', name: 'agent', avatarUrl: null };

const clockAt = clock;
const whenShared = (ts: number) => (new Date(ts).toDateString() === new Date().toDateString()
  ? `today at ${clockAt(ts)}` : new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }));
const KIND_WORD = { image: 'Picture', film: 'Film', pdf: 'PDF', deck: 'Slides', markdown: 'Document', page: 'Page', table: 'Table', code: 'Code' } as const;

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function ArtifactView({ product, project = null, thread, draftsAcross, shareThread, lines, numbers, marks, me, people, open, ownerOfRow, write, withAgent = false, onNewVersion, editGoes, missingSays, onClose, onOutside, onBeside, below, files: fromElsewhere, typing = false }: {
  /** The project the file belongs to, when it is not `product`'s own (a teammate's thread). */
  project?: string | null;
  /** Each path's number on its file's version line, which every surface counts by. */
  numbers?: Record<string, number>;
  /** What to say of a version with no bytes on this computer, by who made it. */
  missingSays?: (by: string | null) => string;
  /** For a file kept outside any project, such as one in a group chat. */
  files?: StageFiles;
  product: string;
  /** The thread whose files these are, so a name opens that thread's own file. */
  thread?: string;
  /** Where words with no pin travel from file to file; the thread when unset. */
  draftsAcross?: string;
  /** The thread a file opened from Files was sent in, for its link (ShareLink). */
  shareThread?: string;
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
  onNewVersion?: (name: string, text: string, path: string, id: string, since?: string | null) => Promise<string | null>;
  /** Said after a save that only becomes a version on someone else's computer. */
  editGoes?: string;
  onClose: () => void;
  onOutside?: (path: string) => void;
  /** Only where there is a chat to sit beside. */
  onBeside?: (path: string) => void;
  /** A line under the file, the full width of the window. */
  below?: ReactNode;
  /** Opened to write in, so the editor takes the cursor. */
  typing?: boolean;
}) {
  const files = useMemo(() => {
    const reviewed = filesInLines(lines);
    const others = otherFilesInLines(lines);
    // Lines that name nothing else are Files opening this one script or page.
    const said = [...reviewed, ...(reviewed.length ? otherFilesOpen(others, open.path, marks.notes) : others)];
    // A note on a page the thread never linked opens that page by its name, never the thread's last file.
    const noted = open.note ? marks.notes.find((n) => n.id === open.note)?.file : undefined;
    const path = open.path?.replace(/^\.\//, '') ?? (noted && !/[#@]\d+$/.test(noted) ? noted : undefined);
    return withFilesAsked(said, [path, ...(open.drawn ?? open.steps ?? [])]);
  }, [lines, open.path, open.note, open.steps, open.drawn, marks.notes]);
  // What the page drew has bytes, so Files not having numbered it yet does not drop it.
  const kept = useMemo(() => [open.path, ...(open.steps ?? []), ...(open.drawn ?? [])].filter((p): p is string => !!p), [open.path, open.steps, open.drawn]);
  const families = useMemo(() => threadFiles(files, numbers, { keep: kept }), [files, numbers, kept]);
  const flat = useMemo(() => families.flatMap((f, fi) => f.versions.map((v, vi) => ({ fi, vi, v }))), [families]);
  const handedSteps = useMemo(() => stepsThrough(families, open.steps), [families, open.steps]);
  const latestSteps = useMemo(() => stepsThrough(families, latestPicturesSaid(lines)), [families, lines]);

  // The place carries its version's id and path, so a list that fills in later still finds it.
  const [placed, setPlaced] = useState<{ fi: number; vi: number; held: { id: string; path: string } | null } | null>(null);
  const familiesNow = useRef(families);
  familiesNow.current = families;
  const setAt = useCallback((p: { fi: number; vi: number }) => {
    const v = familiesNow.current[p.fi]?.versions[p.vi];
    setPlaced({ fi: p.fi, vi: p.vi, held: v ? { id: v.id, path: v.path } : null });
  }, []);
  const at = useMemo(() => stillInHand(families, placed && { fi: placed.fi, vi: placed.vi }, placed?.held ?? null), [families, placed]);
  const [activeId, setActiveId] = useState<string | null>(open.note ?? null);
  const [go, setGo] = useState<StageGo>(null);
  const [draftPlace, setDraftPlace] = useState<NotePlace | null>(null);
  const [here, setHere] = useState<NotePlace | null>(null);
  const [words, setWords] = useState('');
  const [named, setNamed] = useState<Person[]>([]);
  const [asking, setAsking] = useState<{ start: number; query: string; sel: number } | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [hold, setHold] = useState(0);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [found, setFound] = useState<Found>('looking');
  const [pictures, setPictures] = useState<PendingAttachment[]>([]);
  const { attaching, collect } = useAttaching();
  const [link, setLink] = useState<string | null>(null);
  const closeLink = useCallback(() => setLink(null), []);
  const pictureInput = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const placedFor = useRef<string | null>(null);
  const inHand = useRef<string | null>(null);
  const newestInHand = useRef(false);

  // Where the press wants to land, once the thread's files are read. The picked
  // comment's file wins, then the file, then the path.
  useEffect(() => {
    // Once per press: a version arriving later must not pull the view off the page in hand.
    const press = `${open.at ?? 0}:${!!marks.notes.find((n) => n.id === open.note)}:${lines.length > 0}`;
    if (!flat.length) return;
    if (placedFor.current === press) {
      const same = placed?.held && at ? flat.find((x) => x.fi === at.fi && x.vi === at.vi) : undefined;
      if (same && staysOnNewest({ kind: viewKind(same.v.path), wasNewest: newestInHand.current })) setAt({ fi: same.fi, vi: families[same.fi].versions.length - 1 });
      else if (same) setAt({ fi: same.fi, vi: same.vi });
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
    else if (open.time) setGo({ place: { kind: 'time', s: open.time }, at: Date.now() });
  }, [flat.length, open.at, open.note, open.file, open.path, !!marks.notes.find((n) => n.id === open.note)]);

  const family = at ? families[at.fi] : undefined;
  const version = family?.versions[at!.vi];
  useEffect(() => { inHand.current = version?.id ?? null; setLink(null); }, [version?.id]);
  // Read by the placing effect above, which runs first, so it says what was true before a version arrived.
  useEffect(() => { newestInHand.current = !!family && !!at && at.vi === family.versions.length - 1; });
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
  const othersApproved = approvalsHere.filter((a) => a.by !== me);
  const earlier = family && !approvalsHere.length
    ? family.versions.slice(0, at!.vi).reverse().find((v) => marks.approvals.some((a) => a.file === v.id)) : undefined;

  // A line with no author is yours.
  const person = useCallback((id: string | null): Person | null => people.find((p) => p.id === (id ?? me)) ?? null, [people, me]);
  const nameOf = useCallback((id: string | null) => (id === me ? 'You' : firstName(person(id)) || 'A teammate'), [me, person]);

  // The version the comment box's words belong to. Saving waits for it, so the
  // words on screen are never written under the version just stepped onto.
  const draftOf = useRef<{ file: string; holding: Holding } | null>(null);
  const across = draftsAcross ?? `${product}:${thread ?? ''}`;
  const wordsNow = useRef(words);
  wordsNow.current = words;
  useEffect(() => {
    const kept = openCommentDraft({ product, thread, file: version?.id ?? '', across });
    draftOf.current = version?.id ? { file: version.id, holding: kept.holding } : null;
    setWords(kept.words); setDraftPlace(kept.place); setAsking(null);
    setNamed(people.filter((p) => kept.words.includes(`@${firstName(p)}`)));
    setHere(null); setReplyingTo(null); setFound('looking');
  }, [version?.id]);
  useEffect(() => {
    const d = draftOf.current;
    if (d) d.holding = keepCommentDraft({ product, thread, file: d.file, across }, { words, place: draftPlace }, d.holding);
  }, [words, draftPlace]);
  const [editing, setEditing] = useState<Editing | null>(null);
  // The editor read the file itself, so it is open while it is on screen.
  const foundNow: Found = editing ? 'open' : found;
  const offers = viewOffers(foundNow, !!me && !!version);

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
  const [editWord, setEditWord] = useState<string | null>(null);
  const [told, setTold] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const starting = useRef<string | null>(null);
  const editPane = useRef<HTMLDivElement | null>(null);
  const editRanges = useRef(new Map<string, Range>());
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
    if (!savedVersionArrived(families[savedIn.fi], savedIn.count)) return;
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
    const typed = words.trim();
    if ((!typed && !pictures.length) || !version || sending || attaching.length) return;
    // "Sofia, approved v4" names Sofia as surely as @Sofia does: it reaches her, not the agent.
    const to = addressedTo(typed, people);
    const mentions = [...new Set([...(to ? [to] : []), ...named.filter((p) => typed.includes(`@${firstName(p)}`)).map((p) => p.id)])];
    setSending(true);
    let links = '';
    try { links = await persistAttachments(product, pictures); } catch (err) {
      setSending(false);
      failed({ ok: false, error: (err as Error).message }, 'That picture did not save.');
      return;
    }
    const text = noteWithPictures(typed, links);
    const sentPictures = pictures;
    setPictures([]);
    const owner = whoseIsTheFile(files, version.id);
    const id = newId();
    const place = placeNow;
    // A comment waits for Send, so the agent starts once for all of them; @agent sends this one now.
    const tagged = withAgent && typeof version.agent === 'string' && tagsYourAgent(typed);
    // It is in the list before the app has answered; a failure puts the words back.
    setSavingNotes((was) => [...was, { id, file: version.id, place, text, by: me, ts: Date.now(), resolved: false, replies: [], saving: true, wait: !tagged, ...(pinned(place) ? { pin: nextPin } : {}) } as unknown as FileNote]);
    setWords(''); setDraftPlace(null); setWholeAsked(false); setAsking(null);
    setActiveId(id);
    const out = await write({ do: 'note', id, file: version.id, place, text, wait: !tagged, ...(mentions.length ? { mentions } : {}), ...(owner ? { owner } : {}) })
      .catch((err: Error) => ({ ok: false, error: err.message }));
    setSending(false);
    if (failed(out, 'That comment did not save.')) {
      setSavingNotes((was) => was.filter((n) => n.id !== id));
      setWords(typed);
      setPictures(sentPictures);
      return;
    }
    setNamed([]);
    // A pinned comment was covering the notes you carried; they come back once it is sent.
    const d = draftOf.current;
    if (d?.file === version.id && d.holding === 'file' && !wordsNow.current.trim()) {
      d.holding = 'loose';
      const carried = readLooseDraft({ product, thread, file: version.id, across }).words;
      if (carried) { setWords(carried); setNamed(people.filter((p) => carried.includes(`@${firstName(p)}`))); }
    }
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
    if (failed(out, 'That reply did not save.')) return false;
    // @agent in a reply hands your agent the comment it answers, with the replies under it.
    if (withAgent && tagsYourAgent(text)) await toAgent([note.id]);
    return true;
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
    const ask = approveAsk(family, at.vi, marks.notes, offeredTogether(lines, family));
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
    failed(await write({ do: 'toagent', on }), 'Those notes did not reach the agent.');
  };
  const unsent = withAgent ? notesToSendTheAgentAnywhere(marks, families, version?.id ?? null, people, me) : { ids: [], elsewhere: 0, elsewhereKind: 'picture' as const };
  const sendAll = () => toAgent(unsent.ids);
  const sendNotes = withAgent && version ? notesToSendTheAgent(marks, version, family!.versions.length, people, me) : [];
  const pressSend = () => toAgent(sendNotes);
  const waitingHere = offers.comment ? openNotes.filter((n) => sendNotes.includes(n.id)) : [];
  const sentAlready = openNotes.filter((n) => !waitingHere.includes(n));
  const authors = [...new Set(openNotes.map((n) => n.by))].slice(0, 3);

  const isNewest = !!family && !!at && at.vi === family.versions.length - 1;
  const canEdit = !!(onNewVersion && kind === 'markdown' && version && isNewest && !version.newer);
  const canRestore = !!(onNewVersion && kind === 'markdown' && version && !isNewest && found === 'open') && !family?.versions[family.versions.length - 1].newer;
  const draftKey = (path: string) => `doc-edit-draft:${product}:${path}`;
  const editingNow = useRef(editing);
  editingNow.current = editing;
  const startEdit = async () => {
    if (!version || !family || starting.current === version.id) return;
    const v = version;
    const fam = family.key;
    starting.current = v.id;
    const [text, opened] = fromElsewhere
      ? await Promise.all([fromElsewhere.readText(v.path).catch(() => null), fromElsewhere.find(v.path).catch(() => null)])
      : await Promise.all([api.readDoc({ product, src: v.path, thread }).then((r) => (r.ok ? r.text ?? null : null)).catch(() => null), api.resolveDoc({ product, src: v.path, thread }).then((r) => r.opened ?? null).catch(() => null)]);
    starting.current = null;
    if (inHand.current !== v.id) return;
    if (text === null) { setUnreadable(v.id); return; }
    // Words a sitting kept but never saved, from a failed save or a closed app.
    let kept: ReturnType<typeof keptDraft<typeof v>> = null;
    try { kept = keptDraft(family.versions, v, (p) => localStorage.getItem(draftKey(p))); } catch { /* no storage, no draft */ }
    const draft = kept?.draft;
    typed.current = draft ?? null;
    posted.current = null;
    setEditWord(null);
    setTold(null);
    setEditing({ fam, text, draft, folder: opened ? opened.replace(/\/[^/]*$/, '') : null, base: kept?.base ?? v });
    if (draft !== undefined) idle.current = window.setTimeout(() => { void postNow.current(); }, SAVE_AFTER_A_PAUSE_MS);
  };
  useEffect(() => {
    if (opensForTyping({ canEdit, editing: !!editing, unreadable, version: version?.id ?? null })) void startEdit();
  }, [canEdit, !!editing, unreadable, version?.id]);
  // Teammates with the same document open type into one live copy of it.
  const liveTicket = useLiveTicket(editing ? { product, project, name: editing.base.name } : null);
  const liveSession = useLiveSession(liveTicket);
  // A version this sitting did not save (an agent's) is merged into the live words by the keeper.
  const [incoming, setIncoming] = useState<string | null>(null);
  const newestNow = family?.versions[family.versions.length - 1];
  useEffect(() => {
    if (!editing || !liveSession?.keeper || !newestNow || newestNow.id === editing.base.id) return undefined;
    let gone = false;
    const read = fromElsewhere
      ? fromElsewhere.readText(newestNow.path).catch(() => null)
      : api.readDoc({ product, src: newestNow.path, thread }).then((r) => (r.ok ? r.text ?? null : null)).catch(() => null);
    void read.then((t) => { if (!gone && t !== null && t !== posted.current) setIncoming(t); });
    return () => { gone = true; };
  }, [newestNow?.id, liveSession?.keeper, !!editing]);
  const waitingForEditor = opensForTyping({ canEdit, editing: !!editing, unreadable, version: version?.id ?? null }) || (!!editing && liveTicket === undefined);

  // A save asked for while one is on its way waits for it, then posts what is newer.
  const inFlight = useRef<Promise<boolean> | null>(null);
  const postEdit = async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    const sitting = editingNow.current;
    const out = sitting ? wordsToSave({ typed: typed.current, posted: posted.current, original: sitting.text }) : null;
    if (!sitting || !onNewVersion || out === null) return true;
    const run = (async () => {
      setEditWord('Saving…');
      const clash = editClash(family, sitting.base.n, me, nameOf);
      const why = await onNewVersion(sitting.base.name, out, sitting.base.path, sitting.base.id, posted.current).catch((err: Error) => err.message);
      if (why) { setTold(`${why} Close it again to leave. Your words come back when you open it again.`); setEditWord('Not saved'); return false; }
      posted.current = out;
      try { if (localStorage.getItem(draftKey(sitting.base.path)) === out) localStorage.removeItem(draftKey(sitting.base.path)); } catch { /* nothing kept */ }
      setTold(clash ?? editGoes ?? null);
      setEditWord(editGoes ? 'Sent' : 'Saved');
      if (at && family) setSavedIn({ fi: at.fi, count: family.versions.length });
      return true;
    })();
    inFlight.current = run;
    try { return await run; } finally { inFlight.current = null; }
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
  const onDraft = useCallback((out: string | null) => {
    typed.current = out;
    clearIdle();
    const sitting = editingNow.current;
    if (!sitting) return;
    const pending = wordsToSave({ typed: out, posted: posted.current, original: sitting.text });
    try {
      if (pending === null) localStorage.removeItem(draftKey(sitting.base.path));
      else localStorage.setItem(draftKey(sitting.base.path), pending);
    } catch { /* the words are still in the page */ }
    if (pending === null) return;
    setEditWord('Saved');
    idle.current = window.setTimeout(() => { void postNow.current(); }, SAVE_AFTER_A_PAUSE_MS);
  }, [product]);
  const saveNow = useCallback(() => {
    clearIdle();
    if (flushEdit.current) typed.current = flushEdit.current();
    void postNow.current();
  }, []);
  useEffect(() => {
    window.addEventListener('blur', saveNow);
    return () => window.removeEventListener('blur', saveNow);
  }, [saveNow]);
  useEffect(() => () => {
    clearIdle();
    if (flushEdit.current) typed.current = flushEdit.current();
    void postNow.current();
  }, []);
  const endSitting = async () => {
    if (!editingNow.current) return true;
    clearIdle();
    if (flushEdit.current) typed.current = flushEdit.current();
    if (!(await postEdit())) return false;
    setEditing(null);
    setEditWord(null);
    return true;
  };
  // After a failed save the next press goes anyway, and the words wait in the draft.
  const dropSitting = () => {
    const sitting = editingNow.current;
    const words = flushEdit.current?.() ?? typed.current;
    if (sitting && words !== null) { try { localStorage.setItem(draftKey(sitting.base.path), words); } catch { /* nothing kept */ } }
    typed.current = null;
    clearIdle();
    setEditing(null);
    setEditWord(null);
    setTold(null);
  };
  // A live file's words are in the room as well, so a save that is refused keeps
  // them as a draft here and lets the person go, rather than holding them in the file.
  const away = (go: () => void) => {
    if (!editingNow.current) { go(); return; }
    if (editWord === 'Not saved') { dropSitting(); go(); return; }
    void endSitting().then((ok) => { if (ok) go(); else if (liveSession) { dropSitting(); go(); } });
  };
  // A click on a picture drops a pin; one left with no words is not kept for next time.
  const dropAnEmptyPin = () => {
    const d = draftOf.current;
    if (d && draftPlace && !wordsNow.current.trim()) d.holding = keepCommentDraft({ product, thread, file: d.file, across }, { words: wordsNow.current, place: null }, d.holding);
  };
  const leave = () => {
    dropAnEmptyPin();
    if (!editing) { onClose(); return; }
    if (editWord === 'Not saved') { dropSitting(); onClose(); return; }
    void endSitting().then((ok) => { if (ok) onClose(); else if (liveSession) { dropSitting(); onClose(); } });
  };
  useEffect(() => {
    if (editing && family && editing.fam !== family.key) void endSitting();
  }, [family?.key]);
  const liveQuotes = useMemo(() => [...notesHere, ...carried].flatMap((n) => (n.place.kind === 'quote' && !n.resolved ? [{ id: n.id, text: n.place.text }] : [])), [notesHere, carried]);
  const [goneQuotes, setGoneQuotes] = useState<string[]>([]);
  const noteGone = useCallback((ids: string[]) => setGoneQuotes((was) => (was.join() === ids.join() ? was : ids)), []);
  useEffect(() => { setGoneQuotes([]); }, [version?.id]);
  const draftQuote = placeNow.kind === 'quote' ? placeNow.text : null;
  const paintEditor = (root: HTMLElement) => {
    const found = paintQuotes(root, liveQuotes, activeId, draftQuote);
    editRanges.current = found;
    if (canPaintQuotes()) noteGone(liveQuotes.filter((q) => !found.has(q.id)).map((q) => q.id));
  };
  useEffect(() => {
    const root = editPane.current?.querySelector<HTMLElement>('.ProseMirror');
    if (editing && root) paintEditor(root);
  }, [editing, draftQuote, activeId, quotesKey(liveQuotes)]);
  // A press on words a comment is about opens that comment, as it does when reading.
  const pickInEditor = (e: ReactMouseEvent) => {
    if (window.getSelection()?.isCollapsed === false) return;
    const caret = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!caret) return;
    for (const [id, range] of editRanges.current) {
      if (!range.isPointInRange(caret.startContainer, caret.startOffset)) continue;
      const n = [...notesHere, ...carried].find((x) => x.id === id);
      if (n) pickNote(n);
      return;
    }
  };
  const othersSaved = editing ? editClash(family, editing.base.n, me, nameOf) : null;

  // Opened from anywhere but a turn of the thread, a picture of the agent's latest answer steps through that answer.
  const steps = handedSteps.length ? handedSteps : latestSteps.some((s) => s.fi === at?.fi) ? latestSteps : [];
  const stepTo = (by: number) => nextStep(families, steps, at, by);
  const stepFile = (by: number) => {
    const next = stepTo(by);
    if (!next) return;
    away(() => {
      setSavedIn(null);
      setAt(next);
      setActiveId(null);
    });
  };
  const stepVersion = (by: number) => {
    if (!at || !family) return;
    const vi = Math.max(0, Math.min(family.versions.length - 1, at.vi + by));
    away(() => {
      setSavedIn(null);
      setAt({ fi: at.fi, vi });
      setActiveId(null);
    });
  };

  // Escape first of all, ahead of the app's own. Every other key still reaches the
  // box and the players, which React hears at the page, and stops at the document
  // on its way up, so the thread behind stays still.
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pressedInTheFindBox(e.target) || document.querySelector('[data-own-escape]')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (link) setLink(null);
      else if (asking) setAsking(null);
      else if (replyingTo) setReplyingTo(null);
      // Not a pin first: a click on a picture drops one, and Escape then seemed to do nothing.
      else leave();
    };
    const rest = (e: KeyboardEvent) => {
      const at = e.target as HTMLElement | null;
      const typing = at?.tagName === 'TEXTAREA' || !!at?.isContentEditable;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !typing && !e.defaultPrevented && unsent.ids.length) {
        e.preventDefault(); e.stopPropagation(); void sendAll(); return;
      }
      if (e.metaKey || e.ctrlKey) return;
      e.stopPropagation();
      if (typing || followsTheFile || pressedInTheFindBox(e.target)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stepFile(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepFile(-1); }
    };
    window.addEventListener('keydown', escape, true);
    document.addEventListener('keydown', rest);
    return () => { window.removeEventListener('keydown', escape, true); document.removeEventListener('keydown', rest); };
  });

  // Only your own agent is in the list, and only on a file it made on your thread.
  const canTag = withAgent && typeof version?.agent === 'string';
  const askingFor = asking ? [
    ...(canTag && 'agent'.startsWith(asking.query.toLowerCase()) ? [YOUR_AGENT] : []),
    ...people.filter((p) => p.id !== me && firstName(p).toLowerCase().startsWith(asking.query.toLowerCase())),
  ].slice(0, 5) : [];
  const nameInto = (p: Person) => {
    if (!asking) return;
    const el = box.current;
    const caret = el?.selectionStart ?? words.length;
    const name = p === YOUR_AGENT ? '@agent ' : `@${firstName(p)} `;
    setWords(`${words.slice(0, asking.start)}${name}${words.slice(caret)}`);
    if (p !== YOUR_AGENT) setNamed((was) => (was.some((x) => x.id === p.id) ? was : [...was, p]));
    setAsking(null);
    requestAnimationFrame(() => { const to = asking.start + name.length; el?.focus(); el?.setSelectionRange(to, to); });
  };
  const onWords = (value: string, caret: number) => {
    setWords(value);
    const m = people.length || canTag ? /(^|\s)@(\w*)$/.exec(value.slice(0, caret)) : null;
    setAsking(m ? { start: caret - m[2].length - 1, query: m[2], sel: 0 } : null);
  };
  // Rooms keep their files outside any project, so there is nowhere to save a picture.
  const canAddPictures = !!product && !!window.zero?.saveAttachments;
  const addPictures = async (list: FileList | File[] | null) => {
    if (!list?.length) return;
    const all = await collect(list);
    const got = all.filter((a) => a.image || a.failed);
    setTrouble(got.length < all.length ? 'Only pictures can go on a note.' : null);
    if (got.length) setPictures((was) => [...was, ...got]);
  };
  const onBoxKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (asking && askingFor.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAsking({ ...asking, sel: (asking.sel + 1) % askingFor.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAsking({ ...asking, sel: (asking.sel - 1 + askingFor.length) % askingFor.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); nameInto(askingFor[asking.sel]); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !words.trim() && !pictures.length && unsent.ids.length) { e.preventDefault(); void sendAll(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  const hint = kind === 'image' ? 'Click the picture to pin a note'
    : kind === 'table' ? 'Right-click a cell to note it'
    : kind === 'markdown' || kind === 'code' ? 'Select words to note them'
      : kind === 'deck' || kind === 'pdf' ? 'Click a spot to pin a note'
        : kind === 'page' ? 'Press Pin a spot, then click the page'
          : kind === 'film' ? 'Pause the film and click it to pin a note'
            : null;
  const agentMade = typeof version?.agent === 'string';
  const sendWords = noteSendWords({
    text: words, people, me, nameOf, agentMade,
    toAgent: withAgent,
    owner: version ? whoseIsTheFile(files, version.id) : null,
  });

  const heldFor = (n: FileNote): { words: string; went: boolean } | null => {
    if (n.sent || !offers.comment || typeof flat.find((x) => x.v.id === n.file)?.v.agent !== 'string') return null;
    const goes = noteGoesTo(n, people);
    if (goes.to === 'person') return { words: `Sent to ${goes.person === me ? 'you' : nameOf(goes.person)}`, went: true };
    return withAgent && n.by === me && goes.to === 'agent' && stillWaiting(n) ? { words: 'Not sent', went: false } : null;
  };
  const answeredBy = (n: FileNote): string | null => {
    const v = n.resolved && n.resolvedIn ? flat.find((x) => x.v.id === n.resolvedIn)?.v : undefined;
    return v ? resolvedInWords(v, { me, nameOf }) : null;
  };
  const card = (n: FileNote) => (
    <FileNoteCard key={n.id} note={n} product={product} answeredBy={answeredBy(n)} wordsGone={goneQuotes.includes(n.id)} active={n.id === activeId} settling={n.id === undo} person={person} me={me} onGo={() => pickNote(n)} onSettle={(r) => void settle(n, r)} nameOf={nameOf}
      canReply={offers.comment} replying={replyingTo === n.id} onReplying={(on) => setReplyingTo(on ? n.id : null)} onReply={(text) => reply(n, text)}
      held={heldFor(n)} />
  );

  const bylineOf = (v: { by: string | null; at: number; n: number; agent?: string }) => [
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
      onPlace={editable ? (p) => { setWholeAsked(false); setDraftPlace(p); box.current?.focus(); } : undefined}
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
    <StageThread.Provider value={thread}><StageProject.Provider value={project}>
    <StageLink.Provider value={setLink}>
    <div className="artifact-view" data-find-layer role="dialog" aria-label={version?.name ?? 'File'}>
      <header className="av-top">
        <button type="button" className="doc-mark av-back" aria-label="Back" title="Back to the thread (esc)" onClick={leave}><ArtifactControlGlyph><path d="M16 10H4m5-5-5 5 5 5" /></ArtifactControlGlyph></button>
        <span className="av-name">{familyName(family, editing?.base ?? version) || ((editing?.base ?? version)?.name ?? '')}</span>
        {family && version && family.versions.length > 1 && (
          <span className="av-versions">
            <button type="button" className="av-chev" disabled={at!.vi === 0} onClick={() => stepVersion(-1)} aria-label="Older version">‹</button>
            <span className="av-of">v{version.n} of {family.versions.length}</span>
            <button type="button" className="av-chev" disabled={at!.vi === family.versions.length - 1} onClick={() => stepVersion(1)} aria-label="Newer version">›</button>
            {!isNewest && <button type="button" className="av-newest" onClick={() => stepVersion(family.versions.length - 1 - at!.vi)}>Show v{family.versions[family.versions.length - 1].n}</button>}
          </span>
        )}
        <span className="av-spring" />
        {editing && editWord && <span className="av-saved" role="status">{editWord}</span>}
        {canRestore && !editing && <button type="button" className="av-btn" disabled={restoring} onClick={() => void restore()}><NoteGlyph name="undo" />Restore this version</button>}
        <span className="doc-marks">
          {(thread ?? shareThread) && version && foundNow === 'open' && canShareFile(version.path) && (
            <ShareLink icon product={product} thread={(thread ?? shareThread)!} src={version.path} signedIn={!!me} />
          )}
          {onOutside && version && foundNow === 'open' && <button type="button" className="doc-mark" aria-label="Open outside" title="Open outside" onClick={() => onOutside(version.path)}><ArtifactControlGlyph kind="open" /></button>}
          {/* The side pane has no versions to step, so it shows the newest. */}
          {onBeside && family && <FocusControl style="corners-bare" focused onClick={() => onBeside(family.versions[family.versions.length - 1].path)} />}
          <button type="button" className="doc-mark av-close" aria-label="Close" title="Close (esc)" onClick={leave}><ArtifactControlGlyph kind="close" /></button>
        </span>
      </header>
      <div className="av-body">
        <div className="av-stage">
          {!version && <OpeningWait name={open.path?.split('/').pop() || 'This file'} kind={null} />}
          {(othersSaved || told) && <p className="av-told" role="status">{othersSaved ?? told}</p>}
          {approveAsked && version && (
            <p className="av-told av-ask" role="alertdialog">
              {approveAsked.text}
              {approveAsked.newest && <button type="button" className="av-btn is-on" onClick={() => approveNewest(approveAsked.newest!)}>Approve v{approveAsked.newest.n}</button>}
              <button type="button" className="av-btn" onClick={() => void approveNow(version)}>Approve v{version.n} anyway</button>
              <button type="button" className="av-btn" onClick={() => setApproveAsked(null)}>Not yet</button>
            </p>
          )}
          {editing && (
            <div className="av-pane" key={`editing-${editing.base.id}`} ref={editPane} onClick={pickInEditor}>
              {liveTicket !== undefined && <DocText product={product} src={editing.base.path} text={incoming ?? editing.text} mtime={0} folder={editing.folder} onSaved={() => {}} onNotice={setTold} live={liveSession}
                versions={{ onDraft, saveNow, flush: flushEdit, paint: paintEditor, draft: editing.draft, byline: bylineOf(version ?? editing.base), focus: typing }} />}
              {offers.comment && <SelectionBar page={editPane} onComment={(quote) => { setWholeAsked(false); setDraftPlace({ kind: 'quote', text: quote }); box.current?.focus(); }} />}
            </div>
          )}
          {version && waitingForEditor && <OpeningWait name={version.name} kind="markdown" />}
          {version && !editing && !waitingForEditor && <div className="av-pane" key={paneKey(kind, version)}>{stage(version.path, version.id, version.name, true, version)}</div>}
          {(steps.length ? steps.length : families.length) > 1 && at && <>
            <button type="button" className="av-step av-prev" disabled={!stepTo(-1)} onClick={() => stepFile(-1)} aria-label="Previous file">‹</button>
            <button type="button" className="av-step av-next" disabled={!stepTo(1)} onClick={() => stepFile(1)} aria-label="Next file">›</button>
          </>}
          {offers.comment && unsent.ids.length > 0 && !link && (
            <div className="av-unsent-bar" role="status">
              <span className="av-unsent-dot" aria-hidden="true" />
              <span>{unsentWords(unsent.ids.length, unsent.elsewhere, unsent.elsewhereKind)}</span>
              <button type="button" className="av-btn av-unsent-send" onClick={() => void sendAll()}>Send all<kbd>{SEND}</kbd></button>
            </div>
          )}
          {link && <FileLinkBrowser key={link} url={link} product={product} backTo={kind ? `the ${KIND_WORD[kind].toLowerCase()}` : 'the file'} onClose={closeLink} />}
        </div>
        {(foundNow === 'looking' || offers.comment || openNotes.length > 0 || settled.length > 0) && <aside className="av-side" aria-label="Notes">
          <NotesHead count={openNotes.length} faces={authors.length > 0 && authors.map((id) => <Face key={id ?? 'me'} person={person(id)} name={person(id) ? undefined : nameOf(id)} me={!!me && id === me} />)} />
          {(offers.approve || othersApproved.length > 0 || earlier) && (
            <div className="av-verdict">
              <span className="av-verdict-who" title={earlier ? approvalSince(family, at!.vi, marks.approvals, nameOf) ?? undefined : undefined}>
                {othersApproved.length > 0 ? `${othersApproved.map((a) => nameOf(a.by)).join(', ')} approved`
                  : earlier ? (version?.edited ? approvalSince(family, at!.vi, marks.approvals, nameOf) : `v${earlier.n} approved, this version is not`) : null}
              </span>
              {offers.approve && <button type="button" className={`av-btn${mineApproved ? ' is-on' : ''}`} aria-pressed={mineApproved} onClick={() => void approve()}><NoteGlyph name="check" />{mineApproved ? 'Approved' : 'Approve'}</button>}
            </div>
          )}
          <div className="av-list">
            {waitingHere.length > 0 && <NotesSection word="Unsent" send={{ count: sendNotes.length, onSend: () => void pressSend() }} />}
            {waitingHere.map(card)}
            {waitingHere.length > 0 && sentAlready.length > 0 && <NotesSection word="Sent" />}
            {sentAlready.map(card)}
            {settled.length > 0 && (
              <button type="button" className="av-note-act av-settled" aria-expanded={showSettled} onClick={() => setShowSettled(!showSettled)}>
                <NoteGlyph name={showSettled ? 'up' : 'down'} />{showSettled ? 'Hide resolved' : `Show resolved (${settled.length})`}
              </button>
            )}
            {showSettled && settled.map(card)}
            {offers.comment && hint && !draftPlace && !openNotes.length && !(showSettled && settled.length) && (
              <div className="av-empty"><NoteGlyph name="pin" /><span>{hint}</span></div>
            )}
          </div>
          {(offers.comment || trouble) && <div className="av-foot">
            {trouble && <p className="av-trouble" role="alert">{trouble}</p>}
            {offers.comment && <form className="av-write" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              {asking && askingFor.length > 0 && (
                <div className="av-names" role="listbox">
                  {askingFor.map((p, i) => (
                    <button type="button" role="option" aria-selected={i === asking.sel} key={p.id} className={`av-name-row${i === asking.sel ? ' is-on' : ''}`} onMouseDown={(e) => { e.preventDefault(); nameInto(p); }}>
                      {p === YOUR_AGENT ? <><AgentFace />Your agent</> : <><Face person={p} />{p.name}</>}
                    </button>
                  ))}
                </div>
              )}
              <div className="av-write-box" onClick={(e) => { if (e.target === e.currentTarget) box.current?.focus(); }}
                onDragOver={canAddPictures ? (e) => e.preventDefault() : undefined}
                onDrop={canAddPictures ? (e) => { e.preventDefault(); void addPictures(e.dataTransfer.files); } : undefined}>
                <textarea ref={box} rows={2} value={words} placeholder={canTag ? 'Add a note, or @ your agent' : 'Add a note'} aria-label="Comment"
                  onChange={(e) => onWords(e.target.value, e.target.selectionStart)}
                  onFocus={() => setHold((n) => n + 1)}
                  onPaste={canAddPictures ? async (e) => {
                    if (![...e.clipboardData.items].some((i) => i.kind === 'file')) return;
                    e.preventDefault();
                    const got = await fromPaste(e);
                    if (got.length) setPictures((was) => [...was, ...got]);
                  } : undefined}
                  onKeyDown={onBoxKey} />
                <AttachRow attachments={pictures} attaching={attaching} onRemove={(i) => setPictures((was) => was.filter((_, j) => j !== i))} />
                <div className="av-write-foot">
                  {canAddPictures && <>
                    <button type="button" className="av-write-picture" title="Add a picture" aria-label="Add a picture" onClick={() => pictureInput.current?.click()}><NoteGlyph name="picture" /></button>
                    <input ref={pictureInput} type="file" accept="image/*" multiple hidden onChange={async (e) => { await addPictures(e.target.files); e.target.value = ''; }} />
                  </>}
                  {chip && (
                    <span className="av-chip">
                      {pinned(placeNow) && <NoteGlyph name="pin" />}
                      <span className="av-chip-words">{chip}</span>
                      <button type="button" className="av-chip-off" aria-label="Note on the whole file instead" title="Note on the whole file instead"
                        onClick={() => { setDraftPlace(null); setWholeAsked(followsTheFile); }}><CrossIcon /></button>
                    </span>
                  )}
                  <button type="submit" className="av-btn av-write-send" disabled={(!words.trim() && !pictures.length) || sending || attaching.length > 0 || !!attachProblem(pictures)}>
                    {sendWords === 'Comment' ? <ReturnGlyph /> : <><NoteGlyph name="send" />{sendWords}</>}
                  </button>
                </div>
              </div>
            </form>}
          </div>}
        </aside>}
      </div>
      {below}
    </div>
    </StageLink.Provider>
    </StageProject.Provider></StageThread.Provider>,
    document.body,
  );
}
